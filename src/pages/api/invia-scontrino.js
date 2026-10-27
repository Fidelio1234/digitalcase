import { Resend } from 'resend'
import { utenteDaSessione } from '@/lib/serverAuth'
import { totaliPerIva } from '@/lib/iva'


const resend = new Resend(process.env.RESEND_API_KEY)

// ── Sicurezza: controllo e pulizia dei dati ricevuti dal browser ─────────────
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const testoSicuro = (v, max = 200) => String(v ?? '').slice(0, max).replace(/[&<>"']/g, c => ESC[c])
const testoSemplice = (v, max = 120) => String(v ?? '').slice(0, max).replace(/[\r\n\t]+/g, ' ').trim()
const numero = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const EMAIL_RE = /^[^\s@<>,;"'()\[\]\\]+@[^\s@<>,;"'()\[\]\\]+\.[^\s@<>,;"'()\[\]\\]{2,}$/
const MAX_RIGHE = 100
const MAX_INVII = 20          // per utente
const FINESTRA_MS = 60 * 1000 // al minuto
const invii = new Map()       // id utente -> orari degli ultimi invii (per istanza del server)

function limiteSuperato(chi) {
  const ora = Date.now()
  const recenti = (invii.get(chi) || []).filter(t => ora - t < FINESTRA_MS)
  if (recenti.length >= MAX_INVII) { invii.set(chi, recenti); return true }
  recenti.push(ora)
  invii.set(chi, recenti)
  if (invii.size > 500) for (const [k, v] of invii) if (!v.some(t => ora - t < FINESTRA_MS)) invii.delete(k)
  return false
}

function datiPuliti(body) {
  const b = body && typeof body === 'object' ? body : {}
  const destinatario = typeof b.destinatario === 'string' ? b.destinatario.trim() : ''
  if (!destinatario || destinatario.length > 254 || !EMAIL_RE.test(destinatario)) return { errore: 'Indirizzo email non valido' }
  const s = b.scontrino
  if (!s || typeof s !== 'object' || !Array.isArray(s.righe) || s.righe.length === 0 || s.righe.length > MAX_RIGHE) return { errore: 'Dati scontrino non validi' }
  const scontrino = {
    id: testoSicuro(s.id, 60),
    numeroScontrino: numero(s.numeroScontrino),
    numeroChiusure: numero(s.numeroChiusure),
    totale: numero(s.totale),
    resto: numero(s.resto),
    metodo: s.metodo === 'carta' ? 'carta' : 'contanti',
    righe: s.righe.map(r => ({
      nome: testoSicuro(r?.nome, 120),
      quantita: numero(r?.quantita) || 1,
      iva: numero(r?.iva),
      totaleRiga: numero(r?.totaleRiga),
    })),
  }
  const n = b.negozio && typeof b.negozio === 'object' ? b.negozio : {}
  const negozio = {
    ragioneSociale: testoSicuro(n.ragioneSociale, 120),
    nomeOggetto: testoSemplice(n.ragioneSociale, 80), // per l'oggetto della mail (testo semplice)
    indirizzo: testoSicuro(n.indirizzo, 160),
    partitaIva: testoSicuro(n.partitaIva, 20),
    telefono: testoSicuro(n.telefono, 30),
    sitoWeb: testoSicuro(n.sitoWeb, 120),
    numeroRt: testoSicuro(n.numeroRt, 30),
  }
  return { destinatario, scontrino, negozio }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // 1) Solo chi ha fatto il login nel negozio
  let utente = null
  try {
    utente = await utenteDaSessione(req)
  } catch (e) {
    console.error('invia-scontrino: errore verifica sessione:', e.message)
    return res.status(500).json({ error: 'Errore di autenticazione' })
  }
  if (!utente) return res.status(401).json({ error: 'Non autorizzato' })

  // 2) Limite di invii al minuto
  if (limiteSuperato(String(utente.id))) return res.status(429).json({ error: 'Troppi invii, riprova tra un minuto' })

  // 3) Dati controllati e resi innocui
  const puliti = datiPuliti(req.body)
  if (puliti.errore) return res.status(400).json({ error: puliti.errore })
  const { destinatario, scontrino, negozio } = puliti

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

  const ivaRighe = Object.entries(totaliPerIva(scontrino.righe)).map(([iva, imp]) => `

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
        <div style="font-size:11px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">Documento</div>
        <div style="font-size:13px;font-weight:700;color:#00e5a0;margin-top:4px">Copia di cortesia</div>
      </div>
      <div style="flex:1;background:#111318;border:1px solid #252830;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase">Rif. interno</div>
        <div style="font-size:13px;font-weight:700;color:#eef0f6;margin-top:4px">${scontrino.id || '-'}</div>
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
      <table style="width:100%;border-collapse:collapse;background:#1a1c24">
        <tr>
          <td style="padding:16px;font-size:13px;color:#5a5d6e;letter-spacing:2px;text-transform:uppercase;width:50%">TOTALE</td>
          <td style="padding:16px;font-size:24px;font-weight:700;color:#00e5a0;font-family:monospace;text-align:right">€ ${fmt(scontrino.totale)}</td>
        </tr>
      </table>
    </div>

    <!-- METODO PAGAMENTO -->
    <div style="background:#111318;border:1px solid #252830;border-radius:10px;padding:14px;text-align:center;margin-bottom:20px;color:#5a5d6e;font-size:13px">
      ${scontrino.metodo === 'carta' ? '💳 Pagato con Carta / POS' : `💵 Pagato in Contanti${scontrino.resto > 0 ? ` · Resto €${fmt(scontrino.resto)}` : ''}`}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;color:#5a5d6e;font-size:11px;line-height:1.8">
      Questa è una copia di cortesia del tuo acquisto.<br/>
      Il documento fiscale è lo scontrino rilasciato dalla cassa.<br/>
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
      subject: `Copia del tuo scontrino — ${negozio.nomeOggetto || 'Il tuo acquisto'}`,
      html,
    })

    if (error) {
      console.log('Resend error:', error)
      return res.status(400).json({ 
        error: error.message || 'Errore invio',
        hint: 'Verifica che il dominio mittente sia verificato su Resend'
      })
    }
    return res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
