import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import styles from '@/styles/Login.module.css'


const MAX_ATTEMPTS = 3
const LOCK_SECONDS = 30
const TECH_PIN = '080576!.'
const MASTER_PWD = 'DMI2026ivan'

function getSlug() {
  if (typeof window === 'undefined') return 'dmi'
  const hn = window.location.hostname
  if (hn === 'localhost' || hn === '127.0.0.1') return process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
  return hn.replace('.digitalcase.it', '')
}

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const router = useRouter()
  const [utenti, setUtenti] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [dotState, setDotState] = useState('idle')
  const [success, setSuccess] = useState(false)
  const [loggedUser, setLoggedUser] = useState(null)
  const [techMode, setTechMode] = useState(false)
  const [techPin, setTechPin] = useState('')
  const [techError, setTechError] = useState('')
  const longPressTimer = useRef(null)
  const [logoPressed, setLogoPressed] = useState(false)
  const [shutdownPending, setShutdownPending] = useState(false)

  /*useEffect(() => {
    if (user) {
      setTimeout(() => {
        const redirect = sessionStorage.getItem('login_redirect') || '/cassa'
        sessionStorage.removeItem('login_redirect')
        router.replace(redirect)
      }, 100)
    }
  }, [user, router])*/

  // Carica utenti via API con slug corretto
  useEffect(() => {
    const slug = getSlug()
    fetch(`/api/utenti?slug=${slug}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setUtenti(data)
          setSelectedUserId(data[0].id)
        }
      })
      .catch(e => console.error('Errore utenti:', e))
  }, [])

  useEffect(() => {
    if (!locked) return
    let remaining = LOCK_SECONDS
    const interval = setInterval(() => {
      remaining--
      if (remaining <= 0) {
        clearInterval(interval)
        setLocked(false); setAttempts(0); setPin('')
        setErrorMsg(''); setDotState('idle')
      } else {
        setErrorMsg(`Troppi tentativi — riprova tra ${remaining}s`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [locked])

  const submitPin = useCallback(async (currentPin) => {
    if (locked) return
    const result = await login(selectedUserId, currentPin)
    if (result.ok) {
      const u = utenti.find(u => u.id === selectedUserId)
      setLoggedUser(u)
      setSuccess(true)
      sessionStorage.setItem('appena_loggato', '1')
      const redirect = sessionStorage.getItem('login_redirect') || '/cassa'
sessionStorage.removeItem('login_redirect')
router.replace(redirect)
    } else {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin('')
      setDotState('error')
      setTimeout(() => setDotState('idle'), 600)
      if (newAttempts >= MAX_ATTEMPTS) {
        setLocked(true)
        setErrorMsg(`Troppi tentativi — riprova tra ${LOCK_SECONDS}s`)
      } else {
        const rimasti = MAX_ATTEMPTS - newAttempts
        setErrorMsg(`PIN errato — ${rimasti} ${rimasti === 1 ? 'tentativo rimasto' : 'tentativi rimasti'}`)
      }
    }
  }, [locked, attempts, selectedUserId, login, router, utenti])

  const pressKey = useCallback((k) => {
    if (locked || success) return
    setErrorMsg('')
    if (k === 'del') { setPin(prev => prev.slice(0,-1)); return }
    setPin(prev => {
      if (prev.length >= 8) return prev
      const next = prev + k
      if (next.length === 8) setTimeout(() => submitPin(next), 0)
      return next
    })
  }, [locked, success, submitPin])

  useEffect(() => {
    const handler = (e) => {
      if (techMode || success) return
      if (e.key >= '0' && e.key <= '9') pressKey(e.key)
      else if (e.key === 'Backspace') pressKey('del')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pressKey, techMode, success])

  const selectUser = (id) => {
    setSelectedUserId(id)
    setPin(''); setAttempts(0); setErrorMsg(''); setDotState('idle')
  }

  function handleLogoStart() {
    setLogoPressed(true)
    longPressTimer.current = setTimeout(() => {
      setTechMode(true); setTechPin(''); setTechError(''); setLogoPressed(false)
    }, 3000)
  }
  function handleLogoEnd() {
    clearTimeout(longPressTimer.current); setLogoPressed(false)
  }

  function checkTechPwd(val) {
    if (val === TECH_PIN || val === MASTER_PWD) {
      setTechMode(false)
      router.push('/tech')
      return true
    }
    return false
  }

  if (techMode) {
    return (
      
      <div className={styles.screen}>
        <div className={styles.bgGrid} />
        <div className={styles.bgGlow} />
        <div className={styles.logoWrap}>
          <div className={styles.logoMark} style={{borderColor:'rgba(255,184,48,0.4)',background:'rgba(255,184,48,0.1)',boxShadow:'0 0 32px rgba(255,184,48,0.2)'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffb830" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div className={styles.logoName} style={{color:'#ffb830'}}>Accesso <span style={{color:'#ffb830'}}>Tecnico</span></div>
            <div className={styles.logoSub}>Area riservata</div>
          </div>
        </div>
        <div className={styles.pinPanel}>
          <div style={{display:'flex', flexDirection:'column', gap:16, width:'100%', maxWidth:320}}>
            <div style={{fontSize:'0.75rem', color:'#5a5d6e', letterSpacing:2, textAlign:'center', fontFamily:"'DM Mono',monospace"}}>
              PASSWORD TECNICO
            </div>
            <input
              type="password"
              value={techPin}
              onChange={e => {
                const val = e.target.value
                setTechPin(val)
                if (!checkTechPwd(val)) {
                  const maxLen = Math.max(TECH_PIN.length, MASTER_PWD.length)
                  if (val.length > maxLen) {
                    setTechError('Password errata')
                    setTechPin('')
                    setTimeout(() => setTechError(''), 2000)
                  }
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') checkTechPwd(techPin)
              }}
              autoFocus
              placeholder="Inserisci password..."
              style={{
                background:'#111318', border:`1px solid ${techError ? '#ff4d6a' : '#252830'}`,
                borderRadius:10, padding:'14px 16px', color:'#ffb830',
                fontSize:'1rem', fontFamily:"'DM Mono',monospace",
                outline:'none', textAlign:'center', letterSpacing:4,
                width:'100%', boxSizing:'border-box'
              }}
            />
            {techError && <div style={{color:'#ff4d6a', fontSize:'0.8rem', textAlign:'center'}}>{techError}</div>}
            <button onClick={() => { setTechMode(false); setTechPin(''); setTechError('') }}
              style={{background:'transparent', border:'1px solid #252830', borderRadius:10, padding:'10px',
                color:'#eef0f6', fontFamily:"'DM Mono',monospace", fontSize:'0.8rem', cursor:'pointer'}}>
              ← Torna al login
            </button>
          </div>
        </div>
        <div className={styles.bottomBar}>Modalità tecnico — accesso riservato</div>
      </div>
    )
  }

  return (
    
    <div className={styles.screen}>
      
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />
      {success && <div className={styles.flashOverlay} />}

      <div className={styles.logoWrap}>
        <div
          className={styles.logoMark}
          onMouseDown={handleLogoStart} onMouseUp={handleLogoEnd}
          onMouseLeave={handleLogoEnd} onTouchStart={handleLogoStart} onTouchEnd={handleLogoEnd}
          style={{cursor:'pointer', transition:'all 0.3s',
            transform: logoPressed ? 'scale(0.92)' : 'scale(1)',
            boxShadow: logoPressed ? '0 0 32px rgba(0,229,160,0.5)' : '0 0 32px rgba(0,229,160,0.25)'
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="M9 12h6M9 16h4"/>
          </svg>
        </div>
        <div>
          <div className={styles.logoName}>Scontrino<span>Digitale</span></div>
          <div className={styles.logoSub}>
            {loading ? 'Caricamento...' : 'Punto cassa'}
          </div>
        </div>
      </div>

      {logoPressed && (
        <div style={{
          position:'fixed', top:20, left:'50%', transform:'translateX(-50%)',
          background:'rgba(255,184,48,0.15)', border:'1px solid #ffb830',
          borderRadius:10, padding:'8px 20px',
          color:'#ffb830', fontSize:'0.78rem', fontFamily:"'DM Mono',monospace", zIndex:100
        }}>
          ⏳ Tieni premuto ancora…
        </div>
      )}

      <div className={styles.userSelector}>
        {utenti.length === 0 && (
          <div style={{color:'#5a5d6e', fontSize:'0.8rem', fontFamily:'monospace', padding:'10px'}}>
            ⏳ Connessione...
          </div>
        )}
        {utenti.map(u => (
          <button key={u.id}
            className={`${styles.userBtn} ${selectedUserId === u.id ? styles.active : ''}`}
            onClick={() => selectUser(u.id)}
          >
            <div className={`${styles.userAvatar} ${styles[u.ruolo]}`}>
              {u.nome.substring(0,2).toUpperCase()}
            </div>
            <div className={styles.userName}>{u.nome}</div>
            <div className={`${styles.userRole} ${styles[u.ruolo]}`}>
              {u.ruolo === 'owner' ? 'Admin' : 'Cassa'}
            </div>
          </button>
        ))}
      </div>

      <div className={styles.pinPanel}>
        {!success ? (
          <>
            <div className={styles.pinDisplay}>
              <div className={styles.pinHint}>'Inserisci PIN'</div>
              <div className={styles.pinDots}>
              {[0,1,2,3,4,5,6,7].map(i => (
                  <div key={i} className={[
                    styles.pinDot,
                    i < pin.length ? styles.filled : '',
                    dotState === 'error' ? styles.error : ''
                  ].join(' ')} />
                ))}
              </div>
              <div className={styles.pinMsg}>{errorMsg}</div>
            </div>
            <div className={styles.numpad}>
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <button key={n} className={styles.key} onClick={() => pressKey(n)} disabled={locked}>
                  <span className={styles.keyNum}>{n}</span>
                </button>
              ))}
              <div className={styles.keyEmpty} />
              <button className={styles.key} onClick={() => pressKey('0')} disabled={locked}>
                <span className={styles.keyNum}>0</span>
              </button>
              <button className={`${styles.key} ${styles.keyDel}`} onClick={() => pressKey('del')} disabled={locked}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                  <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className={styles.successState}>
            <div className={styles.successIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className={styles.successName}>{loggedUser?.nome}</div>
            <div className={styles.successRole}>
              {loggedUser?.ruolo === 'owner' ? '● Accesso Completo' : '● Accesso Cassa'}
            </div>
            <div className={styles.loadBar}>
              <div className={`${styles.loadBarFill} ${styles.animating}`} />
            </div>
            <div className={styles.loadingText}>Caricamento cassa…</div>
          </div>
        )}
      </div>

      <div className={styles.bottomBar}>DigitalCase v0.1 · © 2026</div>
      <button
onClick={async () => {
  if (shutdownPending) return
  setShutdownPending(true)
  try {
    const res = await fetch('http://localhost:3002/shutdown', {
      method: 'POST',
      headers: { 'x-shutdown-token': process.env.NEXT_PUBLIC_SHUTDOWN_TOKEN || '' }
    })
    const data = await res.json()
    if (!data.ok) {
      alert(`Spegnimento non riuscito: ${data.error || 'errore sconosciuto'}`)
      setShutdownPending(false)
    }
  } catch(e) {
    alert('Impossibile contattare il service locale')
    setShutdownPending(false)
  }
}}
  title="Spegni il PC"
  style={{
    position: 'fixed', top: 12, right: 12,
    background: shutdownPending ? 'rgba(255,75,75,0.2)' : 'rgba(255,75,75,0.08)',
    border: `1px solid ${shutdownPending ? 'rgba(255,75,75,0.5)' : 'rgba(255,75,75,0.2)'}`,
    borderRadius: 8, color: '#ff4b4b',
    cursor: shutdownPending ? 'not-allowed' : 'pointer',
    padding: '6px 14px', fontSize: '0.85rem', zIndex: 9999,
    fontFamily: "'DM Mono', monospace", letterSpacing: 1,
    transition: 'all 0.2s',
  }}
>
  {shutdownPending ? '⏻ Spegnimento...' : '⏻ Esci'}
</button>
    </div>
  )
}