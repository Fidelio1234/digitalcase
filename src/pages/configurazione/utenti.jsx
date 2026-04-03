import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID } from '@/lib/config'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/router'
import { getUtenti, saveUtenti, generateId } from '@/lib/storage'
import styles from '@/styles/Utenti.module.css'

const RUOLI = [
  { value: 'owner', label: 'Titolare', desc: 'Accesso completo + configurazione', colore: '#00e5a0' },
  { value: 'staff', label: 'Cassiere', desc: 'Solo cassa', colore: '#6482ff' },
]

const emptyUtente = () => ({
  id: '', nome: '', pin: '', ruolo: 'staff', abilitato: true
})

export default function UtentiPage() {
  const { user, login } = useAuth()
  const router = useRouter()
  const [utenti, setUtenti] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [pinInput, setPinInput] = useState(['', '', '', ''])
  const [pinConfirm, setPinConfirm] = useState(['', '', '', ''])
  const [errore, setErrore] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmElimina, setConfirmElimina] = useState(null)

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    supabase
      .from('utenti')
      .select('*')
      .eq('negozio_id', NEGOZIO_ID)
      .order('created_at')
      .then(({ data }) => {
        if (data) {
          const sorted = [...data].sort((a,b) => {
            if (a.ruolo === 'owner') return -1
            if (b.ruolo === 'owner') return 1
            return a.nome.localeCompare(b.nome)
          })
          setUtenti(sorted)
        }
      })
  }, [user, router])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openAdd() {
    setForm(emptyUtente())
    setPinInput(['','','',''])
    setPinConfirm(['','','',''])
    setErrore('')
    setModal('add')
    setTimeout(() => document.getElementById('pin-0')?.focus(), 100)
  }

  function openEdit(u) {
    setForm({ ...u })
    setPinInput(u.pin.split(''))
    setPinConfirm(u.pin.split(''))
    setErrore('')
    setModal('edit')
    setTimeout(() => document.getElementById('pin-0')?.focus(), 100)
  }

  function closeModal() { setModal(null); setForm({}); setErrore('') }

  function handlePinDigit(idx, val, which) {
    if (!/^\d?$/.test(val)) return
    const arr = which === 'pin' ? [...pinInput] : [...pinConfirm]
    arr[idx] = val
    which === 'pin' ? setPinInput(arr) : setPinConfirm(arr)
    // focus next
    if (val && idx < 3) {
      const next = document.getElementById(`${which}-${idx+1}`)
      if (next) next.focus()
    }
  }

  function handlePinKey(e, idx, which) {
    if (e.key === 'Backspace' && !e.target.value && idx > 0) {
      const prev = document.getElementById(`${which}-${idx-1}`)
      if (prev) prev.focus()
    }
  }

  async function salva() {
    if (!form.nome?.trim()) { setErrore('Inserisci il nome'); return }
    const pin = pinInput.join('')
    const confirm = pinConfirm.join('')
    if (pin.length < 4) { setErrore('Il PIN deve essere di 4 cifre'); return }
    if (pin !== confirm) { setErrore('I PIN non coincidono'); return }

    const duplicato = utenti.find(u => u.pin === pin && u.id !== form.id)
    if (duplicato) { setErrore(`PIN già usato da ${duplicato.nome}`); return }

    if (modal === 'add') {
      const { error } = await supabase.from('utenti').insert({
        negozio_id: NEGOZIO_ID,
        nome: form.nome,
        pin,
        ruolo: form.ruolo,
        abilitato: form.abilitato ?? true,
      })
      if (error) { setErrore('Errore salvataggio: ' + error.message); return }
    } else {
      const { error } = await supabase.from('utenti')
        .update({ nome: form.nome, pin, ruolo: form.ruolo, abilitato: form.abilitato })
        .eq('id', form.id)
        .select()
      if (error) { setErrore('Errore salvataggio: ' + error.message); return }
    }

    // Ricarica utenti da Supabase
    const { data } = await supabase.from('utenti').select('*').eq('negozio_id', NEGOZIO_ID).order('created_at')
    if (data) {
      const sorted = [...data].sort((a,b) => a.ruolo === 'owner' ? -1 : b.ruolo === 'owner' ? 1 : a.nome.localeCompare(b.nome))
      setUtenti(sorted)
    }
    // Ricarica utenti localmente
    const { data: nuoviUtenti } = await supabase.from('utenti').select('*').eq('negozio_id', NEGOZIO_ID).order('created_at')
    if (nuoviUtenti) {
      const sorted = [...nuoviUtenti].sort((a,b) => a.ruolo === 'owner' ? -1 : b.ruolo === 'owner' ? 1 : a.nome.localeCompare(b.nome))
      setUtenti(sorted)
    }
    showToast(modal === 'add' ? 'Utente aggiunto ✓' : 'Utente salvato ✓')
    closeModal()
    // Forza reload AuthContext
    window.location.reload()
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
    await supabase.from('utenti').delete().eq('id', confirmElimina.id)
    const { data } = await supabase.from('utenti').select('*').eq('negozio_id', NEGOZIO_ID).order('created_at')
    if (data) {
      const sorted = [...data].sort((a,b) => a.ruolo === 'owner' ? -1 : b.ruolo === 'owner' ? 1 : a.nome.localeCompare(b.nome))
      setUtenti(sorted)
    }
    showToast('Utente eliminato')
    setConfirmElimina(null)
  }

  async function toggleAbilitato(id) {
    const target = utenti.find(u => u.id === id)
    if (target?.ruolo === 'owner') { showToast('⚠ Non puoi disabilitare il titolare'); return }
    await supabase.from('utenti').update({ abilitato: !target.abilitato }).eq('id', id).select()
    setUtenti(prev => prev.map(u => u.id === id ? { ...u, abilitato: !u.abilitato } : u))
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
        if (i < 3) setTimeout(() => {
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
        {[0,1,2,3].map(i => (
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
        <button className={styles.addBtn} onClick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuovo utente
        </button>
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
                    <span>PIN: {'●'.repeat(4)}</span>
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
                  <span>PIN (4 cifre)</span>
                  <div style={{display:'flex',gap:8}}>
                    <button
                      type="button"
                      onClick={() => { setPinInput(['','','','']); setPinConfirm(['','','','']); setShowPin(false); setTimeout(() => document.getElementById('pin-0')?.focus(), 50) }}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--danger)',fontSize:'0.75rem',display:'flex',alignItems:'center',gap:4}}
                    >
                      ✕ Pulisci
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPin(s => !s)}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'0.75rem',display:'flex',alignItems:'center',gap:4}}
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

              <div className={styles.field}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={form.abilitato ?? true}
                    onChange={e => setForm(f => ({ ...f, abilitato: e.target.checked }))}
                  />
                  Utente abilitato
                </label>
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
