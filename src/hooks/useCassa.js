import { useState, useCallback } from 'react'

// Tutta la logica della cassa — separata dall'interfaccia
export function useCassa() {
  const [inputCents, setInputCents] = useState(0)      // importo digitato in centesimi
  const [righe, setRighe] = useState([])               // battute dello scontrino
  const [ultimaChiusa, setUltimaChiusa] = useState(null) // ultima riga dopo chiusura
  const [errore, setErrore] = useState('')             // messaggio errore

  // ── Tastiera ───────────────────────────────────────────────────────────────
  const pressDigit = useCallback((digit) => {
    setErrore('')
    setUltimaChiusa(null) // sparisce al primo tasto
    setInputCents(prev => {
      const str = String(prev) + String(digit)
      const val = parseInt(str, 10)
      return val > 9999999 ? prev : val // max 99.999,99€
    })
  }, [])

  const pressDoubleZero = useCallback(() => {
    setErrore('')
    setUltimaChiusa(null)
    setInputCents(prev => {
      const str = String(prev) + '00'
      const val = parseInt(str, 10)
      return val > 9999999 ? prev : val
    })
  }, [])

  const pressClear = useCallback(() => {
    setInputCents(0)
    setErrore('')
  }, [])

  // ── Aggiungi riga (quando si clicca reparto) ───────────────────────────────
  const aggiungiRiga = useCallback((reparto, sottoreparto = null) => {
    const importo = sottoreparto ? sottoreparto.prezzoFisso : inputCents
    const nome = sottoreparto ? sottoreparto.nome : reparto.nome
    const iva = sottoreparto?.ivaOverride ?? reparto.iva
    const massimoImporto = sottoreparto
      ? sottoreparto.massimoImporto
      : reparto.massimoImporto
    const minimoImporto = sottoreparto
      ? sottoreparto.minimoImporto
      : reparto.minimoImporto

    // Validazione importo
    if (importo <= 0) {
      setErrore('Importo non valido')
      return false
    }
    if (importo > massimoImporto) {
      setErrore(`Importo supera il massimo di €${fmt(massimoImporto)} per ${nome}`)
      return false
    }
    if (importo < minimoImporto) {
      setErrore(`Importo inferiore al minimo di €${fmt(minimoImporto)} per ${nome}`)
      return false
    }

    const nuovaRiga = {
      id: Date.now() + Math.random(),
      nome,
      importo,
      iva,
      colore: reparto.colore,
      icona: reparto.icona,
      repartoId: reparto.id,
      sottoRepartoId: sottoreparto?.id || null,
    }

    setRighe(prev => {
      // Raggruppa se stessa voce
      const esistente = prev.findIndex(r =>
        r.nome === nuovaRiga.nome &&
        r.importo === nuovaRiga.importo &&
        r.repartoId === nuovaRiga.repartoId
      )
      if (esistente >= 0) {
        const aggiornato = [...prev]
        aggiornato[esistente] = {
          ...aggiornato[esistente],
          quantita: (aggiornato[esistente].quantita || 1) + 1,
          totaleRiga: ((aggiornato[esistente].quantita || 1) + 1) * nuovaRiga.importo
        }
        return aggiornato
      }
      return [...prev, { ...nuovaRiga, quantita: 1, totaleRiga: nuovaRiga.importo }]
    })

    setInputCents(0)
    setErrore('')
    return true
  }, [inputCents])

  // ── Annulla ultima riga ────────────────────────────────────────────────────
  const annullaUltima = useCallback(() => {
    setRighe(prev => {
      if (prev.length === 0) return prev
      const nuove = [...prev]
      const ultima = nuove[nuove.length - 1]
      if (ultima.quantita > 1) {
        nuove[nuove.length - 1] = {
          ...ultima,
          quantita: ultima.quantita - 1,
          totaleRiga: (ultima.quantita - 1) * ultima.importo
        }
      } else {
        nuove.pop()
      }
      return nuove
    })
  }, [])

  // ── Annulla tutto ──────────────────────────────────────────────────────────
  const annullaTutto = useCallback(() => {
    setRighe([])
    setInputCents(0)
    setErrore('')
    setUltimaChiusa(null)
  }, [])

  // ── Chiudi scontrino ───────────────────────────────────────────────────────
  const chiudiScontrino = useCallback(() => {
    if (righe.length === 0) return null
    const scontrino = {
      id: 'SC' + Date.now(),
      righe: [...righe],
      totale: righe.reduce((s, r) => s + r.totaleRiga, 0),
      timestamp: new Date().toISOString(),
    }
    setUltimaChiusa(righe[righe.length - 1])
    setRighe([])
    setInputCents(0)
    return scontrino
  }, [righe])

  // ── Subtotale ──────────────────────────────────────────────────────────────
  const totale = righe.reduce((s, r) => s + r.totaleRiga, 0)
  const subtotalePerIva = righe.reduce((acc, r) => {
    const k = String(r.iva)
    acc[k] = (acc[k] || 0) + r.totaleRiga
    return acc
  }, {})

  return {
    inputCents,
    righe,
    ultimaChiusa,
    errore,
    totale,
    subtotalePerIva,
    pressDigit,
    pressDoubleZero,
    pressClear,
    aggiungiRiga,
    annullaUltima,
    annullaTutto,
    chiudiScontrino,
  }
}

// helper interno
function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}
