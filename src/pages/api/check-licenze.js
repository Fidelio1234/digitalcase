import { supabase } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  // Sicurezza — solo chiamate interne
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Non autorizzato' })
  }

  const oggi = new Date()
  const tra7giorni = new Date(oggi.getTime() + 7 * 24 * 60 * 60 * 1000)
  const tra3giorni = new Date(oggi.getTime() + 3 * 24 * 60 * 60 * 1000)

  // Cerca negozi che scadono tra 7 o 3 giorni
  const { data: negozi } = await supabase
    .from('negozi')
    .select('*')
    .eq('attivo', true)
    .not('email_titolare', 'is', null)
    .lte('data_scadenza', tra7giorni.toISOString())
    .gte('data_scadenza', oggi.toISOString())

  let inviati = 0

  for (const negozio of negozi || []) {
    const scadenza = new Date(negozio.data_scadenza)
    const giorni = Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24))

    // Invia solo a 7 e 3 giorni dalla scadenza
    if (giorni !== 7 && giorni !== 3) continue

    await resend.emails.send({
      from: 'DigitalCase <noreply@digitalcase.it>',
      to: negozio.email_titolare,
      subject: `⚠️ Licenza DigitalCase in scadenza tra ${giorni} giorni`,
      html: `
        <div style="font-family:monospace;background:#08090c;padding:32px;color:#eef0f6">
          <h2 style="color:#ffb830">⚠️ Licenza in scadenza</h2>
          <p>Gentile <strong>${negozio.ragione_sociale || negozio.nome}</strong>,</p>
          <p>la tua licenza <strong>DigitalCase ${negozio.piano}</strong> scadrà tra <strong style="color:#ff4d6a">${giorni} giorni</strong> (${scadenza.toLocaleDateString('it-IT')}).</p>
          <p>Per rinnovare contatta il tuo rivenditore DigitalCase.</p>
          <p style="color:#5a5d6e;font-size:12px">DigitalCase — Sistema POS Digitale</p>
        </div>
      `
    })
    inviati++
  }

  return res.json({ ok: true, inviati, totale: negozi?.length || 0 })
}
