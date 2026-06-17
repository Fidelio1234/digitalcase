/**
 * DigitalCase — Service Polling Comande
 * Controlla Supabase ogni 5 secondi per nuove comande da stampare
 */
const https = require('https')

// ── CONFIGURAZIONE ──────────────────────────────────────────────────────────
// Leggi da .env.local se presente
const fs = require('fs')
let env = {}
try {
  fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, v] = line.split('=')
    if (k && v) env[k.trim()] = v.trim()
  })
} catch(e) {}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const NEGOZIO_ID = env.NEXT_PUBLIC_NEGOZIO_ID
const STAMPANTE_SERVICE = 'http://localhost:3002'
const POLL_INTERVAL = 2000

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variabili .env.local mancanti!')
  process.exit(1)
}

// ── HELPER HTTP ──────────────────────────────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url)
    const req = https.request({
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, ...headers }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.end()
  })
}

function httpPatch(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url)
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(d))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = require('http').request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ── LEGGI STAMPANTI DA SUPABASE ──────────────────────────────────────────────
async function getStampanti() {
  const data = await httpGet(
    `${SUPABASE_URL}/rest/v1/impostazioni_negozio?negozio_id=eq.${NEGOZIO_ID}&select=stampanti`
  )
  return data?.[0]?.stampanti || []
}

// ── LEGGI REPARTI ────────────────────────────────────────────────────────────
async function getReparti() {
  const data = await httpGet(
    `${SUPABASE_URL}/rest/v1/reparti?negozio_id=eq.${NEGOZIO_ID}&select=id,nome,uscita`
  )
  return data || []
}

// ── POLLING ──────────────────────────────────────────────────────────────────
async function poll() {
  try {
    // Cerca tavoli con comanda_pending
    const tavoli = await httpGet(
      `${SUPABASE_URL}/rest/v1/tavoli?negozio_id=eq.${NEGOZIO_ID}&comanda_pending=not.is.null&select=numero,comanda_pending`
    )

    if (!tavoli?.length) return

    const stampanti = await getStampanti()
    const reparti = await getReparti()
    const attive = stampanti.filter(s => s.attiva && s.ip)

    if (!attive.length) {
      console.log('⚠️  Nessuna stampante configurata')
      return
    }

    for (const tavolo of tavoli) {
      const pending = tavolo.comanda_pending
      if (!pending) continue

      // Cancella SUBITO prima di stampare per evitare doppia stampa
      await httpPatch(
        `${SUPABASE_URL}/rest/v1/tavoli?negozio_id=eq.${NEGOZIO_ID}&numero=eq.${tavolo.numero}`,
        { comanda_pending: null }
      )

      const { righe, tipo = 'comanda' } = pending
      console.log(`📋 Nuova comanda: Tavolo ${tavolo.numero} - ${righe?.length} prodotti - tipo: ${tipo}`)

      for (const stampante of attive) {
        // Filtra righe per reparti
        // Coperto sempre incluso + filtra per reparti
        const copertoRiga = righe.find(r => r.id === 'coperto')
        let righeFiltrate = stampante.gruppi?.length > 0
          ? righe.filter(r => r.id !== 'coperto' && stampante.gruppi.includes(r.repartoId))
          : righe.filter(r => r.id !== 'coperto')
        if (copertoRiga) righeFiltrate = [copertoRiga, ...righeFiltrate]
        console.log('righeFiltrate ids:', righeFiltrate.map(r => r.id))

        if (!righeFiltrate.length) continue

        if (tipo === 'preconto') {
          await httpPost(STAMPANTE_SERVICE, {
            ip: stampante.ip, porta: stampante.porta || 9100,
            tavolo: tavolo.numero, righe: righeFiltrate, tipo: 'preconto'
          })
          continue
        }

        // Raggruppa per uscita
        const usciteMap = {}
        for (const riga of righeFiltrate) {
          const reparto = reparti.find(r => r.id === riga.repartoId)
          const uscita = reparto?.uscita || 1
          if (!usciteMap[uscita]) usciteMap[uscita] = []
          usciteMap[uscita].push(riga)
        }

        const usciteOrdinate = Object.keys(usciteMap).sort((a, b) => parseInt(a) - parseInt(b))
        for (const uscita of usciteOrdinate) {
          await httpPost(STAMPANTE_SERVICE, {
            ip: stampante.ip, porta: stampante.porta || 9100,
            tavolo: tavolo.numero, righe: usciteMap[uscita],
            tipo: 'comanda', uscita: parseInt(uscita),
            totaleUscite: usciteOrdinate.length
          })
          if (usciteOrdinate.indexOf(uscita) < usciteOrdinate.length - 1) {
            await new Promise(r => setTimeout(r, 800))
          }
        }
      }

      console.log(`✓ Comanda Tavolo ${tavolo.numero} stampata e rimossa`)
    }
  } catch(e) {
    console.error('Errore polling:', e.message)
  }
}

console.log(`�� Polling attivo ogni ${POLL_INTERVAL/1000} secondi...`)
setInterval(poll, POLL_INTERVAL)
poll() // Prima esecuzione immediata
