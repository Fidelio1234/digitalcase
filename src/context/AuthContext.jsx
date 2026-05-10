import { createContext, useContext, useState, useEffect } from 'react'
import { NEGOZIO_ID as NEGOZIO_ID_DEFAULT } from '@/lib/config'

const AuthContext = createContext(null)

export function AuthProvider({ children, negozioId, negozioSlug }) {
  const NEGOZIO_ID = negozioId || NEGOZIO_ID_DEFAULT
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [utenti, setUtenti] = useState([])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('sd_user')
      if (saved) setUser(JSON.parse(saved))
    } catch {}
  }, [])

  // Ricarica utenti ogni volta che cambia lo slug del negozio
  useEffect(() => {
    caricaUtenti()
  }, [negozioSlug])

  async function caricaUtenti() {
    setLoading(true)
    try {
      // Passa lo slug come query param così la API sa quale negozio caricare
      const slug = negozioSlug || (typeof window !== 'undefined'
        ? window.location.hostname.replace('.digitalcase.it', '')
        : 'dmi')
      const res = await fetch(`/api/utenti?slug=${slug}`)
      const data = await res.json()
      if (Array.isArray(data)) setUtenti(data)
    } catch(e) {
      console.error('Errore caricamento utenti:', e)
    } finally {
      setLoading(false)
    }
  }

  async function login(userId, pinInput) {
    const u = utenti.find(u => u.id === userId)
    if (!u) return { ok: false, reason: 'Utente non trovato' }
    if (!u.abilitato) return { ok: false, reason: 'Utente disabilitato' }
    if (pinInput !== u.pin) return { ok: false, reason: 'PIN errato' }
    const session = {
      id: u.id,
      name: u.nome,
      role: u.ruolo,
      initials: u.nome.substring(0, 2).toUpperCase(),
      negozioId: NEGOZIO_ID,
    }
    setUser(session)
    sessionStorage.setItem('sd_user', JSON.stringify(session))
    return { ok: true }
  }

  function logout() {
    setUser(null)
    sessionStorage.removeItem('sd_user')
  }

  function can(permission) {
    if (!user) return false
    if (user.role === 'owner') return true
    if (permission === 'cassa') return true
    return false
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, utenti, negozioId: NEGOZIO_ID, loadUtenti: caricaUtenti }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere dentro <AuthProvider>')
  return ctx
}