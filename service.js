/**
 * DigitalCase — Service Stampante Locale
 * Riceve richieste HTTP e le manda alla stampante via TCP ESC/POS
 */
const http = require('http')
const net = require('net')

const PORT = 3002

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

function buildComanda(tavolo, righe, tipo, uscita, totaleUscite) {
  let doc = ''
  doc += RESET
  doc += CENTER + BOLD_ON + BIG

  if (tipo === 'comanda') {
    doc += `TAVOLO ${tavolo}\n`
    doc += BOLD_OFF
    if (uscita && totaleUscite > 1) {
      doc += BOLD_ON + `*** USCITA ${uscita} di ${totaleUscite} ***\n` + BOLD_OFF
    }
    const now = new Date()
    const dataOra = now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})
    doc += `${dataOra}\n`
    doc += LEFT + '--------------------------------\n'
    doc += BOLD_ON + BIG
    for (const r of righe) {
      if (r.id === 'coperto') {
        doc += `  COPERTO x${r.quantita}\n`
      } else {
        doc += `${r.quantita > 1 ? r.quantita + 'x ' : '   '}${r.nome}\n`
      }
      if (r.nota) doc += NORMAL + `   >> ${r.nota}\n` + BIG
    }
    doc += NORMAL + BOLD_OFF
    doc += '--------------------------------\n'
  } else if (tipo === 'preconto') {
    doc += `PRECONTO\n`
    doc += NORMAL + BOLD_OFF
    doc += `Tavolo ${tavolo}\n`
    doc += LEFT + '--------------------------------\n'
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
    doc += BOLD_ON + '*** RITIRARE LO SCONTRINO ***\n'
    doc += '***      ALLA CASSA          ***\n' + BOLD_OFF
  }

  doc += FEED + FEED + FEED + CUT
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
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout')) })
  })
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    try {
      const { ip, porta, tavolo, righe, tipo, uscita, totaleUscite } = JSON.parse(body)
      const doc = buildComanda(tavolo, righe, tipo || 'comanda', uscita, totaleUscite)
      await inviaTCP(ip, porta || 9100, doc)
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({ ok: true }))
      console.log(`✓ Stampato: Tavolo ${tavolo} - ${righe.length} righe - tipo: ${tipo}`)
    } catch (err) {
      console.error('Errore stampa:', err.message)
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })
})

server.listen(PORT, () => {
  console.log(`🖨️  Service stampante attivo su http://localhost:${PORT}`)
})
