const net = require('net')

// Comandi ESC/POS
const ESC = '\x1B'
const GS = '\x1D'
const RESET = ESC + '@'
const BOLD_ON = ESC + '\x45\x01'
const BOLD_OFF = ESC + '\x45\x00'
const CENTER = ESC + '\x61\x01'
const LEFT = ESC + '\x61\x00'
const RIGHT = ESC + '\x61\x02'
const BIG = GS + '\x21\x11'
const NORMAL = GS + '\x21\x00'
const CUT = GS + '\x56\x00'
const FEED = '\n'

function buildComanda(tavolo, righe, tipo = 'comanda', uscita = null, totaleUscite = 1) {
  let doc = ''
  doc += RESET
  doc += CENTER
  doc += BOLD_ON + BIG

  if (tipo === 'comanda') {
    doc += `TAVOLO ${tavolo}\n`
    doc += NORMAL + BOLD_OFF
    if (uscita && totaleUscite > 1) {
      doc += BOLD_ON + `*** USCITA ${uscita} di ${totaleUscite} ***\n` + BOLD_OFF
    }
    doc += `${new Date().toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}\n`
    doc += LEFT
    doc += '--------------------------------\n'
    for (const r of righe) {
      doc += BOLD_ON
      doc += `${r.quantita > 1 ? r.quantita + 'x ' : '   '}${r.nome}\n`
      doc += BOLD_OFF
      if (r.nota) doc += `   >> ${r.nota}\n`
    }
    doc += '--------------------------------\n'
  } else if (tipo === 'preconto') {
    doc += `PRECONTO\n`
    doc += NORMAL + BOLD_OFF
    doc += `Tavolo ${tavolo}\n`
    doc += LEFT
    doc += '--------------------------------\n'
    for (const r of righe) {
      const prezzo = ((r.totaleRiga || 0) / 100).toFixed(2)
      const nome = `${r.quantita > 1 ? r.quantita + 'x ' : '   '}${r.nome}`
      const spazi = Math.max(1, 32 - nome.length - prezzo.length)
      doc += nome + ' '.repeat(spazi) + prezzo + '\n'
    }
    doc += '--------------------------------\n'
    const totale = (righe.reduce((s, r) => s + (r.totaleRiga || 0), 0) / 100).toFixed(2)
    doc += BOLD_ON + RIGHT + `TOTALE: EUR ${totale}\n` + BOLD_OFF
    doc += LEFT + '--------------------------------\n'
    doc += CENTER + '\n'
    doc += BOLD_ON + '*** RITIRARE LO SCONTRINO ALLA CASSA ***\n'
    doc += BOLD_OFF
  }

  doc += FEED + FEED + FEED
  doc += CUT
  return doc
}

async function inviaTCP(ip, porta, dati) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    client.setTimeout(5000)
    client.connect(parseInt(porta || 9100), ip, () => {
      client.write(dati)
      setTimeout(() => { client.destroy(); resolve('OK') }, 500)
    })
    client.on('error', reject)
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout stampante')) })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })

  const { ip, porta = 9100, tavolo, righe, tipo = 'comanda', uscita, totaleUscite } = req.body

  if (!ip) return res.status(400).json({ error: 'IP stampante mancante' })
  if (!righe?.length) return res.status(400).json({ error: 'Nessuna riga da stampare' })

  try {
    const doc = buildComanda(tavolo, righe, tipo, uscita, totaleUscite)
    await inviaTCP(ip, porta, doc)
    return res.json({ ok: true })
  } catch (err) {
    console.error('Errore stampante:', err.message)
    return res.status(200).json({ ok: false, error: err.message })
  }
}
