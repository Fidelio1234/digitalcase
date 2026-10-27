import { Resend } from 'resend'
import { utenteDaSessione } from '@/lib/serverAuth'

const resend = new Resend(process.env.RESEND_API_KEY)

// ── Sicurezza: controllo dei dati ricevuti dal browser ───────────────────────
const testoSemplice = (v, max = 120) => String(v ?? '').slice(0, max).replace(/[\r\n\t]+/g, ' ').trim()
const numero = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const EMAIL_RE = /^[^\s@<>,;"'()\[\]\\]+@[^\s@<>,;"'()\[\]\\]+\.[^\s@<>,;"'()\[\]\\]{2,}$/
const MAX_HTML = 300 * 1000   // caratteri
const MAX_INVII = 10          // per utente
const FINESTRA_MS = 60 * 1000 // al minuto
const invii = new Map()       // id utente -> orari degli ultimi invii (per istanza del server)

function limiteSuperato(chi) {
  const ora = Date.now()
  const recenti = (invii.get(chi) || []).filter(t => ora - t < FINESTRA_MS)
  if (recenti.length >= MAX_INVII) { invii.set(chi, recenti); return true }
  recenti.push(ora)
  invii.set(chi, recenti)
  if (invii.size > 500) for (const [k, v] of invii) if (!v.some(t => ora - t < FINESTRA_MS)) invii.delete(k)
  return false
}

function datiPuliti(body) {
  const b = body && typeof body === 'object' ? body : {}
  const n = b.negozio && typeof b.negozio === 'object' ? b.negozio : {}
  let email = ''
  if (n.email) {
    email = typeof n.email === 'string' ? n.email.trim() : ''
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { errore: 'Indirizzo email non valido' }
  }
  if (typeof b.html !== 'string' || b.html.length === 0 || b.html.length > MAX_HTML) return { errore: 'Contenuto della mail non valido' }
  return {
    negozio: { partitaIva: testoSemplice(n.partitaIva, 20), ragioneSociale: testoSemplice(n.ragioneSociale, 120), email },
    chiusura: { numeroChiusura: numero(b.chiusura?.numeroChiusura) },
    html: b.html,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // 1) Solo chi ha fatto il login nel negozio
  let utente = null
  try {
    utente = await utenteDaSessione(req)
  } catch (e) {
    console.error('invia-chiusura: errore verifica sessione:', e.message)
    return res.status(500).json({ error: 'Errore di autenticazione' })
  }
  if (!utente) return res.status(401).json({ error: 'Non autorizzato' })

  // 2) Limite di invii al minuto
  if (limiteSuperato(String(utente.id))) return res.status(429).json({ error: 'Troppi invii, riprova tra un minuto' })

  // 3) Dati controllati
  const puliti = datiPuliti(req.body)
  if (puliti.errore) return res.status(400).json({ error: puliti.errore })
  const { negozio, chiusura, html } = puliti
  if (!negozio?.partitaIva && !negozio?.ragioneSociale) {
    return res.status(400).json({ error: 'Dati negozio mancanti' })
  }
  const destinatario = negozio.email || process.env.TECH_EMAIL || 'dmivanlecce@gmail.com'
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: destinatario,
      subject: `Chiusura Fiscale #${chiusura.numeroChiusura} — ${negozio.ragioneSociale}`,
      html,
    })
    if (error) return res.status(400).json({ error })
    return res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
