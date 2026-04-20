import '@/styles/globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { NegozioProvider, useNegozio } from '@/context/NegozioContext'

function AuthProviderWrapper({ children }) {
  const { negozio } = useNegozio() || {}
  return <AuthProvider negozioId={negozio?.id}>{children}</AuthProvider>
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}
