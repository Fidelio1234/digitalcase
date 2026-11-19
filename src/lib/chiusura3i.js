// DigitalCase - Chiusura fiscale 3i con verifica reale sulla cassa.
//
// Usa il comando 88F (stato registratore per software-house, manuale 3i par. 4.1.2).
// Risposta: MATRICOLA#VERSIONE#DGFE#TIPO#AZZERAMENTO#PENDING#@@
//   AZZERAMENTO = numero dell'ultima chiusura fatta dalla cassa
//   PENDING     = chiusure fatte ma non ancora trasmesse all'Agenzia delle Entrate
//
// Logica:
//   1. legge lo stato PRIMA (se la cassa non risponde la chiusura NON parte)
//   2. manda la Z
//   3. rilegge finche' il numero di azzeramento cambia (= la cassa ha chiuso davvero)
//   4. controlla i pending: se non sono aumentati rispetto a prima = chiusura inviata

const pausa = ms => new Promise(r => setTimeout(r, ms))

// Legge la risposta di 88F. Ritorna null se non e' una risposta valida.
export function parse88F(testo) {
  if (typeof testo !== 'string') return null
  const pulito = testo.replace(/[\x00-\x1f]/g, '') // toglie XON/XOFF, CR, LF
  const fine = pulito.indexOf('@@')
  if (fine < 0) return null
  const campi = pulito.slice(0, fine).split('#')
  if (campi.length < 6) return null
  const azzeramento = parseInt(campi[4], 10)
  const pending = parseInt(campi[5], 10)
  if (Number.isNaN(azzeramento) || Number.isNaN(pending)) return null
  return { matricola: campi[0].trim(), versione: campi[1].trim(), azzeramento, pending }
}

// Testi per il modal (colori gia' usati dal programma)
export const ESITI = {
  inviata: {
    colore: '#00e5a0', icona: '✓', titolo: 'CHIUSURA INVIATA',
    testo: "La cassa ha eseguito la chiusura e l'ha inviata all'Agenzia delle Entrate.",
  },
  non_inviata: {
    colore: '#ffb830', icona: '!', titolo: 'CHIUSURA NON INVIATA',
    testo: "La cassa ha eseguito e stampato la chiusura, ma NON l'ha ancora inviata all'Agenzia delle Entrate. Verra' inviata alla prossima trasmissione automatica della cassa.",
  },
  non_eseguita: {
    colore: '#ff4d6a', icona: '✗', titolo: 'CHIUSURA NON ESEGUITA',
    testo: 'La cassa non ha eseguito la chiusura. Controlla il display della cassa e riprova.',
  },
  incerta: {
    colore: '#ffb830', icona: '?', titolo: 'CONTROLLA LA STAMPANTE',
    testo: "La cassa ha smesso di rispondere mentre lavorava: il programma non puo' sapere se la chiusura e' uscita. GUARDA LA CARTA della cassa. Se lo scontrino di chiusura Z e' stampato NON rifarla: premi \u00ab La chiusura e' uscita \u00bb e la registro io.",
  },
  non_raggiungibile: {
    colore: '#ff4d6a', icona: '✗', titolo: 'CASSA NON RAGGIUNGIBILE',
    testo: 'Nessuna chiusura inviata. Controlla che la cassa sia accesa e collegata alla rete (cavo, IP).',
  },
  cassa_in_errore: {
    colore: '#ff4d6a', icona: '✗', titolo: 'CASSA NON PRONTA',
    testo: 'La cassa risponde ma non fornisce lo stato. Nessuna chiusura inviata. Controlla il display: carta finita, errore o scontrino aperto.',
  },
}

// Salvare la riga in "chiusure" solo se la cassa ha davvero chiuso.
export function chiusuraEseguita(esito) {
  return esito === 'inviata' || esito === 'non_inviata'
}

// Con esito incerto la riga NON si salva da sola: la salva la conferma dell'operatore,
// che il programma verifica rileggendo la cassa (vedi PannelloRT).
export function chiusuraDaConfermare(esito) {
  return esito === 'incerta'
}

/**
 * chiediStato     async () => stato | null   (lancia se la cassa non e' raggiungibile)
 * inviaChiusura   async () => { ok, error }  (manda z, 1F, c)
 * onFase          (fase) => void             'lettura' | 'chiusura' | 'verifica' | 'invio'
 */
export async function eseguiChiusuraVerificata({
  chiediStato,
  inviaChiusura,
  onFase = () => {},
  intervallo = 1000,        // ogni quanto rilegge lo stato
  attesaChiusura = 180000,  // quanto aspetta che la cassa chiuda (la stampa Z e' lenta: fino a 3 minuti)
  assestamento = 4000,      // pausa dopo la chiusura prima di guardare i pending
  attesaInvio = 30000,      // quanto aspetta la trasmissione (normalmente ~10 s)
}) {
  // 1. stato prima
  onFase('lettura')
  let prima
  try {
    prima = await chiediStato()
  } catch (e) {
    return { esito: 'non_raggiungibile', dettaglio: e.message }
  }
  if (!prima) return { esito: 'cassa_in_errore', dettaglio: 'Risposta 88F non valida' }

  const base = { azzeramentoPrima: prima.azzeramento, pendingPrima: prima.pending }

  // 2. chiusura
  onFase('chiusura')
  let esitoZ
  try { esitoZ = await inviaChiusura() } catch (e) { esitoZ = { ok: false, error: e.message } }

  // 3. la cassa ha davvero chiuso? (il numero di azzeramento cambia)
  onFase('verifica')
  let dopo = null
  let risposte = 0 // quante volte la cassa ha risposto durante la verifica
  const t0 = Date.now()

  while (Date.now() - t0 < attesaChiusura) {
    try {
      const s = await chiediStato()
      if (s) risposte++
      if (s && s.azzeramento !== prima.azzeramento) { dopo = s; break }
    } catch { /* la cassa e' occupata a stampare: riprova */ }
    await pausa(intervallo)
  }


  if (!dopo) {
    // La cassa ha risposto e l'ultima chiusura e' ancora la stessa: la Z non e' uscita, e lo si puo' dire.
    if (risposte > 0) {
      return { esito: 'non_eseguita', ...base, dettaglio: esitoZ?.ok === false ? esitoZ.error : 'Azzeramento invariato' }
    }
    // Non ha risposto nemmeno una volta: non e' una prova che la chiusura non sia stata fatta.
    // Dire "non eseguita" qui porta l'operatore a fare una seconda Z nello stesso giorno.
    return { esito: 'incerta', ...base, dettaglio: esitoZ?.ok === false ? esitoZ.error : 'La cassa non ha risposto durante la verifica' }
  }

  // 4. inviata all'Agenzia? (i pending non devono essere aumentati)
  onFase('invio')
  await pausa(assestamento)
  let ultimo = dopo
  const t1 = Date.now()
  while (true) {
    try { const s = await chiediStato(); if (s) ultimo = s } catch { /* riprova */ }
    // Solo a coda vuota siamo certi che sia passata ANCHE la nostra: con chiusure arretrate
    // il conteggio puo' scendere perche' la cassa ha trasmesso una vecchia.
    if (ultimo.pending === 0) {
      return { esito: 'inviata', ...base, azzeramentoDopo: ultimo.azzeramento, pendingDopo: ultimo.pending }
    }
    if (Date.now() - t1 >= attesaInvio) break
    await pausa(intervallo)
  }
  return { esito: 'non_inviata', ...base, azzeramentoDopo: ultimo.azzeramento, pendingDopo: ultimo.pending }
}