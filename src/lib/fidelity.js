import { supabase } from '@/lib/supabase'

// Cerca un cliente fidelity tramite il token letto dal QR, SOLO nel negozio corrente
// (i QR di un altro negozio non devono funzionare qui, account separati per negozio)
export async function cercaClienteFidelity(negozioId, qrToken) {
  const { data, error } = await supabase
    .from('fidelity_clienti')
    .select('*')
    .eq('negozio_id', negozioId)
    .eq('qr_token', qrToken.trim())
    .eq('attivo', true)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// Accredita punti in base all'importo speso e alla configurazione del negozio.
// Se si supera la soglia, azzera i punti e segnala l'omaggio da applicare.
export async function accreditaPunti(cliente, importoEuro, impostazioniFidelity, operatoreId = null) {
  const centesimiPerPunto = impostazioniFidelity.fidelityCentesimiPerPunto || 100
  const sogliaPunti = impostazioniFidelity.fidelitySogliaPunti || 100
  const valoreOmaggio = impostazioniFidelity.fidelityValoreOmaggio || 0

  const importoCentesimi = Math.round(importoEuro * 100)
  const puntiGuadagnati = Math.floor(importoCentesimi / centesimiPerPunto)
  const puntiPrima = cliente.punti
  const puntiDopoAccredito = puntiPrima + puntiGuadagnati

  const omaggioRaggiunto = puntiDopoAccredito >= sogliaPunti
  const puntiFinali = omaggioRaggiunto ? (puntiDopoAccredito - sogliaPunti) : puntiDopoAccredito

  // 1. Aggiorna il saldo punti del cliente
  await supabase.from('fidelity_clienti').update({ punti: puntiFinali }).eq('id', cliente.id)

  // 2. Registra il movimento di accredito
  await supabase.from('fidelity_movimenti').insert({
    cliente_id: cliente.id,
    negozio_id: cliente.negozio_id,
    tipo: 'accredito',
    importo_euro: importoEuro,
    punti_delta: puntiGuadagnati,
    punti_dopo: puntiDopoAccredito,
    operatore_id: operatoreId,
  })

  // 3. Se omaggio raggiunto, registra anche il riscatto (azzeramento)
  if (omaggioRaggiunto) {
    await supabase.from('fidelity_movimenti').insert({
      cliente_id: cliente.id,
      negozio_id: cliente.negozio_id,
      tipo: 'omaggio_riscattato',
      punti_delta: -puntiDopoAccredito,
      punti_dopo: 0,
      operatore_id: operatoreId,
    })
  }

  return {
    puntiGuadagnati,
    puntiPrima,
    puntiFinali,
    omaggioRaggiunto,
    valoreOmaggio,
  }
}