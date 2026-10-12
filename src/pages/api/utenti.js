import { supabaseAdmin, negozioDaSlug } from '@/lib/serverAuth'

// Elenco pubblico per la schermata di login: SENZA PIN, solo utenti abilitati.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito' })

  try {
    const slug = req.query.slug || req.headers['x-negozio-slug']
    const negozio = await negozioDaSlug(slug)
    if (!negozio) return res.status(404).json({ error: 'Negozio non trovato' })

    const { data, error } = await supabaseAdmin()
      .from('utenti')
      .select('id, nome, ruolo, abilitato')
      .eq('negozio_id', negozio.id)
      .eq('abilitato', true)
    if (error) return res.status(500).json({ error: 'Errore del server' })

    const ordinati = [...data].sort((a, b) => {
      if (a.ruolo === 'owner') return -1
      if (b.ruolo === 'owner') return 1
      return a.nome.localeCompare(b.nome)
    })
    return res.status(200).json(ordinati)
  } catch (e) {
    console.error('api/utenti:', e.message)
    return res.status(500).json({ error: 'Errore del server' })
  }
}
