// Controlla la password tecnica sul server. La password giusta non arriva mai al browser.
// POST   { password } -> se giusta imposta il cookie dell'area tecnica
// DELETE              -> esce dall'area tecnica (cancella il cookie)
import crypto from 'crypto'
import { COOKIE_TECH, DURATA_SECONDI, creaToken } from '@/lib/techSession'

const MAX_TENTATIVI = 5
const FINESTRA_MS = 5 * 60 * 1000
// Limite tentativi in memoria: aiuta, ma su Vercel ogni istanza ha il suo contatore.
const registro = new Map()

function uguali(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function cookie(valore, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_TECH}=${valore}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
}

export default function handler(req, res) {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookie('', 0))
    return res.status(200).json({ ok: true })
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const segreti = [process.env.TECH_PASSWORD, process.env.TECH_MASTER_PASSWORD].filter(Boolean)
  if (segreti.length === 0 || !process.env.TECH_SESSION_SECRET) {
    return res.status(500).json({ ok: false, errore: 'Configurazione mancante' })
  }

  const ip =
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'ignoto'
  const ora = Date.now()
  let rec = registro.get(ip)
  if (!rec || ora - rec.inizio > FINESTRA_MS) rec = { inizio: ora, n: 0 }
  if (rec.n >= MAX_TENTATIVI) return res.status(429).json({ ok: false, errore: 'Troppi tentativi' })

  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const giusta = segreti.map((s) => uguali(password, s)).some(Boolean)

  if (!giusta) {
    rec.n += 1
    registro.set(ip, rec)
    return res.status(401).json({ ok: false })
  }

  registro.delete(ip)
  res.setHeader('Set-Cookie', cookie(creaToken(), DURATA_SECONDI))
  return res.status(200).json({ ok: true })
}