/**
 * DigitalCase — Integrazione Ditron RT
 * Protocollo: WinEcrCom 3.0 via TCP/IP (porta configurabile)
 * 
 * Comandi principali:
 *   vend rep=N, pre=X.XX, qty=N, des='...'  → riga scontrino
 *   chius t=1, imp=X.XX                      → chiusura contanti
 *   chius t=5                                → chiusura carta
 *   azzgio tipo=1                            → chiusura fiscale Z
 *   report num=2                             → lettura X (parziale)
 *   docannullo ...                           → annullo scontrino RT
 *   dgfe ...                                 → lettura DGFE
 */

// ─── BUILDER COMANDI ────────────────────────────────────────────────────────

/**
 * Costruisce il comando testo per uno scontrino completo
 * @param {Array} righe - [{nome, importo, quantita, iva, numeroRepartoRt}]
 * @param {string} metodo - 'contanti' | 'carta'
 * @param {number} totale - totale in centesimi
 * @param {number} resto - resto in centesimi (solo contanti)
 * @param {string} contatto - codice fiscale opzionale (scontrino parlante)
 */
export function buildScontrino(righe, metodo, totale, resto = 0, contatto = null) {
    const lines = []
  
    // Scontrino parlante (codice fiscale)
    if (contatto) {
      lines.push(`cfis cf='${contatto}'`)
    }
  
    // Righe vendita
    for (const riga of righe) {
      const rep = riga.numeroRepartoRt || 1
      const prezzo = (riga.importo / 100).toFixed(2)
      const qty = riga.quantita || 1
      const des = (riga.nome || '').substring(0, 24).replace(/'/g, ' ')
      
      if (qty > 1) {
        lines.push(`vend rep=${rep}, pre=${prezzo}, qty=${qty}, des='${des}'`)
      } else {
        lines.push(`vend rep=${rep}, pre=${prezzo}, des='${des}'`)
      }
    }
  
    // Chiusura per metodo pagamento
    const totaleEuro = (totale / 100).toFixed(2)
    if (metodo === 'contanti') {
      lines.push(`chius t=1, imp=${totaleEuro}`)
    } else if (metodo === 'carta') {
      lines.push(`chius t=5, imp=${totaleEuro}`)
    } else if (metodo === 'assegno') {
      lines.push(`chius t=3, imp=${totaleEuro}`)
    } else {
      lines.push(`chius t=1, imp=${totaleEuro}`)
    }
  
    return lines.join('\n')
  }
  
  /**
   * Costruisce il comando per annullo scontrino RT
   * @param {string} matricola - matricola RT (es. '2CIDE018691')
   * @param {number} numeroAzzeramento - numero chiusura (XXXX parte sinistra)
   * @param {number} numeroDocumento - numero scontrino (XXXX parte destra)
   * @param {string} data - data scontrino formato 'DDMMYY'
   */
  export function buildAnnullo(matricola, numeroAzzeramento, numeroDocumento, data) {
    return `docannullo mat='${matricola}', nazz=${numeroAzzeramento}, ndoc=${numeroDocumento}, data=${data}`
  }
  
  /**
   * Chiusura fiscale Z (azzeramento giornaliero)
   * tipo=1 esteso, tipo=2 breve, tipo=3 medio
   */
  export function buildChiusuraFiscale(tipo = 1) {
    return `azzgio tipo=${tipo}`
  }
  
  /**
   * Lettura X (report parziale senza azzeramento)
   * num=2 breve, num=3 esteso, num=4 medio
   */
  export function buildLetturaX(tipo = 2) {
    return `report num=${tipo}`
  }
  
  /**
   * Ristampa scontrini da DGFE
   * @param {string} dataInizio - formato 'DDMMYY'
   * @param {string} dataFine - formato 'DDMMYY'
   * @param {number} dalNumero - da numero scontrino (0 = tutti)
   * @param {number} alNumero - a numero scontrino
   */
  export function buildRistampa(dataInizio, dataFine, dalNumero = 0, alNumero = 0) {
    return `dgfe tipo=160, datada=${dataInizio}, dataa=${dataFine}, nda=${dalNumero}, na=${alNumero}`
  }
  
  /**
   * Lettura DGFE completa
   */
  export function buildLeggiDGFE(dataInizio, dataFine) {
    return `dgfe tipo=166, datada=${dataInizio}, dataa=${dataFine}`
  }
  
  /**
   * Programmazione reparto sulla cassa
   * @param {number} numero - numero reparto (1-16)
   * @param {string} descrizione - max 24 caratteri
   * @param {number} ivaIndice - indice aliquota IVA sulla cassa (1=10%, 2=22%, ecc.)
   * @param {number} prezzoMassimo - prezzo massimo in euro
   */
  export function buildProgrammaReparto(numero, descrizione, ivaIndice, prezzoMassimo = 10000) {
    const des = descrizione.substring(0, 24).replace(/'/g, ' ')
    return [
      'prog',
      `prep nr=${numero}, des='${des}', lis=${prezzoMassimo}.00, bat=si, iva=${ivaIndice}, gru=1, sconto=si`,
      'fineprog'
    ].join('\n')
  }
  
  // ─── FORMATO DATA ────────────────────────────────────────────────────────────
  
  /**
   * Converte data JS in formato Ditron DDMMYY
   */
  export function formatDataDitron(date = new Date()) {
    const d = String(date.getDate()).padStart(2, '0')
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const y = String(date.getFullYear()).slice(-2)
    return `${d}${m}${y}`
  }
  
  // ─── PARSER RISPOSTA ─────────────────────────────────────────────────────────
  
  /**
   * Interpreta la risposta della cassa
   * Formato risposta: TOTG NR=1, CONT=0, VAL=100000
   */
  export function parseRispostaDitron(testo) {
    const result = { ok: false, dati: {}, errore: null }
    
    if (!testo) { result.errore = 'Nessuna risposta'; return result }
    
    // Controlla errori
    if (testo.includes('ERRORE') || testo.includes('ERROR')) {
      result.errore = testo.trim()
      return result
    }
  
    result.ok = true
  
    // Parsa totali giorno (TOTG)
    const totgLines = testo.split('\n').filter(l => l.startsWith('TOTG'))
    if (totgLines.length > 0) {
      result.dati.totali = {}
      for (const line of totgLines) {
        const nr = line.match(/NR=(\d+)/)?.[1]
        const val = line.match(/VAL=(\d+)/)?.[1]
        const cont = line.match(/CONT=(\d+)/)?.[1]
        if (nr) result.dati.totali[nr] = { valore: parseInt(val || 0), contatore: parseInt(cont || 0) }
      }
      // Mappa significati principali
      const t = result.dati.totali
      result.dati.riepilogo = {
        contanti: t['1']?.valore || 0,
        crediti: t['2']?.valore || 0,
        cartaDiCredito: t['5']?.valore || 0,
        venditeLorde: t['15']?.valore || 0,
        venditeNette: t['14']?.valore || 0,
        scontrini: t['31']?.valore || 0,
        resi: t['33']?.valore || 0,
        annulli: t['34']?.valore || 0,
      }
    }
  
    // Parsa reparti (PREP / TOTREP)
    const prepLines = testo.split('\n').filter(l => l.startsWith('PREP') || l.startsWith('TOTREP'))
    if (prepLines.length > 0) {
      result.dati.reparti = prepLines.map(line => {
        const nr = line.match(/NR=(\d+)/)?.[1]
        const des = line.match(/DES='([^']+)'/)?.[1]
        const iva = line.match(/IVA=(\d+)/)?.[1]
        const val = line.match(/VAL=(\d+)/)?.[1]
        return { numero: parseInt(nr), nome: des, iva: parseInt(iva), totale: parseInt(val || 0) }
      })
    }
  
    return result
  }
  