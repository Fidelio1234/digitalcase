import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID as NEGOZIO_ID_DEFAULT } from '@/lib/config'

export async function stampaComanda(tavolo, righe, tipo = 'comanda', reparti = [], negozioId = null) {
  const NEGOZIO_ID = negozioId || NEGOZIO_ID_DEFAULT
    // Nessuna stampante comande attiva per questo negozio: niente da accodare
    const { data: imp } = await supabase
    .from('impostazioni_negozio')
    .select('stampanti')
    .eq('negozio_id', NEGOZIO_ID)
    .maybeSingle()
  const haStampanti = (imp?.stampanti || []).some(s => s.attiva && s.ip)
  if (!haStampanti) return
  let righeFinali = righe

  // Se c'è già una comanda in attesa di stampa, la nuova va ACCODATA, non sostituita
  const { data: esistente } = await supabase
    .from('tavoli')
    .select('comanda_pending')
    .eq('negozio_id', NEGOZIO_ID)
    .eq('numero', tavolo)
    .maybeSingle()
  const pendente = esistente?.comanda_pending

  if (pendente?.tipo === 'comanda') {
    if (tipo === 'comanda') {
      righeFinali = [...(pendente.righe || []), ...righe]
    } else {
      // Una comanda non ancora stampata non si sovrascrive con un preconto
      // (il preconto si può rilanciare, la comanda no)
      console.warn('stampaComanda: comanda in attesa, preconto non accodato')
      return
    }
  }

  // Salva comanda_pending su Supabase
  // Il service-polling.js locale la leggerà e stamperà
  await supabase
    .from('tavoli')
    .update({ comanda_pending: { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), righe: righeFinali, tipo, reparti: reparti.map(r => ({ id: r.id, uscita: r.uscita || 1 })) } })
    .eq('negozio_id', NEGOZIO_ID)
    .eq('numero', tavolo)
}