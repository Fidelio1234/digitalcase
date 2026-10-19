import { leggiSessione, supabaseAdmin, limiteIp } from '@/lib/serverAuth'
import { hashCodice, creaTokenPalmare, cookiePalmare } from '@/lib/palmare'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
  try {
    if (!limiteIp(req, 10)) return res.status(429).json({ error: 'Troppi tentativi, riprova tra qualche minuto' })
    const s = leggiSessione(req)
    if (!s) return res.status(401).json({ error: 'Effettua prima il login' })

    const codice = typeof req.body?.codice === 'string' ? req.body.codice.trim() : ''
    if (!/^[A-Za-z0-9]{8}$/.test(codice)) return res.status(400).json({ error: 'Codice non valido' })
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 40) : ''

    const db = supabaseAdmin()

    // 1) posti disponibili (prima di consumare il codice)
    const { data: lic } = await db.from('palmari_licenza').select('max_palmari').eq('negozio_id', s.nid).maybeSingle()
    const max = lic?.max_palmari ?? 0
    const { count } = await db.from('palmari').select('id', { count: 'exact', head: true })
      .eq('negozio_id', s.nid).eq('attivo', true)
    if ((count || 0) >= max) return res.status(403).json({ error: 'Licenza palmari esaurita' })

    // 2) consuma il codice: l'update condizionato riesce a una sola richiesta
    const ora = new Date().toISOString()
    const { data: cod } = await db.from('palmari_codici')
      .update({ usato_il: ora })
      .eq('codice_hash', hashCodice(codice)).eq('negozio_id', s.nid)
      .is('usato_il', null).gt('scade_il', ora)
      .select('codice_hash').maybeSingle()
    if (!cod) return res.status(400).json({ error: 'Codice non valido o scaduto' })

    // 3) registra il telefono e imposta il cookie firmato
    const { data: nuovo, error } = await db.from('palmari')
      .insert({ negozio_id: s.nid, nome: nome || null, ultimo_accesso: ora })
      .select('id').single()
    if (error) throw error
    res.setHeader('Set-Cookie', cookiePalmare(creaTokenPalmare({ pid: nuovo.id, nid: s.nid })))
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('palmare-attiva:', e.message)
    return res.status(500).json({ error: 'Errore del server' })
  }
}