import { supabase } from '@/lib/supabase'

export default async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Non autorizzato' })
  }

  // Elimina record più vecchi di 30 giorni
  const dataLimite = new Date()
  dataLimite.setDate(dataLimite.getDate() - 30)

  const { error, count } = await supabase
    .from('storico_tavoli')
    .delete({ count: 'exact' })
    .lt('chiuso_alle', dataLimite.toISOString())

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true, eliminati: count })
}
