import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID } from '@/lib/config'

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from('utenti')
    .select('id, nome, pin, ruolo, abilitato')
    .eq('negozio_id', NEGOZIO_ID)
    .eq('abilitato', true)
  
  if (error) return res.status(500).json({ error: error.message })
  
  const sorted = [...data].sort((a,b) => {
    if (a.ruolo === 'owner') return -1
    if (b.ruolo === 'owner') return 1
    return a.nome.localeCompare(b.nome)
  })
  
  return res.json(sorted)
}
