/**
 * Builder comandi RCH Print!F
 * Protocollo Web Service XML over HTTP porta 80
 */

// Mappa IVA RCH: indice → codice reparto
// 0=ES(N4), 1=IVA A(1), 2=IVA B(2), 3=IVA C(3), 4=IVA D(4)
// 5=IVA F(5), 6=IVA G(6), 7=IVA H(7), 8=EE(N1), 9=NS(N2), 10=NI(N3), 11=RM(N5), 12=AL(N6)
const MAPPA_IVA_RCH = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12 }

export function buildScontrino(righe, metodo, rtConfig) {
  const comandi = []
  const mappatura = rtConfig?.mappatura || {}

  for (const riga of righe) {
    const importoCentesimi = Math.round(riga.importo) // importo già in centesimi
    const quantita = riga.quantita || 1
    const descrizione = (riga.nome || '').replace(/[()\/]/g, ' ').substring(0, 36)

    // Trova indice reparto dalla mappatura
    const ivaIndice = mappatura[riga.repartoId]?.ivaIndice || 1

    if (quantita > 1) {
      comandi.push(`=R${ivaIndice}/$${importoCentesimi}/*${quantita}/(${descrizione})`)
    } else {
      comandi.push(`=R${ivaIndice}/$${importoCentesimi}/(${descrizione})`)
    }
  }

  // Pagamento
  if (metodo === 'carta') {
    comandi.push('=T4')  // EFT POS
  } else if (metodo === 'assegno') {
    comandi.push('=T3')
  } else {
    comandi.push('=T1')  // Contanti default
  }

  return comandi
}

export function buildChiusuraZ() {
  return ['=C3', '=C10']
}

export function buildLetturaX() {
  return ['=C2', '=C10']
}

export async function inviaRCH(ip, porta = 80, comandi) {
  const res = await fetch('/api/rch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, porta, comandi })
  })
  return res.json()
}
