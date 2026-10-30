// SOLO SERVER. Riceve la foto di un prodotto (già ridimensionata dal browser) e la salva su Storage.
import crypto from 'crypto'
import { supabaseAdmin, utenteDaSessione, limiteIp } from '@/lib/serverAuth'

export const config = { api: { bodyParser: { sizeLimit: '700kb' } } }

const BUCKET = 'prodotti'
const MAX_BYTE = 300 * 1024

// Il tipo si riconosce dai primi byte del file, non da quello che dichiara il browser
function tipoDaBytes(buf) {
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
  if (!limiteIp(req, 60)) return res.status(429).json({ error: 'Troppe richieste, riprova tra qualche minuto' })

  let utente
  try {
    utente = await utenteDaSessione(req)
  } catch (e) {
    return res.status(500).json({ error: 'Errore del server' })
  }
  if (!utente) return res.status(401).json({ error: 'Accesso richiesto' })
  if (utente.ruolo !== 'owner') return res.status(403).json({ error: 'Solo il titolare può caricare le foto' })

  const dataUrl = req.body && req.body.immagine
  if (typeof dataUrl !== 'string') return res.status(400).json({ error: 'Immagine mancante' })
  const m = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return res.status(400).json({ error: 'Formato non valido' })

  const buf = Buffer.from(m[2], 'base64')
  if (buf.length === 0 || buf.length > MAX_BYTE) return res.status(400).json({ error: 'Immagine troppo grande' })
  const tipo = tipoDaBytes(buf)
  if (!tipo) return res.status(400).json({ error: 'Immagine non valida' })

  // Ogni negozio scrive solo nella propria cartella; il nome è casuale
  const percorso = utente.negozio_id + '/' + crypto.randomUUID() + '.' + tipo.ext
  const admin = supabaseAdmin()
  const { error } = await admin.storage.from(BUCKET).upload(percorso, buf, {
    contentType: tipo.mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) {
    console.error('prodotto-immagine: upload non riuscito:', error.message)
    return res.status(500).json({ error: 'Salvataggio non riuscito' })
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(percorso)
  return res.status(200).json({ url: data.publicUrl })
}
