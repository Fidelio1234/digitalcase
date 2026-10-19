// SOLO SERVER. Non importare mai questo file da una pagina o da un componente.
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/serverAuth'

export const COOKIE_PALMARE = 'dc_palm'
const DURATA = 400 * 24 * 60 * 60 // massimo che Chrome accetta per un cookie

function segreto() {
  const s = process.env.PALMARE_SECRET
  if (!s || s.length < 32) throw new Error('PALMARE_SECRET mancante o troppo corto')
  return s
}

function firma(testo) {
  return crypto.createHmac('sha256', segreto()).update('palm:' + testo).digest('base64url')
}

export function hashCodice(codice) {
  return crypto.createHmac('sha256', segreto()).update('cod:' + String(codice).trim().toUpperCase()).digest('hex')
}

export function creaTokenPalmare({ pid, nid }) {
  const payload = Buffer.from(JSON.stringify({ pid, nid })).toString('base64url')
  return `${payload}.${firma(payload)}`
}

export function leggiPalmare(req) {
  const token = req.cookies?.[COOKIE_PALMARE]
  if (!token || typeof token !== 'string') return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(firma(payload))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const dati = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return dati?.pid && dati?.nid ? dati : null
  } catch {
    return null
  }
}

export function cookiePalmare(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_PALMARE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURATA}${secure}`
}

// Il telefono è valido solo se firmato E ancora attivo sul database (così la revoca è immediata)
export async function palmareAttivo(req, negozioId) {
  const p = leggiPalmare(req)
  if (!p || p.nid !== negozioId) return null
  const { data } = await supabaseAdmin()
    .from('palmari').select('id, negozio_id, attivo').eq('id', p.pid).maybeSingle()
  if (!data || !data.attivo || data.negozio_id !== negozioId) return null
  return data
}