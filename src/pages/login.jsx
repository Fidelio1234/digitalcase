import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import styles from '@/styles/Login.module.css'

const MAX_ATTEMPTS = 3
const LOCK_SECONDS = 30
const TECH_PIN = '080576'

function getUtenti() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('sd_utenti')
    if (!raw) return [
      { id: 'owner', nome: 'Titolare', pin: '1234', ruolo: 'owner', abilitato: true },
      { id: 'staff1', nome: 'Cassiere 1', pin: '0000', ruolo: 'staff', abilitato: true },
      { id: 'staff2', nome: 'Cassiere 2', pin: '1111', ruolo: 'staff', abilitato: true },
    ]
    return JSON.parse(raw).filter(u => u.abilitato)
  } catch { return [] }
}

export default function LoginPage() {
  const { login, user } = useAuth()
  const router = useRouter()
  const [utenti, setUtenti] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [dotState, setDotState] = useState('idle')
  const [success, setSuccess] = useState(false)
  const [techMode, setTechMode] = useState(false)
  const [techPin, setTechPin] = useState('')
  const [techError, setTechError] = useState('')
  const [techSuccess, setTechSuccess] = useState(false)
  const longPressTimer = useRef(null)
  const [logoPressed, setLogoPressed] = useState(false)

  useEffect(() => {
    if (user) router.replace('/cassa')
  }, [user, router])

  useEffect(() => {
    const u = getUtenti()
    setUtenti(u)
    if (u.length > 0) setSelectedUserId(u[0].id)
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

  const submitPin = useCallback((currentPin) => {
    if (locked) return
    const result = login(selectedUserId, currentPin)
    if (result.ok) {
      setSuccess(true)
      setTimeout(() => router.replace('/cassa'), 1200)
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
  }, [locked, attempts, selectedUserId, login, router])

  const pressKey = useCallback((k) => {
    if (locked || success) return
    setErrorMsg('')
    if (k === 'del') { setPin(prev => prev.slice(0,-1)); return }
    setPin(prev => {
      if (prev.length >= 4) return prev
      const next = prev + k
      if (next.length === 4) setTimeout(() => submitPin(next), 0)
      return next
    })
  }, [locked, success, submitPin])

  useEffect(() => {
    const handler = (e) => {
      if (techMode) return
      if (e.key >= '0' && e.key <= '9') pressKey(e.key)
      else if (e.key === 'Backspace') pressKey('del')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pressKey, techMode])

  const selectUser = (id) => {
    setSelectedUserId(id)
    setPin(''); setAttempts(0); setErrorMsg(''); setDotState('idle')
  }

  // ── Long press logo ────────────────────────────────────────────────────
  function handleLogoStart() {
    setLogoPressed(true)
    longPressTimer.current = setTimeout(() => {
      setTechMode(true)
      setTechPin('')
      setTechError('')
      setLogoPressed(false)
    }, 3000)
  }

  function handleLogoEnd() {
    clearTimeout(longPressTimer.current)
    setLogoPressed(false)
  }

  // ── Tech PIN submit ────────────────────────────────────────────────────
  function submitTechPin(p) {
    if (p === TECH_PIN) {
      setTechSuccess(true)
      setTimeout(() => router.push('/tech'), 1000)
    } else {
      setTechError('PIN tecnico errato')
      setTechPin('')
      setTimeout(() => setTechError(''), 2000)
    }
  }

  function pressTechKey(k) {
    if (k === 'del') { setTechPin(prev => prev.slice(0,-1)); return }
    setTechPin(prev => {
      if (prev.length >= 6) return prev
      const next = prev + k
      if (next.length === 6) setTimeout(() => submitTechPin(next), 0)
      return next
    })
  }

  const selectedUser = utenti.find(u => u.id === selectedUserId)

  // ── TECH MODE ──────────────────────────────────────────────────────────
  if (techMode) {
    return (
      <div className={styles.screen}>
        <div className={styles.bgGrid} />
        <div className={styles.bgGlow} />

        <div className={styles.logoWrap}>
          <div className={styles.logoMark} style={{borderColor:'rgba(255,184,48,0.4)', background:'rgba(255,184,48,0.1)', boxShadow:'0 0 32px rgba(255,184,48,0.2)'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffb830" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div className={styles.logoName} style={{color:'#ffb830'}}>Accesso <span style={{color:'#ffb830'}}>Tecnico</span></div>
            <div className={styles.logoSub}>Area riservata — inserisci PIN tecnico</div>
          </div>
        </div>

        <div className={styles.pinPanel}>
          <div className={styles.pinDisplay}>
            <div className={styles.pinHint}>PIN TECNICO (6 cifre)</div>
            <div className={styles.pinDots}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className={[
                  styles.pinDot,
                  i < techPin.length ? styles.filled : '',
                  techError ? styles.error : ''
                ].join(' ')} style={i < techPin.length ? {background:'#ffb830', borderColor:'#ffb830', boxShadow:'0 0 10px rgba(255,184,48,0.3)'} : {}} />
              ))}
            </div>
            <div className={styles.pinMsg}>{techError}</div>
          </div>

          <div className={styles.numpad}>
            {['1','2','3','4','5','6','7','8','9'].map(n => (
              <button key={n} className={styles.key} onClick={() => pressTechKey(n)}>
                <span className={styles.keyNum}>{n}</span>
              </button>
            ))}
            <div className={styles.keyEmpty} />
            <button className={styles.key} onClick={() => pressTechKey('0')}>
              <span className={styles.keyNum}>0</span>
            </button>
            <button className={`${styles.key} ${styles.keyDel}`} onClick={() => pressTechKey('del')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
              </svg>
            </button>
          </div>

          <button
            onClick={() => setTechMode(false)}
            style={{background:'transparent', border:'1px solid #252830', borderRadius:10, padding:'10px', color:'#5a5d6e', fontFamily:"'DM Mono',monospace", fontSize:'0.8rem', cursor:'pointer'}}
          >
            ← Torna al login
          </button>
        </div>

        <div className={styles.bottomBar}>Modalità tecnico — accesso riservato</div>
      </div>
    )
  }

  // ── NORMAL LOGIN ───────────────────────────────────────────────────────
  return (
    <div className={styles.screen}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />
      {success && <div className={styles.flashOverlay} />}

      <div className={styles.logoWrap}>
        <div
          className={styles.logoMark}
          onMouseDown={handleLogoStart}
          onMouseUp={handleLogoEnd}
          onMouseLeave={handleLogoEnd}
          onTouchStart={handleLogoStart}
          onTouchEnd={handleLogoEnd}
          style={{
            cursor:'pointer',
            transition:'all 0.3s',
            transform: logoPressed ? 'scale(0.92)' : 'scale(1)',
            boxShadow: logoPressed ? '0 0 32px rgba(0,229,160,0.5)' : '0 0 32px rgba(0,229,160,0.25)',
          }}
          title="Tieni premuto per accesso tecnico"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="M9 12h6M9 16h4"/>
          </svg>
        </div>
        <div>
          <div className={styles.logoName}>Scontrino<span>Digitale</span></div>
          <div className={styles.logoSub}>Punto cassa</div>
        </div>
      </div>

      {logoPressed && (
        <div style={{
          position:'fixed', top:20, left:'50%', transform:'translateX(-50%)',
          background:'rgba(255,184,48,0.15)', border:'1px solid #ffb830',
          borderRadius:10, padding:'8px 20px',
          color:'#ffb830', fontSize:'0.78rem', fontFamily:"'DM Mono',monospace",
          zIndex:100, animation:'fadeIn 0.2s ease'
        }}>
          ⏳ Tieni premuto ancora...
        </div>
      )}

      <div className={styles.userSelector}>
        {utenti.map(u => (
          <button
            key={u.id}
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

      <div className={`${styles.pinPanel} ${success ? styles.pinSuccess : ''}`}>
        {!success ? (
          <>
            <div className={styles.pinDisplay}>
              <div className={styles.pinHint}>Inserisci PIN</div>
              <div className={styles.pinDots}>
                {[0,1,2,3].map(i => (
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
            <div className={styles.successName}>{selectedUser?.nome}</div>
            <div className={styles.successRole}>
              {selectedUser?.ruolo === 'owner' ? '● Accesso Completo' : '● Accesso Cassa'}
            </div>
            <div className={styles.loadBar}>
              <div className={`${styles.loadBarFill} ${styles.animating}`} />
            </div>
            <div className={styles.loadingText}>Caricamento cassa…</div>
          </div>
        )}
      </div>

      <div className={styles.bottomBar}>DigitalCase v0.1 · © 2026</div>
    </div>
  )
}
