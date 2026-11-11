
import '@/styles/globals.css'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { NegozioProvider, useNegozio } from '@/context/NegozioContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

const PAGINE_SENZA_LOGIN = ['/', '/login', '/card', '/scaduto', '/tech']

function GuardiaSessione({ children }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pubblica = PAGINE_SENZA_LOGIN.includes(router.pathname)

  useEffect(() => {
    if (!pubblica && !loading && !user) {
      try { sessionStorage.setItem('login_redirect', router.asPath) } catch {}
      router.replace('/login')
    }
  }, [pubblica, loading, user, router])

  if (!pubblica && !user) return null
  return children
}

function AuthProviderWrapper({ children }) {
  const { negozio, loading, errore } = useNegozio() || {}
  const router = useRouter()

  // Pagine pubbliche — bypassano completamente il controllo negozio
  const paginePubbliche = ['/quiz', '/dashboard', '/card']
  if (paginePubbliche.includes(router.pathname)) {
    return children
  }
  
  if (loading) return null

  // Negozio non trovato
  if (errore) {
    return (
      <div style={{
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        height:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Mono',monospace",
        gap:16
      }}>
        <div style={{fontSize:'3rem'}}>🚫</div>
        <div style={{fontSize:'1.2rem', color:'var(--dc-rosso)'}}>Negozio non trovato</div>
        <div style={{fontSize:'0.8rem', color:'var(--dc-muted)'}}>Questo indirizzo non è associato a nessun negozio attivo.</div>
      </div>
    )
  }

  // Controlla licenza scaduta
  if (!loading && negozio?.scaduto && router.pathname !== '/scaduto') {
    if (typeof window !== 'undefined') {
      router.replace('/scaduto')
    }
    return null
  }

  return (
    
<AuthProvider negozioSlug={negozio?.slug || 'dmi'}>
      {negozio && !negozio.scaduto && negozio.giorniRimanenti <= 7 && (
        <div style={{
          background:'rgba(var(--dc-ambra-rgb), 0.13)', borderBottom:'2px solid var(--dc-ambra)',
          padding:'8px 16px', textAlign:'center',
          fontSize:'0.82rem', color:'var(--dc-ambra)',
          fontFamily:"'DM Mono',monospace"
        }}>
          ⚠️ Licenza in scadenza tra <strong>{negozio.giorniRimanenti} giorni</strong> — contatta il tuo rivenditore
        </div>
      )}
      <GuardiaSessione>{children}</GuardiaSessione>
    </AuthProvider>
  )
}

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('SW registrato'))
        .catch(err => console.error('SW errore:', err))
    }
  }, [])



  return (
    <NegozioProvider>
      <AuthProviderWrapper>
        <Component {...pageProps} />
      
      </AuthProviderWrapper>
    </NegozioProvider>
  )
}