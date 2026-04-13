const net = require('net')

async function inviaTCP(ip, porta, comando) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let risposta = ''

    client.setTimeout(8000)

    client.connect(parseInt(porta), ip, () => {
      client.write(comando + '\r\n')
    })

    client.on('data', (data) => {
      risposta += data.toString()
    })

    client.on('end', () => {
      client.destroy()
      resolve(risposta || 'OK')
    })

    client.on('close', () => {
      client.destroy()
      resolve(risposta || 'OK')
    })

    client.on('timeout', () => {
      client.destroy()
      reject(new Error('Timeout cassa'))
    })

    client.on('error', (err) => {
      client.destroy()
      reject(err)
    })

    // Chiudi dopo 2 secondi se non arriva end
    setTimeout(() => {
      if (risposta) {
        client.destroy()
        resolve(risposta)
      }
    }, 2000)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })

  const { ip, porta = 1471, azione, dati } = req.body
  if (!ip) return res.status(400).json({ error: 'IP mancante' })

  try {
    let comando = ''

    switch (azione) {
      case 'ping':
      case 'lettura_x':
        comando = 'report num=2'
        break
      case 'chiusura_fiscale':
        comando = `azzgio tipo=${dati?.tipo || 1}`
        break
      case 'scontrino': {
        const lines = []
        if (dati.contatto) lines.push(`cfis cf='${dati.contatto}'`)
        for (const riga of (dati.righe || [])) {
          const rep = riga.numeroRepartoRt || 1
          const prezzo = (riga.importo / 100).toFixed(2)
          const qty = riga.quantita || 1
          const des = (riga.nome || '').substring(0, 24).replace(/'/g, ' ')
          if (qty > 1) lines.push(`vend rep=${rep}, pre=${prezzo}, qty=${qty}, des='${des}'`)
          else lines.push(`vend rep=${rep}, pre=${prezzo}, des='${des}'`)
        }
        const tot = (dati.totale / 100).toFixed(2)
        lines.push(dati.metodo === 'contanti' ? `chius t=1, imp=${tot}` : `chius t=5, imp=${tot}`)
        comando = lines.join('\n')
        break
      }
      case 'annullo':
        comando = `docannullo mat='${dati.matricola}', nazz=${dati.numeroAzzeramento}, ndoc=${dati.numeroDocumento}, data=${dati.data}`
        break
      case 'ristampa':
        comando = `dgfe tipo=160, datada=${dati.dataInizio}, dataa=${dati.dataFine}, nda=${dati.dalNumero}, na=${dati.alNumero}`
        break
      default:
        return res.status(400).json({ error: `Azione non riconosciuta: ${azione}` })
    }

    const risposta = await inviaTCP(ip, porta, comando)
    return res.json({ ok: true, risposta, comando })

  } catch (err) {
    console.error('Errore Ditron:', err.message)
    let msg = err.message
    if (err.message.includes('ECONNREFUSED')) msg = 'Cassa non raggiungibile'
    else if (err.message.includes('ETIMEDOUT') || err.message.includes('Timeout')) msg = 'Timeout — la cassa non risponde'
    return res.status(200).json({ ok: false, error: msg })
  }
}
