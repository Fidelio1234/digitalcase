// Totali per aliquota IVA (centesimi, IVA inclusa).
// Le righe sconto (repartoId === null e importo < 0) non fanno gruppo a sé:
// vengono ripartite in proporzione tra le aliquote delle merci.
// Restituisce, per esempio, { '10': 760, '22': 1200 }
export function totaliPerIva(righe = []) {
    const merci = {}
    let scontoTot = 0
    for (const r of righe || []) {
      if (r.repartoId === null && r.importo < 0) {
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