import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID as NEGOZIO_ID_DEFAULT } from '@/lib/config'

export default async function handler(req, res) {
  // Ricava lo slug dal query param o dall'header
  const slug = req.query.slug || req.headers['x-negozio-slug']

  let negozioId = NEGOZIO_ID_DEFAULT

  if (slug) {
    const { data: negozio, error } = await supabase
      .from('negozi')
      .select('id')
      .eq('slug', slug)
      .eq('attivo', true)
      .single()

    if (negozio?.id) {
      negozioId = negozio.id
    } else {
      console.warn(`API utenti: negozio con slug "${slug}" non trovato, uso fallback DMI`)
    }
  }

  const { data, error } = await supabase
    .from('utenti')
    .select('id, nome, pin, ruolo, abilitato')
    .eq('negozio_id', negozioId)
    .eq('abilitato', true)

  if (error) return res.status(500).json({ error: error.message })

  const sorted = [...data].sort((a, b) => {
    if (a.ruolo === 'owner') return -1
    if (b.ruolo === 'owner') return 1
    return a.nome.localeCompare(b.nome)
  })

  return res.json(sorted)
}