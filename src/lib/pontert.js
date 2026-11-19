// DigitalCase - canale verso il registratore quando il programma gira dentro l'app Android.
//
// Sul PC ci pensa service.js sulla porta 3002. Dentro l'app Android quel servizio non
// esiste: c'e' invece window.DigitalCaseRT, che fa solo da postino verso la cassa.
// I comandi li costruisce questo file, cosi' restano qui e si aggiornano da soli a ogni
// pubblicazione, senza dover reinstallare l'app sui tablet.

export function ponteDisponibile() {
  return typeof window !== 'undefined' && !!window.DigitalCaseRT
}

const attese = new Map()
let contatore = 0

// L'app risponde chiamando questa funzione: una sola volta la si mette a disposizione.
function preparaRicevitore() {
  if (typeof window === 'undefined' || window.__digitalcaseRTesito) return
  window.__digitalcaseRTesito = testo => {
    let dato = null
    try { dato = JSON.parse(testo) } catch (e) { return }
    const chiudi = attese.get(dato?.id)
    if (!chiudi) return
    attese.delete(dato.id)
    chiudi(dato.ok
      ? { ok: true, risposta: dato.risposta }
      // Stesso linguaggio del servizio sul PC, cosi' il programma riconosce il guasto.
      : { ok: false, error: 'Cassa non raggiungibile: ' + (dato.errore || 'nessuna risposta') })
  }
}

// Da azione a comandi della 3i: le stesse che manda service.js sul PC.
export function comandiPerAzione(azione, dati) {
  if (azione === 'raw') return dati?.cmd ? [dati.cmd] : null
  if (azione === 'chiusura_fiscale') return ['z', '1F', 'c']
  if (azione === 'lettura_x') return ['x', '1F', 'c']
  if (azione === 'ping') return ['K']
  return null
}

export function inviaConPonte({ marca, ip, porta, azione, dati, attendi = true, timeout = 20000 }) {
  preparaRicevitore()

  if (marca !== '3i') {
    return Promise.resolve({ ok: false, error: 'Nell’app questa marca di cassa non è ancora gestita' })
  }
  const comandi = comandiPerAzione(azione, dati)
  if (!comandi) {
    return Promise.resolve({ ok: false, error: 'Comando non gestito nell’app: ' + azione })
  }
  if (!ip) {
    return Promise.resolve({ ok: false, error: 'Indirizzo della cassa non configurato' })
  }

  return new Promise(risolvi => {
    const id = 'rt' + (++contatore) + '-' + Date.now()
    // Rete di sicurezza: se l'app non richiama, non si resta appesi per sempre.
    const scadenza = setTimeout(() => {
      if (attese.has(id)) { attese.delete(id); risolvi({ ok: false, error: 'La cassa non ha risposto' }) }
    }, timeout)
    attese.set(id, esito => { clearTimeout(scadenza); risolvi(esito) })
    try {
      window.DigitalCaseRT.invia(id, ip, parseInt(porta, 10) || 1723, JSON.stringify(comandi), !!attendi)
    } catch (e) {
      clearTimeout(scadenza)
      attese.delete(id)
      risolvi({ ok: false, error: e.message || 'Canale verso la cassa non disponibile' })
    }
  })
}
