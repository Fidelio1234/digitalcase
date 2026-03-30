import { createContext, useContext, useState, useEffect } from 'react'

export const USERS = {
  owner: {
    id: 'owner',
    name: 'Titolare',
    pin: '1234',
    role: 'owner',
    initials: 'TIT',
  },
  staff1: {
    id: 'staff1',
    name: 'Cassiere 1',
    pin: '0000',
    role: 'staff',
    initials: 'C1',
  },
  staff2: {
    id: 'staff2',
    name: 'Cassiere 2',
    pin: '1111',
    role: 'staff',
    initials: 'C2',
  },
}

const AuthContext = createContext(null)

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
    const u = USERS[userId]
    if (!u) return { ok: false }
    if (pinInput !== u.pin) return { ok: false }
    const session = { id: u.id, name: u.name, role: u.role, initials: u.initials }
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
