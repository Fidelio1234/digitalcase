import { utenteDaSessione } from '@/lib/serverAuth'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const u = await utenteDaSessione(req)
    if (!u) return res.status(401).json({ ok: false })
    return res.status(200).json({
      ok: true,
      user: { id: u.id, name: u.nome, role: u.ruolo, initials: u.nome.substring(0, 2).toUpperCase() },
    })
  } catch (e) {
    console.error('api/sessione:', e.message)
    return res.status(500).json({ ok: false })
  }
}
