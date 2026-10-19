import { leggiSessione, supabaseAdmin } from '@/lib/serverAuth'
import { palmareAttivo } from '@/lib/palmare'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  try {
    const s = leggiSessione(req)
    if (!s) return res.status(401).json({ ok: false, motivo: 'sessione' })
    const p = await palmareAttivo(req, s.nid)
    
    if (!p) return res.status(403).json({ ok: false, motivo: 'non_attivato' })
    await supabaseAdmin().from('palmari').update({ ultimo_accesso: new Date().toISOString() }).eq('id', p.id)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('palmare-verifica:', e.message)
    return res.status(500).json({ ok: false, motivo: 'errore' })
  }
}