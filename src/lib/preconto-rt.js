// Preconto stampato dalla cassa fiscale 3i (documento NON fiscale: comandi j ... J).
// La cassa FP18 stampa al massimo 36 caratteri per riga e taglia il resto in silenzio:
// misurato il 4/11/2026 con righe di prova da 32 a 48 caratteri.

export const LARGHEZZA_RT = 36

// La cassa 3i ignora i caratteri fuori dall'intervallo 20H-7FH (manuale Xon/Xoff 3i, cap. 3):
// "Caffè" uscirebbe "Caff". Gli accenti diventano lettera + apostrofo ("è" -> "e'"), il resto in ASCII.
const ACCENTI = {
  'à': "a'", 'á': "a'", 'è': "e'", 'é': "e'", 'ì': "i'", 'í': "i'", 'ò': "o'", 'ó': "o'", 'ù': "u'", 'ú': "u'",
  'À': "A'", 'Á': "A'", 'È': "E'", 'É': "E'", 'Ì': "I'", 'Í': "I'", 'Ò': "O'", 'Ó': "O'", 'Ù': "U'", 'Ú': "U'",
  '€': 'EUR', '’': "'", '‘': "'", '“': ' ', '”': ' ', '«': ' ', '»': ' ', '–': '-', '—': '-', '×': 'x', '°': 'o', 'ß': 'ss',
}

export function soloAscii(testo) {
  let out = ''
  for (const ch of String(testo ?? '')) {
    if (ACCENTI[ch] !== undefined) { out += ACCENTI[ch]; continue }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    for (const c of base) {
      const code = c.charCodeAt(0)
      out += code >= 0x20 && code <= 0x7e ? c : ' '
    }
  }
  return out
}

function pulisci(testo) {
  return soloAscii(testo).replace(/"/g, ' ').replace(/\s+/g, ' ').trim()
}

function euro(centesimi) {
  return (Math.round(centesimi) / 100).toFixed(2).replace('.', ',')
}

// Riga "nome ........ prezzo" lunga esattamente LARGHEZZA_RT caratteri
function rigaConPrezzo(nome, prezzo) {
  const p = String(prezzo)
  const spazioNome = LARGHEZZA_RT - p.length - 1
  const n = pulisci(nome).substring(0, Math.max(0, spazioNome))
  return n + ' '.repeat(LARGHEZZA_RT - n.length - p.length) + p
}

function centrata(testo) {
  const t = pulisci(testo).substring(0, LARGHEZZA_RT)
  return ' '.repeat(Math.floor((LARGHEZZA_RT - t.length) / 2)) + t
}

export function righePrecontoRT(numeroTavolo, righe) {
  const righeValide = (righe || []).filter(r => r && (r.totaleRiga || 0) !== 0)
  const trattini = '-'.repeat(LARGHEZZA_RT)
  const out = []
  out.push(centrata('*** PRECONTO ***'))
  out.push('Tavolo ' + pulisci(numeroTavolo))
  out.push(trattini)
  let totale = 0
  for (const r of righeValide) {
    const qta = r.quantita > 1 ? `${r.quantita}x ` : ''
    out.push(rigaConPrezzo(qta + (r.nome || ''), euro(r.totaleRiga)))
    totale += r.totaleRiga
    if (r.nota) {
      const corpo = pulisci(r.nota).replace(/^([+-])\s*/, '$1 ')
      out.push(('  >> ' + corpo).substring(0, LARGHEZZA_RT))
    }
  }
  out.push(trattini)
  out.push(rigaConPrezzo('TOTALE EUR', euro(totale)))
  out.push(trattini)
  out.push(centrata('Ritirare lo scontrino alla cassa'))
  return out
}

export function comandoPrecontoRT(numeroTavolo, righe) {
  return 'j' + righePrecontoRT(numeroTavolo, righe).map(l => `"${l}"@`).join('') + 'J'
}

// Stessa logica di callRT in cassa.jsx (sviluppo su localhost: API Next; produzione: service.js)
async function chiamaRT(marca, body, serviceIp) {
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocalhost) {
    const res = await fetch('/api/ditron', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marca, ...body }) })
    return res.json()
  }
  const payload = JSON.stringify({ tipo: 'rt', marca, ...body })
  if (serviceIp) {
    try {
      const res = await fetch(`http://${serviceIp}:3002`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      return await res.json()
    } catch (e) { /* ricade su localhost */ }
  }
  const res = await fetch('http://localhost:3002', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
  return res.json()
}

// Ritenta fino a 3 volte: la cassa a volte rifiuta la connessione subito dopo un'altra stampa.
export async function stampaPrecontoRT(rtConfig, numeroTavolo, righe) {
  if (!rtConfig?.ip) return { ok: false, error: 'Cassa non configurata' }
  const cmd = comandoPrecontoRT(numeroTavolo, righe)
  let ultimo = null
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    if (tentativo > 0) await new Promise(r => setTimeout(r, 1500))
    try {
      ultimo = await chiamaRT('3i', { ip: rtConfig.ip, porta: rtConfig.porta || 9600, azione: 'raw', dati: { cmd } }, rtConfig.serviceIp)
      if (ultimo?.ok !== false) return { ok: true, risposta: ultimo }
    } catch (e) {
      ultimo = { ok: false, error: e.message }
    }
  }
  return { ok: false, error: ultimo?.error || 'Cassa non raggiungibile' }
}
