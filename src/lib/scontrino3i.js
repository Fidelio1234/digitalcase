// DigitalCase - Verifica che la cassa 3i abbia DAVVERO emesso lo scontrino.
//
// Usa il comando 84F (manuale 3i par. 4.1.3): risposta "AAAASSSS@@"
//   AAAA = numero azzeramento, SSSS = numero scontrino (es. "00360027@@")
//
// Idea: lo scontrino parte SUBITO, come adesso (nessuna attesa per il cassiere).
// In background si legge il numero scontrino della cassa: se e' salito, lo scontrino
// e' stato emesso; se non sale entro il tempo massimo, si avvisa il cassiere.
//
// Lo stato e' a livello di modulo (non del componente): la verifica continua anche
// se il cassiere cambia pagina (es. ritorno automatico ai tavoli).

const pausa = ms => new Promise(r => setTimeout(r, ms))

export function parse84F(testo) {
  if (typeof testo !== 'string') return null
  const pulito = testo.replace(/[\x00-\x1f]/g, '') // toglie XON/XOFF, CR, LF
  const m = pulito.match(/(\d{4})(\d{4})@@/)
  if (!m) return null
  return { azzeramento: parseInt(m[1], 10), scontrino: parseInt(m[2], 10) }
}

export const ESITI_SCONTRINO = {
  non_emesso: {
    titolo: 'SCONTRINO NON EMESSO',
    testo: 'La cassa risponde, ma il numero scontrino non è aumentato: lo scontrino NON è stato stampato. Controlla il display della cassa (carta, errore, scontrino aperto) e rifai lo scontrino.',
  },
  cassa_non_risponde: {
    titolo: 'CASSA NON RISPONDE',
    testo: 'Non riesco a sapere se lo scontrino è stato stampato. Controlla subito la cassa: se lo scontrino non è uscito, rifallo.',
  },
}

// Testi per RCH / Ditron (non hanno il numero scontrino della 3i: si giudica la risposta della cassa).
export const ESITI_SCONTRINO_RT = {
  rifiutato: {
    titolo: 'SCONTRINO NON EMESSO',
    testo: 'La cassa ha rifiutato lo scontrino: NON è stato stampato. Controlla il display della cassa e rifai lo scontrino.',
  },
  non_risponde: {
    titolo: 'CASSA NON RISPONDE',
    testo: 'Non riesco a sapere se lo scontrino è stato stampato. Controlla subito la cassa: se lo scontrino non è uscito, rifallo.',
  },
  carta_finita: {
    titolo: 'CARTA FINITA',
    testo: 'Inserisci la carta nella cassa: la cassa completa da sola la stampa dello scontrino. NON rifare lo scontrino, altrimenti ne escono due.',
  },
  coperchio_aperto: {
    titolo: 'COPERCHIO APERTO',
    testo: 'Chiudi il coperchio della cassa e controlla il display: verifica se lo scontrino è uscito prima di rifarlo.',
  },
}

// ── Stato condiviso ──────────────────────────────────────────────────────────
const S = {
  base: null,        // ultimo { azzeramento, scontrino } letto dalla cassa
  ultimoTarget: 0,   // numero atteso dopo tutti gli scontrini gia' inviati
  inVolo: 0,         // scontrini inviati e non ancora verificati
  deficit: 0,        // scontrini non emessi nel gruppo in corso (corregge i target successivi)
  silenzi: 0,        // letture 84F andate a vuoto di fila (certe versioni non supportano 84F)
  coda: Promise.resolve(),
}

async function leggi(chiediNumeri) {
  try {
    const r = parse84F(await chiediNumeri())
    if (r) S.silenzi = 0; else S.silenzi++
    return r
  } catch { S.silenzi++; return null }
}

