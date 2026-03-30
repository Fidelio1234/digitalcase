import { Resend } from 'resend'


const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { destinatario, scontrino, negozio } = req.body

  if (!destinatario || !scontrino) {
    return res.status(400).json({ error: 'Dati mancanti' })
  }

  const fmt = (cents) => (cents / 100).toFixed(2).replace('.', ',')

  const righeHtml = scontrino.righe.map(r => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #252830;color:#eef0f6">
        ${r.nome}${r.quantita > 1 ? ` <span style="color:#5a5d6e">×${r.quantita}</span>` : ''}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #252830;color:#5a5d6e;text-align:center">
        IVA ${r.iva}%
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #252830;color:#eef0f6;text-align:right;font-family:monospace">
        € ${fmt(r.totaleRiga)}
      </td>
    </tr>
  `).join('')

  const ivaRighe = Object.entries(
    scontrino.righe.reduce((acc, r) => {
      const k = String(r.iva)
      acc[k] = (acc[k] || 0) + r.totaleRiga
      return acc
    }, {})
  ).map(([iva, imp]) => `
    <tr>
      <td colspan="2" style="padding:6px 16px;color:#5a5d6e;font-size:12px">IVA ${iva}%</td>
      <td style="padding:6px 16px;color:#5a5d6e;font-size:12px;text-align:right;font-family:monospace">
        € ${fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}
      </td>
    </tr>
  `).join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#08090c;font-family:'DM Mono',monospace,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">

    <!-- INTESTAZIONE NEGOZIO -->
    <div style="background:#111318;border:1px solid #252830;border-left:4px solid #00e5a0;border-radius:12px;padding:24px;margin-bottom:20px">
      <div style="font-size:20px;font-weight:700;color:#eef0f6;margin-bottom:8px">
        ${negozio.ragioneSociale || 'Negozio'}
      </div>
      ${negozio.indirizzo ? `<div style="color:#5a5d6e;font-size:13px;margin-top:4px">📍 ${negozio.indirizzo}</div>` : ''}
      ${negozio.partitaIva ? `<div style="color:#5a5d6e;font-size:13px;margin-top:4px">🏛️ P.IVA ${negozio.partitaIva}</div>` : ''}
      ${negozio.telefono ? `<div style="color:#5a5d6e;font-size:13px;margin-top:4px">📞 ${negozio.telefono}</div>` : ''}
      ${negozio.sitoWeb ? `<div style="color:#5a5d6e;font-size:13px;margin-top:4px">🌐 ${negozio.sitoWeb}</div>` : ''}
      ${negozio.numeroRt ? `<div style="color:#5a5d6e;font-size:11px;margin-top:8px;padding-top:8px;border-top:1px solid #252830">RT: ${negozio.numeroRt}</div>` : ''}
    </div>

    <!-- INFO SCONTRINO -->
    <div style="display:flex;gap:12px;margin-bottom:20px">
      <div style="flex:1;background:#111318;border:1px solid #252830;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">Scontrino</div>
        <div style="font-size:18px;font-weight:700;color:#00e5a0;margin-top:4px">n° ${scontrino.numeroScontrino}</div>
      </div>
      <div style="flex:1;background:#111318;border:1px solid #252830;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">Chiusura</div>
        <div style="font-size:18px;font-weight:700;color:#00e5a0;margin-top:4px">n° ${scontrino.numeroChiusure}</div>
      </div>
      <div style="flex:1;background:#111318;border:1px solid #252830;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">Data</div>
        <div style="font-size:13px;font-weight:700;color:#eef0f6;margin-top:4px">${new Date().toLocaleDateString('it-IT')}</div>
      </div>
    </div>

    <!-- PRODOTTI -->
    <div style="background:#111318;border:1px solid #252830;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #252830;font-size:11px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">
        Prodotti acquistati
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#1a1c24">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#5a5d6e;font-weight:400">DESCRIZIONE</th>
            <th style="padding:10px 16px;text-align:center;font-size:11px;color:#5a5d6e;font-weight:400">IVA</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#5a5d6e;font-weight:400">IMPORTO</th>
          </tr>
        </thead>
        <tbody>${righeHtml}</tbody>
      </table>

      <!-- IVA breakdown -->
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #252830">
        ${ivaRighe}
      </table>

      <!-- TOTALE -->
      <div style="padding:16px;background:#1a1c24;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">TOTALE</span>
        <span style="font-size:24px;font-weight:700;color:#00e5a0;font-family:monospace">€ ${fmt(scontrino.totale)}</span>
      </div>
    </div>

    <!-- METODO PAGAMENTO -->
    <div style="background:#111318;border:1px solid #252830;border-radius:10px;padding:14px;text-align:center;margin-bottom:20px;color:#5a5d6e;font-size:13px">
      ${scontrino.metodo === 'carta' ? '💳 Pagato con Carta / POS' : `💵 Pagato in Contanti${scontrino.resto > 0 ? ` · Resto €${fmt(scontrino.resto)}` : ''}`}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;color:#5a5d6e;font-size:11px;line-height:1.8">
      Questo è il tuo scontrino digitale<br/>
      Conservalo come documento fiscale<br/>
      <span style="color:#252830">— ScontrinoDigitale —</span>
    </div>

  </div>
</body>
</html>
  `

  console.log('API chiamata con:', { destinatario, negozio: negozio?.ragioneSociale })
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: destinatario,
      subject: `Scontrino n°${scontrino.numeroScontrino} — ${negozio.ragioneSociale || 'Il tuo acquisto'}`,
      html,
    })

    if (error) return res.status(400).json({ error })
    return res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
