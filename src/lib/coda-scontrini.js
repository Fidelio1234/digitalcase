// Coda locale degli scontrini ancora da salvare su Supabase (modalita' offline).
// Ogni scontrino riceve un id nostro (uuid) che sara' lo stesso id nel database: cosi' un secondo
// tentativo, anche dopo una risposta persa, non crea doppioni.
const PREFISSO = 'dc_coda_scontrini_'
let sincronizzazioneInCorso = false

export function nuovoIdScontrino() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 3 | 8)).toString(16)
  })
}

function leggi(negozioId) {
  try {
    if (typeof window === 'undefined') return []
    const a = JSON.parse(window.localStorage.getItem(PREFISSO + negozioId) || '[]')
    return Array.isArray(a) ? a : []
  } catch (e) { return [] }
}

function scrivi(negozioId, lista) {
  try { window.localStorage.setItem(PREFISSO + negozioId, JSON.stringify(lista)); return true } catch (e) { return false }
}

// true se scritto davvero
export function accodaScontrino(negozioId, rec) {
  const lista = leggi(negozioId)
  lista.push(rec)
  return scrivi(negozioId, lista)
}

export function contaCoda(negozioId) { return leggi(negozioId).length }

// Se lo scontrino e' ancora in coda, ci annota l'esito della stampa (verra' applicato al salvataggio). true se annotato.
export function esitoInCoda(negozioId, id, esito) {
  const lista = leggi(negozioId)
  const rec = lista.find(x => x.id === id)
  if (!rec) return false
  rec.esito = esito
  return scrivi(negozioId, lista)
}

// Toglie lo scontrino dalla coda e lo restituisce (con l'eventuale esito annotato), oppure null.
export function togliDallaCoda(negozioId, id) {
  const lista = leggi(negozioId)
  const i = lista.findIndex(x => x.id === id)
  if (i < 0) return null
  const [rec] = lista.splice(i, 1)
  scrivi(negozioId, lista)
  return rec
}

// Prova a salvare quello che e' in coda. Si ferma al primo che non riesce (rete assente).
export async function sincronizzaCoda(negozioId, { salva, applicaEsito, attesaMs = 8000 }) {
  if (sincronizzazioneInCorso) return { saltata: true, salvati: 0, restanti: contaCoda(negozioId) }
  sincronizzazioneInCorso = true
  let salvati = 0
  try {
    for (const rec of leggi(negozioId)) {
      let idSalvato = null
      try {
        idSalvato = await Promise.race([
          Promise.resolve(salva(rec.dati)),
          new Promise(res => setTimeout(() => res(null), attesaMs)),
        ])
      } catch (e) {}
      if (!idSalvato) break
      const tolto = togliDallaCoda(negozioId, rec.id)
      salvati++
      if (tolto && tolto.esito) { try { await applicaEsito(rec.id, tolto.esito) } catch (e) {} }
    }
  } finally { sincronizzazioneInCorso = false }
  return { salvati, restanti: contaCoda(negozioId) }
}

// Attende una promessa al massimo 'ms' millisecondi: se scade ritorna SCADUTO e la promessa continua in background.
export const SCADUTO = '__scaduto__'
export function attendiMax(promessa, ms) {
  return Promise.race([promessa, new Promise(res => setTimeout(() => res(SCADUTO), Math.max(0, ms)))])
}
