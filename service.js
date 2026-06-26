/**
 * DigitalCase — Service Locale
 * - Porta 3002: stampante comande (ESC/POS)
 * - Gestisce anche registratore telematico (Ditron/3i via TCP, RCH via HTTP)
 */
const http = require('http')
const net = require('net')
const fs = require('fs')

// ─── CONFIGURAZIONE (.env.local) ──────────────────────────────────────────────
let env = {}
try {
  fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=')
    const v = rest.join('=')
    if (k && v) env[k.trim()] = v.trim()
  })
} catch (e) {}

const SHUTDOWN_TOKEN = env.SHUTDOWN_TOKEN || null

const ORIGIN_REGEX = /^https?:\/\/([a-z0-9-]+\.)?digitalcase\.it$|^https?:\/\/localhost(:\d+)?$|^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/i

function originConsentito(origin) {
  if (!origin) return true
  return ORIGIN_REGEX.test(origin)
}

let keepAliveInterval = null

function avviaKeepAlive(ip, porta) {
  if (keepAliveInterval) return
  keepAliveInterval = setInterval(async () => {
    try {
      await inviaTCPRT(ip, porta, 'K', '3i')
      console.log('Keep-alive 3i OK')
    } catch(e) {
      console.log('Keep-alive 3i fallito:', e.message)
    }
  }, 60000)
  console.log(`Keep-alive avviato per ${ip}:${porta}`)
}

const PORT = 3002

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
    doc += LEFT + '-----------------------\n'
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
    doc += BOLD_ON + '*** RITIRARE LO SCONTRINO ALLA CASSA ***\n\n'
    doc += + BOLD_OFF
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

async function inviaTCPRT(ip, porta, comando, marca) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let risposta = ''
    client.setTimeout(8000)
    client.connect(parseInt(porta), ip, () => {
      const terminatore = marca === '3i' ? '\r' : '\r\n'
      client.write(comando + terminatore)
    })
    client.on('data', d => risposta += d.toString())
    client.on('end', () => { client.destroy(); resolve(risposta || 'OK') })
    client.on('close', () => { client.destroy(); resolve(risposta || 'OK') })
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout cassa')) })
    client.on('error', err => {
      client.destroy()
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') resolve(risposta || 'OK')
      else reject(err)
    })
    setTimeout(() => { if (risposta) { client.destroy(); resolve(risposta) } }, 2000)
  })
}

async function inviaTCP3i(ip, porta, comandi) {
  let rispostaFinale = ''
  for (const cmd of comandi) {
    const risposta = await new Promise((resolve, reject) => {
      const client = new net.Socket()
      let risposta = ''
      client.setTimeout(3000)
      client.connect(parseInt(porta), ip, () => client.write(cmd + '\r'))
      client.on('data', d => risposta += d.toString())
      client.on('end', () => { client.destroy(); resolve(risposta || 'OK') })
      client.on('close', () => { client.destroy(); resolve(risposta || 'OK') })
      client.on('error', err => {
        client.destroy()
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') resolve(risposta || 'OK')
        else reject(err)
      })
      client.on('timeout', () => { client.destroy(); resolve(risposta || 'OK') })
    })
    rispostaFinale = risposta
    await new Promise(r => setTimeout(r, 200))
  }
  return rispostaFinale
}

