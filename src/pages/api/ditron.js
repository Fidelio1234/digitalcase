/**
 * /api/ditron.js — API Next.js per comunicazione con Ditron RT
 * 
 * Questo file va in: src/pages/api/ditron.js
 * 
 * Uso: POST /api/ditron
 * Body: { ip, porta, comando, matricola }
 * 
 * Il Ditron usa il protocollo WinEcrCom via TCP.
 * Questa API fa da ponte tra il browser e la cassa sulla rete locale.
 */

const net = require('net')

// Timeout connessione in ms
const TIMEOUT = 8000

/**
 * Invia un comando alla cassa Ditron via TCP
 */
async function inviaDitron(ip, porta, comando) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let risposta = ''
    let timeoutId

    client.setTimeout(TIMEOUT)

    timeoutId = setTimeout(() => {
      client.destroy()
      reject(new Error('Timeout connessione cassa'))
    }, TIMEOUT)

    client.connect(parseInt(porta), ip, () => {
      // Invia il comando con terminatore CR+LF
      client.write(comando + '\r\n')
    })

    client.on('data', (data) => {
      risposta += data.toString()
      // La risposta Ditron termina con un carattere speciale o stringa vuota
      // Aspettiamo un po' per raccogliere tutta la risposta
    })

    client.on('end', () => {
      clearTimeout(timeoutId)
      client.destroy()
      resolve(risposta)
    })

    client.on('close', () => {
      clearTimeout(timeoutId)
      resolve(risposta)
    })

    client.on('error', (err) => {
      clearTimeout(timeoutId)
      client.destroy()
      reject(err)
    })

    client.on('timeout', () => {
      clearTimeout(timeoutId)
      client.destroy()
      reject(new Error('Timeout cassa'))
    })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' })
  }

  const { ip, porta = 7081, azione, dati } = req.body

  if (!ip) {
    return res.status(400).json({ error: 'IP cassa mancante' })
  }

  try {
    let comando = ''
    let risposta = ''

    switch (azione) {

      // ── STAMPA SCONTRINO ────────────────────────────────────────────────
      case 'scontrino': {
        const { righe, metodo, totale, resto, contatto } = dati
        const { buildScontrino } = require('@/lib/ditron')
        comando = buildScontrino(righe, metodo, totale, resto, contatto)
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── CHIUSURA FISCALE Z ──────────────────────────────────────────────
      case 'chiusura_fiscale': {
        const tipo = dati?.tipo || 1
        comando = `azzgio tipo=${tipo}`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── LETTURA X (parziale) ────────────────────────────────────────────
      case 'lettura_x': {
        const tipo = dati?.tipo || 2
        comando = `report num=${tipo}`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── ANNULLO SCONTRINO RT ────────────────────────────────────────────
      case 'annullo': {
        const { matricola, numeroAzzeramento, numeroDocumento, data } = dati
        if (!matricola || !numeroAzzeramento || !numeroDocumento || !data) {
          return res.status(400).json({ error: 'Dati annullo incompleti' })
        }
        comando = `docannullo mat='${matricola}', nazz=${numeroAzzeramento}, ndoc=${numeroDocumento}, data=${data}`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── RISTAMPA SCONTRINI DA DGFE ──────────────────────────────────────
      case 'ristampa': {
        const { dataInizio, dataFine, dalNumero = 0, alNumero = 0 } = dati
        if (!dataInizio || !dataFine) {
          return res.status(400).json({ error: 'Date ristampa mancanti' })
        }
        // Formato data Ditron: DDMMYY
        comando = `dgfe tipo=160, datada=${dataInizio}, dataa=${dataFine}, nda=${dalNumero}, na=${alNumero}`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── LETTURA DGFE ────────────────────────────────────────────────────
      case 'dgfe': {
        const { dataInizio, dataFine } = dati
        comando = `dgfe tipo=166, datada=${dataInizio}, dataa=${dataFine}`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── TOTALI GIORNO ────────────────────────────────────────────────────
      case 'totali_giorno': {
        comando = `leggi nf=20`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      // ── PING / TEST CONNESSIONE ──────────────────────────────────────────
      case 'ping': {
        comando = `report num=2`
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, connessa: true, risposta })
      }

      // ── PROGRAMMA REPARTI ────────────────────────────────────────────────
      case 'programma_reparti': {
        const { reparti } = dati
        const linee = ['prog']
        for (const r of reparti) {
          const des = (r.nome || '').substring(0, 24).replace(/'/g, ' ')
          linee.push(`prep nr=${r.numeroRt}, des='${des}', lis=10000.00, bat=si, iva=${r.ivaIndice || 1}, gru=1, sconto=si`)
        }
        linee.push('fineprog')
        comando = linee.join('\n')
        risposta = await inviaDitron(ip, porta, comando)
        return res.json({ ok: true, risposta, comando })
      }

      default:
        return res.status(400).json({ error: `Azione non riconosciuta: ${azione}` })
    }

  } catch (err) {
    console.error('Errore Ditron:', err.message)
    
    // Messaggio utente friendly
    let messaggio = err.message
    if (err.message.includes('ECONNREFUSED')) {
      messaggio = 'Cassa non raggiungibile — verifica che sia accesa e connessa alla rete'
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('Timeout')) {
      messaggio = 'Timeout — la cassa non risponde'
    } else if (err.message.includes('ENOTFOUND')) {
      messaggio = 'IP cassa non trovato sulla rete'
    }

    return res.status(200).json({ ok: false, error: messaggio })
  }
}