// Oltre questa soglia la cassa non sa rispondere a 84F (firmware precedente alla 4.1:
// risponde ERRORE XON/XOFF 12). Si smette di chiedere: niente falsi allarmi e niente
// errore sul display della cassa a ogni scontrino. Una lettura riuscita riazzera tutto.
const SILENZI_PER_RINUNCIA = 6
export function verificaDisponibile() { return S.silenzi < SILENZI_PER_RINUNCIA }

// Legge il numero scontrino attuale (da fare all'apertura della cassa).
export function sincronizzaBase(chiediNumeri, { tentativi = 3, intervallo = 2000 } = {}) {
  const p = S.coda.then(async () => {
    if (S.inVolo > 0) return S.base
    S.silenzi = 0 // nuovo tentativo: si riparte da zero
    for (let i = 0; i < tentativi; i++) {
      const n = await leggi(chiediNumeri)
      
      if (n) { S.base = n; S.ultimoTarget = n.scontrino; S.deficit = 0; return n }
      if (i < tentativi - 1) await pausa(intervallo)
    }
    return null
  })
  S.coda = p.catch(() => {})
  return p
}

/**
 * 1) registraInvio(): da chiamare PRIMA di mandare lo scontrino alla cassa (subito, senza await).
 *    Fissa in quel momento il numero scontrino che la cassa dovra' raggiungere.
 *    (Se lo si facesse dopo la risposta della cassa, gli scontrini ravvicinati
 *    verrebbero contati male e darebbero falsi allarmi.)
 * 2) verificaScontrino({ ticket, ... }): da chiamare DOPO l'invio. Non va aspettata (await).
 * 3) annullaInvio(ticket): se l'invio e' fallito di sicuro (cassa non raggiungibile).
 */
export function registraInvio() {
  const base = S.base
  S.inVolo++
  let target = null
  if (base) { target = Math.max(S.ultimoTarget, base.scontrino) + 1; S.ultimoTarget = target }
  return { base, target, usato: false }
}

function chiudiInVolo() {
  S.inVolo--
  if (S.inVolo <= 0) { S.inVolo = 0; S.deficit = 0; S.ultimoTarget = S.base?.scontrino ?? 0 }
}

export function annullaInvio(ticket) {
  if (!ticket || ticket.usato) return
  ticket.usato = true
  if (ticket.target != null) S.deficit++ // gli scontrini successivi contavano anche questo
  chiudiInVolo()
}

/**
 * chiediNumeri  async () => testo grezzo della risposta 84F (lancia se la cassa non risponde)
 * onEsito       (r) => void   r.esito: 'emesso' | 'non_emesso' | 'cassa_non_risponde' | 'non_verificabile'
 */



