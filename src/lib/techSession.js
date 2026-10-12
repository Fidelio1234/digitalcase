// Sessione dell'area tecnica: un cookie firmato, valido 2 ore.
// Si usa solo lato server (API e getServerSideProps).
import crypto from 'crypto'

export const COOKIE_TECH = 'dc_tech'
export const DURATA_SECONDI = 2 * 60 * 60

function firma(testo) {
  return crypto
    .createHmac('sha256', process.env.TECH_SESSION_SECRET || '')
    .update(testo)
    .digest('hex')
}

export function creaToken() {
  const scade = Date.now() + DURATA_SECONDI * 1000
  return `${scade}.${firma(String(scade))}`
}

export function tokenValido(token) {
  if (!token || !process.env.TECH_SESSION_SECRET) return false
  const [scade, firmaRicevuta] = String(token).split('.')
  if (!scade || !firmaRicevuta) return false
  const a = Buffer.from(firmaRicevuta)
  const b = Buffer.from(firma(scade))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  return Number(scade) > Date.now()
}