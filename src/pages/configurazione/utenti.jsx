import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/router'
import styles from '@/styles/Utenti.module.css'

const RUOLI = [
  { value: 'owner', label: 'Titolare', desc: 'Accesso completo + configurazione', colore: '#00e5a0' },

]

const PIN_VUOTO = () => Array(8).fill('')

const emptyUtente = () => ({
  id: '', nome: '', ruolo: 'staff', abilitato: true
})

function slugCorrente() {
  const hn = window.location.hostname
  if (hn === 'localhost' || hn === '127.0.0.1') return process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
  return hn.replace('.digitalcase.it', '')
}

// Tutte le operazioni sugli utenti passano dal server (il PIN non torna mai al browser)
async function apiUtenti(body) {
  try {
    const res = await fetch('/api/utenti-gestione', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slugCorrente(), ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error || 'Errore', status: res.status }
    return data
  } catch {
    return { error: 'Errore di rete' }
  }
}

export default function UtentiPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loadUtenti } = useAuth()
  const router = useRouter()
  const [utenti, setUtenti] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [pinInput, setPinInput] = useState(PIN_VUOTO())
  const [pinConfirm, setPinConfirm] = useState(PIN_VUOTO())
  const [errore, setErrore] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmElimina, setConfirmElimina] = useState(null)
  const [testando, setTestando] = useState(false)
  const [statoConnessione, setStatoConnessione] = useState(null)

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    apiUtenti({ azione: 'lista' }).then(r => {
      if (r.status === 401) { router.replace('/login'); return }
      if (r.utenti) setUtenti(r.utenti)
    })
  }, [user, router])

  async function testConnessione() {
    setTestando(true)
    setStatoConnessione(null)
    try {
      const { data: negozio } = await supabase.from('negozi').select('rt_config').eq('id', NEGOZIO_ID).single()
      const cfg = negozio?.rt_config?.config
      if (!cfg?.ip) { setStatoConnessione('errore'); setTestando(false); return }
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      let res
      if (isLocalhost) {
        res = await fetch('/api/ditron', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: cfg.ip, porta: cfg.porta, azione: 'ping', dati: {}, marca: cfg.marca }) })
      } else {
        res = await fetch('http://localhost:3002', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'rt', marca: cfg.marca, ip: cfg.ip, porta: cfg.porta, azione: 'ping', dati: {} }) })
      }
      const data = await res.json()
      setStatoConnessione(data.ok ? 'ok' : 'errore')
    } catch (e) { setStatoConnessione('errore') }
    setTestando(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openAdd() {
    setForm(emptyUtente())
    setPinInput(PIN_VUOTO())
    setPinConfirm(PIN_VUOTO())
    setErrore('')
    setModal('add')
    setTimeout(() => document.getElementById('pin-0')?.focus(), 100)
  }

  function openEdit(u) {
    // Il PIN esistente non è recuperabile: lasciare vuoto = non cambiarlo
    setForm({ ...u })
    setPinInput(PIN_VUOTO())
    setPinConfirm(PIN_VUOTO())
    setErrore('')
    setModal('edit')
  }

  function closeModal() { setModal(null); setForm({}); setErrore('') }

  async function salva() {
    if (!form.nome?.trim()) { setErrore('Inserisci il nome'); return }
    const pin = pinInput.join('')
    const confirm = pinConfirm.join('')
    const pinDaImpostare = modal === 'add' || pin.length > 0 || confirm.length > 0
    if (pinDaImpostare) {
      if (pin.length !== 8) { setErrore('Il PIN deve essere di 8 cifre'); return }
      if (pin !== confirm) { setErrore('I PIN non coincidono'); return }
    }

    const r = await apiUtenti({
      azione: 'salva',
      id: modal === 'edit' ? form.id : undefined,
      nome: form.nome,
      ruolo: form.ruolo,
      abilitato: form.abilitato ?? true,
      pin: pinDaImpostare ? pin : undefined,
    })
    if (r.status === 401) { router.replace('/login'); return }
    if (r.error) { setErrore(r.error); return }

    if (r.utenti) setUtenti(r.utenti)
    showToast(modal === 'add' ? 'Utente aggiunto ✓' : 'Utente salvato ✓')
    closeModal()
    loadUtenti() // aggiorna l'elenco della schermata di login
  }

  function elimina(id) {
    const titolari = utenti.filter(u => u.ruolo === 'owner')
    const target = utenti.find(u => u.id === id)
    if (target?.ruolo === 'owner' && titolari.length <= 1) {
      showToast('⚠ Deve esserci almeno un titolare')
      return
    }
    setConfirmElimina(target)
  }

  async function confermaElimina() {
    const r = await apiUtenti({ azione: 'elimina', id: confirmElimina.id })
    if (r.status === 401) { router.replace('/login'); return }
    if (r.error) { showToast('⚠ ' + r.error); setConfirmElimina(null); return }
    if (r.utenti) setUtenti(r.utenti)
    showToast('Utente eliminato')
    setConfirmElimina(null)
    loadUtenti()
  }

  async function toggleAbilitato(id) {
    const target = utenti.find(u => u.id === id)
    if (target?.ruolo === 'owner') { showToast('⚠ Non puoi disabilitare il titolare'); return }
    const r = await apiUtenti({ azione: 'abilita', id })
    if (r.status === 401) { router.replace('/login'); return }
    if (r.error) { showToast('⚠ ' + r.error); return }
    if (r.utenti) setUtenti(r.utenti)
    loadUtenti()
  }

  const PinBoxes = ({ which, values, setValues, show }) => {
    const [flash, setFlash] = React.useState({})

    function handleChange(i, val) {
      if (!/^\d?$/.test(val)) return
      const arr = [...values]
      arr[i] = val
      setValues(arr)
      if (val) {
        setFlash(f => ({ ...f, [i]: true }))
        setTimeout(() => setFlash(f => ({ ...f, [i]: false })), 700)
        if (i < 7) setTimeout(() => {
          document.getElementById(`${which}-${i+1}`)?.focus()
        }, 10)
      }
    }

    function handleKey(e, i) {
      if (e.key === 'Backspace') {
        const arr = [...values]
        if (arr[i]) {
          arr[i] = ''
          setValues(arr)
          setFlash(f => ({ ...f, [i]: false }))
        } else if (i > 0) {
          document.getElementById(`${which}-${i-1}`)?.focus()
        }
      }
    }

    return (
      <div className={styles.pinBoxes}>
       {[0,1,2,3,4,5,6,7].map(i => (
          <div key={i} className={styles.pinBoxWrap}>
            <input
              id={`${which}-${i}`}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={values[i] || ''}
              onChange={e => handleChange(i, e.target.value.replace(/\D/g,'').slice(-1))}
              onKeyDown={e => handleKey(e, i)}
              className={styles.pinInput}
              autoComplete="off"
            />
            <div className={`${styles.pinDisplay2} ${values[i] ? styles.pinFilled : ''}`}>
              {values[i]
                ? (show || flash[i])
                  ? <span className={styles.pinDigit}>{values[i]}</span>
                  : <span className={styles.pinBullet}>●</span>
                : <span className={styles.pinEmpty}>_</span>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/configurazione')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          ← Configurazione
        </button>
        <div className={styles.headerTitle}>
          <span>Utenti e PIN</span>
          <span className={styles.headerSub}>{utenti.length} utenti configurati</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={testConnessione}
            disabled={testando}
            style={{
              padding: '8px 14px', borderRadius: 10, border: '1px solid #252830',
              background: '#1a1c24', color: testando ? '#5a5d6e' : '#eef0f6',
              cursor: testando ? 'not-allowed' : 'pointer', fontSize: '0.82rem',
              fontFamily: "'DM Mono',monospace", display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            {testando ? '⏳' : ''}{testando ? 'Test...' : 'Test RT'}
            {statoConnessione === 'ok' && <span style={{ color: '#00e5a0', fontSize: '2.1rem' }}>✓</span>}
            {statoConnessione === 'errore' && <span style={{ color: '#ff4d6a', fontSize: '2.1rem' }}>✗</span>}
          </button>
          <button className={styles.addBtn} onClick={openAdd}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuovo utente
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {utenti.map(u => {
          const ruolo = RUOLI.find(r => r.value === u.ruolo)
          return (
            <div key={u.id} className={`${styles.userCard} ${!u.abilitato ? styles.disabled : ''}`}>
              <div className={styles.userLeft}>
                <div className={styles.avatar} style={{ background: ruolo?.colore + '22', borderColor: ruolo?.colore }}>
                  {u.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className={styles.userName}>{u.nome}</div>
                  <div className={styles.userMeta}>
                    <span style={{ color: ruolo?.colore }}>{ruolo?.label}</span>
                    <span className={styles.dot}>·</span>
                    <span>PIN: {'●'.repeat(8)}</span>
                  </div>
                </div>
              </div>
              <div className={styles.userActions}>
                <button
                  className={`${styles.toggleBtn} ${u.abilitato ? styles.on : styles.off}`}
                  onClick={() => toggleAbilitato(u.id)}
                >
                  {u.abilitato ? 'ON' : 'OFF'}
                </button>
                <button className={styles.iconBtn} onClick={() => openEdit(u)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => elimina(u.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* MODAL */}
      {modal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {modal === 'add' ? '+ Nuovo Utente' : 'Modifica Utente'}
              </div>
              <button className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>

            <div className={styles.modalBody}>

              <div className={styles.field}>
                <label>Nome</label>
                <input
                  type="text" placeholder="Es. Mario Rossi"
                  value={form.nome || ''}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label>Ruolo</label>
                <div className={styles.ruoloGroup}>
                  {RUOLI.map(r => (
                    <button
                      key={r.value}
                      className={`${styles.ruoloBtn} ${form.ruolo === r.value ? styles.ruoloActive : ''}`}
                      style={form.ruolo === r.value ? { borderColor: r.colore, background: r.colore + '18' } : {}}
                      onClick={() => setForm(f => ({ ...f, ruolo: r.value }))}
                    >
                      <div className={styles.ruoloLabel} style={form.ruolo === r.value ? { color: r.colore } : {}}>
                        {r.label}
                      </div>
                      <div className={styles.ruoloDesc}>{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span>{modal === 'edit' ? 'Nuovo PIN (8 cifre) — vuoto = invariato' : 'PIN (8 cifre)'}</span>
                  <div style={{display:'flex',gap:8}}>
                    <button
                      type="button"
                      onClick={() => { setPinInput(PIN_VUOTO()); setPinConfirm(PIN_VUOTO()); setShowPin(false); setTimeout(() => document.getElementById('pin-0')?.focus(), 50) }}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--danger)',fontSize:'0.95rem',display:'flex',alignItems:'center',gap:4}}
                    >
                      ✕ Pulisci
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPin(s => !s)}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--accent)',fontSize:'0.95rem',display:'flex',alignItems:'center',gap:4}}
                    >
                      {showPin ? '🙈 Nascondi' : '👁 Mostra'}
                    </button>
                  </div>
                </label>
                <PinBoxes which="pin" values={pinInput} setValues={setPinInput} show={showPin} />
              </div>

              <div className={styles.field}>
                <label>Conferma PIN</label>
                <PinBoxes which="confirm" values={pinConfirm} setValues={setPinConfirm} show={showPin} />
              </div>

              {errore && <div className={styles.errore}>{errore}</div>}

            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal}>Annulla</button>
              <button className={styles.saveBtn} onClick={salva}>
                {modal === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFERMA ELIMINA */}
      {confirmElimina && (
        <div className={styles.overlay} onClick={() => setConfirmElimina(null)}>
          <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmIcona}>🗑️</div>
            <div className={styles.confirmTitolo}>Eliminare utente?</div>
            <div className={styles.confirmSub}>
              Stai per eliminare <strong>{confirmElimina.nome}</strong>.<br/>
              Questa operazione non può essere annullata.
            </div>
            <div className={styles.confirmBtns}>
              <button className={styles.cancelBtn} onClick={() => setConfirmElimina(null)}>
                No, annulla
              </button>
              <button className={styles.confirmDangerBtn} onClick={confermaElimina}>
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}