import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// --- COPIA LOCALE NEGOZIO (inizio) ---
const CACHE_PREFISSO = 'dc_negozio_'
const CACHE_ETA_MAX_MS = 7 * 24 * 60 * 60 * 1000
const ATTESA_RETE_MS = 5000
const CAMPI_RISERVATI = ['tech_password', 'dashboard_password', 'resend_api_key', 'email_titolare']

function leggiCacheNegozio(slug) {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFISSO + slug)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (!c || !c.dati || !c.salvato) return null
    if (Date.now() - c.salvato > CACHE_ETA_MAX_MS) return null
    return c.dati
  } catch (e) { return null }
}

function salvaCacheNegozio(slug, dati) {
  try {
    const copia = { ...dati }
    CAMPI_RISERVATI.forEach((k) => { delete copia[k] })
    delete copia.scaduto
    delete copia.giorniRimanenti
    window.localStorage.setItem(CACHE_PREFISSO + slug, JSON.stringify({ salvato: Date.now(), dati: copia }))
  } catch (e) {}
}

function cancellaCacheNegozio(slug) {
  try { window.localStorage.removeItem(CACHE_PREFISSO + slug) } catch (e) {}
}

// Legge il negozio da Supabase; se la rete non risponde entro ATTESA_RETE_MS
// (o dà un errore diverso da "riga non trovata") usa la copia locale.
// Senza copia locale aspetta la risposta vera, come prima.
// Ritorna { data, error, daCopia, tardiva, senzaRete }; "tardiva" è la risposta vera in arrivo dopo l'attesa.
async function leggiNegozio(supabase, slug) {
  const promessa = Promise.resolve(
    supabase.from('negozi').select('*').eq('slug', slug).eq('attivo', true).single()
  )
  const attendi = async () => {
    try { return await promessa } catch (e) {
      return { data: null, error: { message: String(e && e.message ? e.message : e) } }
    }
  }
  let timer
  const scaduto = new Promise((resolve) => { timer = setTimeout(() => resolve({ scaduto: true }), ATTESA_RETE_MS) })
  let esito = await Promise.race([attendi(), scaduto])
  clearTimeout(timer)

  const definitivo = (e) => {
    if (e && e.data) {
      salvaCacheNegozio(slug, e.data)
      return { data: e.data, error: null, daCopia: false }
    }
    if (e && e.error && e.error.code === 'PGRST116') {
      // Negozio inesistente o disattivato: niente copia locale
      cancellaCacheNegozio(slug)
      return { data: null, error: e.error, daCopia: false }
    }
    return null
  }

  let r = definitivo(esito)
  if (r) return r

  const copia = leggiCacheNegozio(slug)
  if (copia) {
    const tardiva = esito && esito.scaduto
      ? attendi().then((e) => (e && e.data ? (salvaCacheNegozio(slug, e.data), e.data) : null)).catch(() => null)
      : null
    return { data: { ...copia }, error: null, daCopia: true, tardiva }
  }

  if (esito && esito.scaduto) {
    esito = await attendi()
    r = definitivo(esito)
    if (r) return r
  }
  return { data: null, error: (esito && esito.error) || { message: 'errore' }, daCopia: false, senzaRete: true }
}

function calcolaLicenza(dati) {
  if (dati.data_scadenza) {
    const scadenza = new Date(dati.data_scadenza)
    const ora = new Date()
    if (scadenza < ora) {
      dati.scaduto = true
    } else {
      dati.scaduto = false
      dati.giorniRimanenti = Math.ceil((scadenza - ora) / (1000 * 60 * 60 * 24))
    }
  }
  return dati
}
// --- COPIA LOCALE NEGOZIO (fine) ---

const NegozioContext = createContext(null)

export function NegozioProvider({ children }) {
  const [negozio, setNegozio] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)
  const [datiLocali, setDatiLocali] = useState(false)

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
        } else if (hostname.endsWith('.fidelity.digitalcase.it')) {
          // Sottodominio fidelity cliente — gestisce da sé la risoluzione del negozio,
          // niente da fare qui: nessuna query, nessun blocco app
          setNegozio(null)
          setLoading(false)
          return
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

      const r = await leggiNegozio(supabase, slug)

      if (!r.data) {
        setErrore(r.senzaRete
          ? `Connessione assente o server non raggiungibile: impossibile caricare il negozio "${slug}". Controlla internet e riprova.`
          : `Negozio "${slug}" non trovato`)
        setLoading(false)
        return
      }

      // Controlla scadenza licenza
      setNegozio(calcolaLicenza(r.data))
      setDatiLocali(r.daCopia)
      if (r.daCopia && r.tardiva) {
        r.tardiva.then((fresco) => {
          if (fresco) {
            setNegozio(calcolaLicenza({ ...fresco }))
            setDatiLocali(false)
          }
        })
      }
    } catch(e) {
      setErrore(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <NegozioContext.Provider value={{ negozio, loading, errore, datiLocali }}>
      {children}
    </NegozioContext.Provider>
  )
}

export function useNegozio() {
  return useContext(NegozioContext)
}