export function verificaScontrino({ ticket, chiediNumeri, intervallo = 1500, attesa = 12000, attesaSenzaRisposta = 60000, graziaDopoSilenzio = 5000, onSilenzio = () => {}, onEsito = () => {} }) {
  const t = ticket || registraInvio()
  if (t.usato) return Promise.resolve({ esito: 'non_verificabile', motivo: 'invio gia annullato' })
  t.usato = true
  const { base, target } = t

  const p = S.coda.then(async () => {
    let timerSilenzio = null
    try {
      if (S.silenzi >= SILENZI_PER_RINUNCIA) {
        return { esito: 'non_verificabile', motivo: 'la cassa non risponde al comando 84F' }
      }
      if (!base) {
        // Mai letta la cassa prima di questo scontrino: non si puo' provare niente.
        // Rileggo il numero per verificare gli scontrini successivi, ma questo lo segnalo come dubbio.
        const n = await leggi(chiediNumeri)
        if (n && S.inVolo === 1) { S.base = n; S.ultimoTarget = n.scontrino }
        // Se la cassa non risponde nemmeno ora, non e' una prova che lo scontrino non sia
        // uscito: puo' semplicemente non conoscere il comando. Meglio tacere che allarmare.
        return n
          ? { esito: 'cassa_non_risponde', motivo: 'numero iniziale della cassa non noto' }
          : { esito: 'non_verificabile', motivo: 'nessuna risposta al comando 84F' }
      }
      const t0 = Date.now()
      let ultima = null
      let fallite = 0            // letture senza risposta
      let tPrimaRisposta = null  // quando la cassa ha risposto la prima volta
      let dopoSilenzio = false   // la cassa ha risposto solo dopo un periodo di silenzio (es. sportello aperto)
      // Se la cassa non ha mai risposto entro 'attesa', avvisa subito il cassiere.
      timerSilenzio = setTimeout(() => {
        if (tPrimaRisposta == null) { try { onSilenzio() } catch (e) { console.error('onSilenzio:', e) } }
      }, attesa)
      while (true) {
        const n = await leggi(chiediNumeri)
        
        if (!n) fallite++
        if (n) {
          if (tPrimaRisposta == null) { tPrimaRisposta = Date.now(); dopoSilenzio = fallite > 0 }
          ultima = n
          if (S.base && n.azzeramento !== S.base.azzeramento) {
            // Nel frattempo e' stata fatta una chiusura: la numerazione riparte.
            S.base = n; S.ultimoTarget = n.scontrino
            return { esito: 'non_verificabile', motivo: 'azzeramento cambiato' }
          }
          if (n.scontrino >= target - S.deficit) {
            S.base = { azzeramento: n.azzeramento, scontrino: Math.max(S.base?.scontrino ?? 0, n.scontrino) }
            return { esito: 'emesso', numero: n.scontrino, azzeramento: n.azzeramento }
          }
        }
        const ora = Date.now()
        const scaduto = tPrimaRisposta == null
          ? ora - t0 >= attesaSenzaRisposta
          : dopoSilenzio
            ? ora - tPrimaRisposta >= graziaDopoSilenzio
            : ora - t0 >= attesa
        if (scaduto) break
        await pausa(intervallo)
      }
      if (ultima) {
        S.deficit++
        S.base = ultima
        return { esito: 'non_emesso', numero: ultima.scontrino, azzeramento: ultima.azzeramento }
      }
      return { esito: 'cassa_non_risponde' }
    } finally {
      clearTimeout(timerSilenzio)
      chiudiInVolo()
    }
  }).then(r => { try { onEsito(r) } catch (e) { console.error('onEsito:', e) } return r })

  S.coda = p.catch(() => {})
  return p
}







// Solo per i test.
export function _azzeraStato() {
  S.base = null; S.ultimoTarget = 0; S.inVolo = 0; S.deficit = 0; S.silenzi = 0; S.coda = Promise.resolve()
}

// ── Avvisi che sopravvivono al cambio pagina ────────────────────────────────
export const EVENTO_PROBLEMA_STAMPA = 'dc-problema-stampa'
// La cassa chiede di ricaricare le righe di uno scontrino non emesso.
export const EVENTO_RIFAI_SCONTRINO = 'dc-rifai-scontrino'
export const CHIAVE_DA_RIFARE = 'dc_scontrino_da_rifare'
const CHIAVE = 'dc_problemi_stampa'

export function leggiProblemiStampa() {
  try { return JSON.parse(localStorage.getItem(CHIAVE) || '[]') } catch { return [] }
}

export function segnalaProblemaStampa(info) {
  try {
    const lista = leggiProblemiStampa()
    lista.push(info)
    localStorage.setItem(CHIAVE, JSON.stringify(lista.slice(-20)))
    window.dispatchEvent(new Event(EVENTO_PROBLEMA_STAMPA))
  } catch { /* storage non disponibile: resta il dato su Supabase */ }
}

export function rimuoviPrimoProblemaStampa() {
  try {
    const lista = leggiProblemiStampa()
    lista.shift()
    localStorage.setItem(CHIAVE, JSON.stringify(lista))
    window.dispatchEvent(new Event(EVENTO_PROBLEMA_STAMPA))
  } catch {}
}