async function inviaRCH(ip, porta, comandi) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Service>\n${comandi.map(c => `  <cmd>${c}</cmd>`).join('\n')}\n</Service>`
  const res = await fetch(`http://${ip}:${porta}/service.cgi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
    signal: AbortSignal.timeout(10000)
  })
  const testo = await res.text()
  const errorCode = testo.match(/<errorCode>(\d+)<\/errorCode>/)?.[1] || '0'
  const busy = testo.match(/<busy>(\d+)<\/busy>/)?.[1] || '0'
  const lastCmd = testo.match(/<lastCmd>(\d+)<\/lastCmd>/)?.[1] || '0'
  if (busy === '1') throw new Error('Cassa occupata')
  if (errorCode !== '0') throw new Error(`Errore cassa E${errorCode}`)
  return { ok: true, lastCmd: parseInt(lastCmd) }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers['origin']

  if (!originConsentito(origin)) {
    console.warn(`⚠️  Richiesta bloccata da Origin non autorizzata: ${origin}`)
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Origin non autorizzata' }))
    return
  }

  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-shutdown-token')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return }

  if (req.url === '/shutdown') {
    if (!SHUTDOWN_TOKEN) {
      console.warn('⚠️  /shutdown richiamato ma SHUTDOWN_TOKEN non configurato: rifiutato.')
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Shutdown non configurato' }))
      return
    }
    const tokenRicevuto = req.headers['x-shutdown-token']
    if (tokenRicevuto !== SHUTDOWN_TOKEN) {
      console.warn('⚠️  Tentativo di shutdown con token errato o assente.')
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Non autorizzato' }))
      return
    }

    const { exec } = require('child_process')
    const os = require('os')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    setTimeout(() => {
      const platform = os.platform()
      let cmd
      if (platform === 'win32') {
        cmd = 'C:\\Windows\\System32\\shutdown.exe /s /t 3'
      } else if (platform === 'darwin') {
        cmd = 'osascript -e \'tell app "System Events" to shut down\''
      } else {
        cmd = 'shutdown -h now'
      }
      exec(cmd, (err) => { if (err) console.error('Shutdown error:', err.message) })
    }, 500)
    return
  }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body)

      if (payload.tipo === 'rt') {
        const { marca, ip, porta, azione, dati, comandi } = payload
        if (!ip) throw new Error('IP mancante')
        if (marca === '3i') avviaKeepAlive(ip, porta || 1723)

        let risultato

        if (marca === 'rch') {
          risultato = await inviaRCH(ip, porta || 80, comandi || [])
        } else if (marca === '3i' && (azione === 'chiusura_fiscale' || azione === 'lettura_x')) {
          const cmds = azione === 'chiusura_fiscale' ? ['z', '1F', 'c'] : ['x', '1F', 'c']
          const risposta = await inviaTCP3i(ip, porta || 1723, cmds)
          risultato = { ok: true, risposta }
        } else {
          let comando = dati?.cmd || ''
          if (!comando && azione) {
            switch (azione) {
              case 'ping': comando = marca === '3i' ? 'K' : 'report num=0'; break
              case 'lettura_x': comando = marca === '3i' ? '1F' : 'report num=2'; break
              case 'annullo': {
                if (marca === '3i') {
                  const nazz = String(dati.numeroAzzeramento).padStart(4, '0')
                  const ndoc = String(dati.numeroDocumento).padStart(4, '0')
                  const ref = `"${nazz}-${ndoc}"`
                  const verifica = await inviaTCPRT(ip, porta || 1723, `${ref}50F`, '3i')
                  const esito = verifica.trim()[0]
                  if (esito !== '0') {
                    const errori = {'1':'Scontrino non trovato','2':'Non è documento di vendita','3':'Già annullato/reso','4':'Aliquote IVA diverse','5':'Aliquota non associata a reparto'}
                    throw new Error(errori[esito] || `Errore 3i: ${verifica}`)
                  }
                  const risposta = await inviaTCPRT(ip, porta || 1723, `${ref}52F`, '3i')
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ ok: true, risposta }))
                  return
                } else {
                  comando = `docannullo mat='${dati.matricola}', nazz=${dati.numeroAzzeramento}, ndoc=${dati.numeroDocumento}, data=${dati.data}`
                }
                break
              }
              case 'ristampa': {
                if (marca === '3i') {
                  const fmtData3i = (d) => {
                    if (!d) return '000000'
                    if (d.length === 6) return d.slice(4,6) + d.slice(2,4) + d.slice(0,2)
                    const parts = d.split('/')
                    if (parts.length === 3) return parts[2].slice(2) + parts[1] + parts[0]
                    return d.replace(/-/g, '').slice(2)
                  }
                  const d1 = fmtData3i(dati.dataInizio)
                  const n1 = String(dati.dalNumero || 1).padStart(5, '0')
                  const n2 = String(dati.alNumero || 1).padStart(5, '0')
                  comando = `"${d1}${n1}${n2}"15F`
                } else {
                  comando = `dgfe tipo=160, datada=${dati.dataInizio}, dataa=${dati.dataFine}, nda=${dati.dalNumero}, na=${dati.alNumero}`
                }
                break
              }
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
              default: break
            }
          }
          if (!comando) throw new Error('Comando RT mancante')
          const risposta = await inviaTCPRT(ip, porta || 1471, comando, marca)
          risultato = { ok: true, risposta }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(risultato))
        return
      }

      const { ip, porta, tavolo, righe, tipo, uscita, totaleUscite } = payload
      const doc = buildComanda(tavolo, righe, tipo || 'comanda', uscita, totaleUscite)
      await inviaTCP(ip, porta || 9100, doc)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      console.log(`✓ Stampato: Tavolo ${tavolo} - ${righe.length} righe - tipo: ${tipo}`)

    } catch (err) {
      console.error('Errore service:', err.message)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })
})

server.listen(PORT, () => {
  console.log(`DigitalCase Service attivo su http://localhost:${PORT}`)
  console.log(`  → Stampante comande: POST { ip, porta, tavolo, righe, tipo }`)
  console.log(`  → Registratore RT:  POST { tipo: 'rt', marca, ip, porta, azione, dati }`)
  console.log(SHUTDOWN_TOKEN ? '  → Shutdown remoto: ABILITATO (token configurato)' : '  → Shutdown remoto: DISABILITATO (nessun SHUTDOWN_TOKEN in .env.local)')
})