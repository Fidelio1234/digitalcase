import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children, negozioSlug }) {
  const slug = negozioSlug || 'dmi'
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [utenti, setUtenti] = useState([])

  useEffect(() => {
    let salvato = null
    try {
      salvato = sessionStorage.getItem('sd_user')
      if (salvato) setUser(JSON.parse(salvato))
    } catch {}
    caricaUtenti()
    if (salvato) verificaSessione()
  }, [slug])

  // Se il server non riconosce più la sessione (scaduta o utente disabilitato) si esce.
  // Un errore di rete NON disconnette: la cassa deve continuare a funzionare.
  async function verificaSessione() {
    try {
      const res = await fetch('/api/sessione', { credentials: 'same-origin' })
      if (res.status === 401) {
        setUser(null)
        try { sessionStorage.removeItem('sd_user') } catch {}
      }
    } catch {}
  }

  async function caricaUtenti() {
    setLoading(true)
    try {
      const res = await fetch(`/api/utenti?slug=${encodeURIComponent(slug)}`)
      const data = await res.json()
      if (Array.isArray(data)) setUtenti(data)
    } catch (e) {
      console.error('Errore caricamento utenti:', e)
    } finally {
      setLoading(false)
    }
  }

  // Il PIN viene verificato dal server: nel browser non arriva mai nessun PIN.
  async function login(userId, pinInput) {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, userId, pin: pinInput }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) return { ok: false, reason: data.reason || 'PIN errato' }
      setUser(data.user)
      sessionStorage.setItem('sd_user', JSON.stringify(data.user))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'Errore di rete' }
    }
  }

  function logout() {
    setUser(null)
    try { sessionStorage.removeItem('sd_user') } catch {}
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  }

  function can(permission) {
    if (!user) return false
    if (user.role === 'owner') return true
    if (permission === 'cassa') return true
    return false
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, utenti, loadUtenti: caricaUtenti }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere dentro <AuthProvider>')
  return ctx
}
