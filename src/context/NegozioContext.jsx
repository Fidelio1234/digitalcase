import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const NegozioContext = createContext(null)

export function NegozioProvider({ children }) {
  const [negozio, setNegozio] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)

  useEffect(() => {
    risolviNegozio()
  }, [])

  async function risolviNegozio() {
    try {
      let slug = null

      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname
        console.log('Hostname:', hostname)

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          // Sviluppo locale — usa slug da env o default
          slug = process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
        } else if (hostname.endsWith('.digitalcase.it')) {
          // Produzione — estrai slug dal sottodominio
          slug = hostname.replace('.digitalcase.it', '')
        } else if (hostname === 'digitalcase.it' || hostname === 'www.digitalcase.it') {
          // Root domain — pagina marketing
          slug = null
        } else {
          // Fallback (es. digitalcase.vercel.app)
          slug = process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
        }
      }

      if (!slug) {
        setNegozio(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('negozi')
        .select('*')
        .eq('slug', slug)
        .eq('attivo', true)
        .single()

      if (error || !data) {
        setErrore(`Negozio "${slug}" non trovato`)
        setLoading(false)
        return
      }

      // Controlla scadenza licenza
      if (data.data_scadenza) {
        const scadenza = new Date(data.data_scadenza)
        const ora = new Date()
        if (scadenza < ora) {
          data.scaduto = true
        } else {
          data.scaduto = false
          // Calcola giorni rimanenti
          data.giorniRimanenti = Math.ceil((scadenza - ora) / (1000 * 60 * 60 * 24))
        }
      }
      setNegozio(data)
    } catch(e) {
      setErrore(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <NegozioContext.Provider value={{ negozio, loading, errore }}>
      {children}
    </NegozioContext.Provider>
  )
}

export function useNegozio() {
  return useContext(NegozioContext)
}
