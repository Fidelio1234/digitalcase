
import '@/styles/globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { NegozioProvider, useNegozio } from '@/context/NegozioContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'


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
        height:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Mono',monospace",
        gap:16
      }}>
        <div style={{fontSize:'3rem'}}>🚫</div>
        <div style={{fontSize:'1.2rem', color:'#ff4d6a'}}>Negozio non trovato</div>
        <div style={{fontSize:'0.8rem', color:'#5a5d6e'}}>Questo indirizzo non è associato a nessun negozio attivo.</div>
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
          background:'#ffb83022', borderBottom:'2px solid #ffb830',
          padding:'8px 16px', textAlign:'center',
          fontSize:'0.82rem', color:'#ffb830',
          fontFamily:"'DM Mono',monospace"
        }}>
          ⚠️ Licenza in scadenza tra <strong>{negozio.giorniRimanenti} giorni</strong> — contatta il tuo rivenditore
        </div>
      )}
      {children}
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