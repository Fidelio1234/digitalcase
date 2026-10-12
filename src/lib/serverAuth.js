// SOLO SERVER. Non importare mai questo file da una pagina o da un componente.
import crypto from 'crypto'
import { promisify } from 'util'
import { createClient } from '@supabase/supabase-js'

const scrypt = promisify(crypto.scrypt)

export const COOKIE_SESSIONE = 'dc_sess'
export const DURATA_SESSIONE = 12 * 60 * 60 // 12 ore
export const MAX_TENTATIVI = 5
export const BLOCCO_SECONDI = 5 * 60

// ── Client Supabase con chiave segreta (bypassa le RLS) ──────────────────────
let _admin = null
export function supabaseAdmin() {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Variabili Supabase lato server mancanti')
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}

// ── Negozio da slug ──────────────────────────────────────────────────────────
export function slugValido(slug) {
  return typeof slug === 'string' && /^[a-z0-9-]{1,40}$/.test(slug)
}

export async function negozioDaSlug(slug) {
  if (!slugValido(slug)) return null
  const { data } = await supabaseAdmin()
    .from('negozi').select('id').eq('slug', slug).eq('attivo', true).maybeSingle()
  return data?.id ? { id: data.id } : null
}

// ── PIN: hash con scrypt (salt casuale per ogni PIN) ─────────────────────────
export function pinFormatoValido(pin) {
  return typeof pin === 'string' && /^\d{8}$/.test(pin)
}

export async function hashPin(pin) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(pin, salt, 64)
  return `s1$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verificaPin(pin, salvato) {
  if (typeof pin !== 'string' || typeof salvato !== 'string') return false
  const [versione, saltHex, hashHex] = salvato.split('$')
  if (versione !== 's1' || !saltHex || !hashHex) return false
  const atteso = Buffer.from(hashHex, 'hex')
  const calcolato = await scrypt(pin, Buffer.from(saltHex, 'hex'), atteso.length)
  return calcolato.length === atteso.length && crypto.timingSafeEqual(calcolato, atteso)
}

// ── Sessione: cookie firmato HMAC (httpOnly) ─────────────────────────────────
function segreto() {
  const s = process.env.TECH_SESSION_SECRET
  if (!s || s.length < 32) throw new Error('TECH_SESSION_SECRET mancante o troppo corto')
  return s
}

function firma(testo) {
  // Il prefisso "sess:" separa queste firme da quelle del cookie tecnico
  return crypto.createHmac('sha256', segreto()).update('sess:' + testo).digest('base64url')
}

export function creaToken({ uid, nid, role }) {
  const payload = Buffer.from(
    JSON.stringify({ uid, nid, role, exp: Date.now() + DURATA_SESSIONE * 1000 })
  ).toString('base64url')
  return `${payload}.${firma(payload)}`
}

export function leggiSessione(req) {
  const token = req.cookies?.[COOKIE_SESSIONE]
  if (!token || typeof token !== 'string') return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const atteso = firma(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(atteso)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const dati = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!dati?.uid || !dati?.nid || typeof dati.exp !== 'number' || dati.exp < Date.now()) return null
    return dati
  } catch {
    return null
  }
}

export function cookieSessione(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_SESSIONE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURATA_SESSIONE}${secure}`
}

export function cookieSessioneCancella() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_SESSIONE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
}

// Verifica sul database che l'utente della sessione esista ancora ed sia abilitato
export async function utenteDaSessione(req) {
  const s = leggiSessione(req)
  if (!s) return null
  const { data } = await supabaseAdmin()
    .from('utenti')
    .select('id, nome, ruolo, abilitato, negozio_id')
    .eq('id', s.uid)
    .maybeSingle()
  if (!data || !data.abilitato || data.negozio_id !== s.nid) return null
  return data
}

// ── Limite tentativi per IP (in memoria: best effort su serverless) ──────────
const tentativiIp = new Map()
export function limiteIp(req, max = 30, finestraMs = 5 * 60 * 1000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip')
    .split(',')[0].trim()
  const ora = Date.now()
  const voce = tentativiIp.get(ip)
  if (!voce || voce.scade < ora) {
    tentativiIp.set(ip, { n: 1, scade: ora + finestraMs })
    return true
  }
  voce.n += 1
  return voce.n <= max
}
