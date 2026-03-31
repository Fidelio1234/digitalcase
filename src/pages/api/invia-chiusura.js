import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { negozio, chiusura, html } = req.body
  if (!negozio?.partitaIva && !negozio?.ragioneSociale) {
    return res.status(400).json({ error: 'Dati negozio mancanti' })
  }
  const destinatario = negozio.email || process.env.TECH_EMAIL || 'dmivanlecce@gmail.com'
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: destinatario,
      subject: `Chiusura Fiscale #${chiusura.numeroChiusura} — ${negozio.ragioneSociale}`,
      html,
    })
    if (error) return res.status(400).json({ error })
    return res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
