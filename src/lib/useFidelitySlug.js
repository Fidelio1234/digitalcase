// lib/useFidelitySlug.js
// Estrae lo slug del negozio quando si è su un sottodominio *.fidelity.digitalcase.it
// Esempio: dmi.fidelity.digitalcase.it -> slug "dmi"

import { useState, useEffect } from 'react'

export function useFidelitySlug() {
  const [slug, setSlug] = useState(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hostname = window.location.hostname
    let s = null

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Sviluppo locale — stesso default usato in NegozioContext
      s = process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
    } else if (hostname.endsWith('.fidelity.digitalcase.it')) {
      s = hostname.replace('.fidelity.digitalcase.it', '')
    }

    setSlug(s)
    setPronto(true)
  }, [])

  return { slug, pronto }
}