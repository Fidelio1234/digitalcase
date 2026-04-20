import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID as NEGOZIO_ID_DEFAULT } from '@/lib/config'

export async function stampaComanda(tavolo, righe, tipo = 'comanda', reparti = [], negozioId = null) {
  const NEGOZIO_ID = negozioId || NEGOZIO_ID_DEFAULT
  // Salva comanda_pending su Supabase
  // Il service-polling.js locale la leggerà e stamperà
  await supabase
    .from('tavoli')
    .update({ comanda_pending: { righe, tipo, reparti: reparti.map(r => ({ id: r.id, uscita: r.uscita || 1 })) } })
    .eq('negozio_id', NEGOZIO_ID)
    .eq('numero', tavolo)
}
