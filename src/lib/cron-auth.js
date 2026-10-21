// Autorizzazione dei cron. Vercel chiama i cron con "Authorization: Bearer <CRON_SECRET>";
// resta valido anche l'header "x-cron-secret" per le chiamate manuali.
// Se CRON_SECRET non e' impostato, rifiuta sempre.
import { timingSafeEqual } from 'crypto'

function uguali(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function cronAutorizzato(req) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) return false
  return uguali(req.headers['authorization'], `Bearer ${segreto}`) ||
         uguali(req.headers['x-cron-secret'], segreto)
}
