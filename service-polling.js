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
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('Risposta Supabase non valida (GET): ' + data.slice(0, 200))) }
      })
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

// httpPost ora controlla anche l'esito applicativo ({ ok: false }) oltre a quello di rete,
// perché service.js risponde sempre con HTTP 200 anche quando la stampa fallisce.
function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = require('http').request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(d) } catch (e) {
          reject(new Error('Risposta service.js non valida: ' + d.slice(0, 200)))
          return
        }
        if (parsed.ok === false) {
          reject(new Error(parsed.error || 'Errore stampa sconosciuto'))
          return
        }
        resolve(parsed)
      })
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

// ── STAMPA DI UN SINGOLO TAVOLO SU TUTTE LE STAMPANTI ATTIVE ─────────────────
// Ritorna true se TUTTE le stampe sono andate a buon fine, false altrimenti.
// In caso di fallimento parziale, il comanda_pending NON viene cancellato:
// verrà ritentato al prossimo ciclo di polling.
async function stampaTavolo(tavolo, pending, attive, reparti) {
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
}

// ── POLLING ──────────────────────────────────────────────────────────────────
let isPolling = false // evita cicli sovrapposti: senza cancellazione anticipata,
                       // due poll() in parallelo potrebbero stampare la stessa comanda due volte

async function poll() {
  if (isPolling) return // ciclo precedente ancora in corso, salta questo giro
  isPolling = true

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

      try {
        // Stampa PRIMA di cancellare: se fallisce, comanda_pending resta
        // intatto e viene ritentato al prossimo ciclo (niente comande perse).
        await stampaTavolo(tavolo, pending, attive, reparti)

        await httpPatch(
          `${SUPABASE_URL}/rest/v1/tavoli?negozio_id=eq.${NEGOZIO_ID}&numero=eq.${tavolo.numero}`,
          { comanda_pending: null }
        )

        console.log(`✓ Comanda Tavolo ${tavolo.numero} stampata e rimossa`)
      } catch (errTavolo) {
        // Errore isolato: non blocca gli altri tavoli in questo ciclo.
        // comanda_pending NON viene toccato → ritentativo automatico al prossimo poll.
        console.error(`✗ Stampa Tavolo ${tavolo.numero} fallita, verrà ritentata: ${errTavolo.message}`)
      }
    }
  } catch(e) {
    console.error('Errore polling:', e.message)
  } finally {
    isPolling = false
  }
}

console.log(`🔄 Polling attivo ogni ${POLL_INTERVAL/1000} secondi...`)
setInterval(poll, POLL_INTERVAL)
poll() // Prima esecuzione immediata