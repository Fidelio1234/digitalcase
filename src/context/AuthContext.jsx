import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

function getUtentiStorage() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('sd_utenti')
    if (!raw) return [
      { id: 'owner', nome: 'Titolare', pin: '1234', ruolo: 'owner', abilitato: true },
      { id: 'staff1', nome: 'Cassiere 1', pin: '0000', ruolo: 'staff', abilitato: true },
      { id: 'staff2', nome: 'Cassiere 2', pin: '1111', ruolo: 'staff', abilitato: true },
    ]
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('sd_user')
      if (saved) setUser(JSON.parse(saved))
    } catch {}
    setLoading(false)
  }, [])

  function login(userId, pinInput) {
    const utenti = getUtentiStorage()
    const u = utenti.find(u => u.id === userId)
    if (!u) return { ok: false, reason: 'Utente non trovato' }
    if (!u.abilitato) return { ok: false, reason: 'Utente disabilitato' }
    if (pinInput !== u.pin) return { ok: false, reason: 'PIN errato' }
    const session = { id: u.id, name: u.nome, role: u.ruolo, initials: u.nome.substring(0,2).toUpperCase() }
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
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere dentro <AuthProvider>')
  return ctx
}
