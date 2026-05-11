import '@/styles/globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { NegozioProvider, useNegozio } from '@/context/NegozioContext'
import { useRouter } from 'next/router'

function AuthProviderWrapper({ children }) {
  const { negozio, loading } = useNegozio() || {}
  const router = useRouter()

  // Controlla licenza scaduta
  if (!loading && negozio?.scaduto && router.pathname !== '/scaduto') {
    if (typeof window !== 'undefined') {
      router.replace('/scaduto')
    }
    return null
  }

  return (
    <AuthProvider negozioId={negozio?.id} negozioSlug={negozio?.slug}>
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
  return (
    <NegozioProvider>
      <AuthProviderWrapper>
        <Component {...pageProps} />
      </AuthProviderWrapper>
    </NegozioProvider>
  )
}




/*import '@/styles/globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { NegozioProvider, useNegozio } from '@/context/NegozioContext'
import { useRouter } from 'next/router'

function AuthProviderWrapper({ children }) {
  const { negozio, loading } = useNegozio() || {}
  const router = useRouter()

  // Aspetta che NegozioContext abbia risolto prima di montare AuthProvider
  if (loading) return null

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
  return (
    <NegozioProvider>
      <AuthProviderWrapper>
        <Component {...pageProps} />
      </AuthProviderWrapper>
    </NegozioProvider>
  )
}
*/