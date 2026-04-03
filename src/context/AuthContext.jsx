import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID } from '@/lib/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [utenti, setUtenti] = useState([])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('sd_user')
      if (saved) setUser(JSON.parse(saved))
    } catch {}
    caricaUtenti()
  }, [])

  async function caricaUtenti() {
    setLoading(true)
    const { data } = await supabase
      .from('utenti')
      .select('*')
      .eq('negozio_id', NEGOZIO_ID)
      .eq('abilitato', true)
    if (data) {
      const sorted = [...data].sort((a,b) => {
        if (a.ruolo === 'owner') return -1
        if (b.ruolo === 'owner') return 1
        return a.nome.localeCompare(b.nome)
      })
      setUtenti(sorted)
    }
    setLoading(false)
  }

  async function login(userId, pinInput) {
    // Cerca utente nell'array già caricato
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
