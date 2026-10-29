// Totali per aliquota IVA (centesimi, IVA inclusa).
// Le righe sconto (repartoId === null e importo < 0) non fanno gruppo a sé:
// vengono ripartite in proporzione tra le aliquote delle merci.
// Restituisce, per esempio, { '10': 760, '22': 1200 }
export function totaliPerIva(righe = []) {
    const merci = {}
    let scontoTot = 0
    for (const r of righe || []) {
      if (r.repartoId == null && r.importo < 0) {
        scontoTot += Math.abs(r.totaleRiga || 0)
        continue
      }
      const k = String(r.iva)
      merci[k] = (merci[k] || 0) + (r.totaleRiga || 0)
    }
    const chiavi = Object.keys(merci)
    const base = chiavi.reduce((s, k) => s + merci[k], 0)
    if (scontoTot <= 0 || base <= 0) return merci
  
    const out = {}
    let assegnato = 0
    for (const k of chiavi) {
      const quota = Math.round(scontoTot * merci[k] / base)
      out[k] = merci[k] - quota
      assegnato += quota
    }
    // Il resto dei centesimi va all'aliquota con la base maggiore
    const resto = scontoTot - assegnato
    if (resto !== 0) {
      const kMax = chiavi.reduce((a, b) => (merci[a] >= merci[b] ? a : b))
      out[kMax] -= resto
    }
    return out
  }


// Riepilogo IVA sulle vendite di un periodo (usato dal report "IVA mensile" dello Storico).
// - Gli annullati sono esclusi.
// - Gli scontrini NON STAMPATI dalla cassa (statoRt 'non_emesso') NON entrano nell'IVA: sono contati a parte.
// - Gli scontrini 'da_verificare' entrano nell'IVA ma vengono segnalati.
// - Lo sconto è ripartito tra le aliquote da totaliPerIva (stessa logica della chiusura).
// Importi in centesimi, IVA inclusa; l'IVA è scorporata sul totale di ogni aliquota.
export function riepilogoIvaMensile(scontrini = []) {
  const perAliquota = {}
  let numero = 0
  let annullati = 0
  let nonStampati = 0
  let importoNonStampati = 0
  let daVerificare = 0
  let senzaRighe = 0
  let totaleScontrini = 0
  for (const s of scontrini || []) {
    if (s.annullato) { annullati++; continue }
    if (s.statoRt === 'non_emesso') { nonStampati++; importoNonStampati += s.totale || 0; continue }
    if (s.statoRt === 'da_verificare') daVerificare++
    numero++
    totaleScontrini += s.totale || 0
    if (!s.righe || s.righe.length === 0) { senzaRighe++; continue }
    for (const [k, v] of Object.entries(totaliPerIva(s.righe))) perAliquota[k] = (perAliquota[k] || 0) + v
  }
  const righe = Object.keys(perAliquota)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => {
      const aliquota = Number(k)
      const lordo = perAliquota[k]
      const iva = Math.round(lordo * aliquota / (100 + aliquota))
      return { aliquota, lordo, imponibile: lordo - iva, iva }
    })
  const totaleRighe = righe.reduce((a, r) => a + r.lordo, 0)
  return {
    righe,
    totaleLordo: totaleRighe,
    totaleImponibile: righe.reduce((a, r) => a + r.imponibile, 0),
    totaleIva: righe.reduce((a, r) => a + r.iva, 0),
    numero,
    annullati,
    nonStampati,
    importoNonStampati,
    daVerificare,
    senzaRighe,
    differenza: totaleScontrini - totaleRighe,
  }
}
