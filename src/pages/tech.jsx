import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import styles from '@/styles/Tech.module.css'

function getUtenti() {
  try { return JSON.parse(localStorage.getItem('sd_utenti') || '[]') } catch { return [] }
}
function getNegozio() {
  try { return JSON.parse(localStorage.getItem('sd_negozio') || '{}') } catch { return {} }
}
function getReparti() {
  try { return JSON.parse(localStorage.getItem('sd_reparti') || '[]') } catch { return [] }
}
function getContatori() {
  try { return JSON.parse(localStorage.getItem('sd_contatori') || '{}') } catch { return {} }
}

export default function TechPage() {
  const router = useRouter()
  const [utenti, setUtenti] = useState([])
  const [negozio, setNegozio] = useState({})
  const [reparti, setReparti] = useState([])
  const [contatori, setContatori] = useState({})
  const [editingPin, setEditingPin] = useState(null)
  const [newPin, setNewPin] = useState('')
  const [toast, setToast] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [editNegozio, setEditNegozio] = useState(false)
  const [negozioForm, setNegozioForm] = useState({})

  useEffect(() => {
    setUtenti(getUtenti())
    setNegozio(getNegozio())
    setReparti(getReparti())
    setContatori(getContatori())
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function resetPin(id) {
    if (newPin.length !== 4) { showToast('⚠ PIN deve essere 4 cifre'); return }
    const updated = utenti.map(u => u.id === id ? { ...u, pin: newPin } : u)
    localStorage.setItem('sd_utenti', JSON.stringify(updated))
    setUtenti(updated)
    setEditingPin(null)
    setNewPin('')
    showToast('✓ PIN aggiornato')
  }

  function resetCompleto() {
    localStorage.removeItem('sd_utenti')
    localStorage.removeItem('sd_reparti')
    localStorage.removeItem('sd_negozio')
    localStorage.removeItem('sd_contatori')
    showToast('✓ Reset completo eseguito')
    setShowReset(false)
    setTimeout(() => router.replace('/login'), 1500)
  }

  function saveNegozio() {
    localStorage.setItem('sd_negozio', JSON.stringify(negozioForm))
    setNegozio(negozioForm)
    setEditNegozio(false)
    showToast('✓ Intestazione salvata')
  }

  function toggleUtente(id) {
    const updated = utenti.map(u => u.id === id ? { ...u, abilitato: !u.abilitato } : u)
    localStorage.setItem('sd_utenti', JSON.stringify(updated))
    setUtenti(updated)
    showToast('✓ Stato aggiornato')
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span>🔧 Pannello Tecnico</span>
          <span className={styles.headerSub}>Accesso riservato — invisibile ai clienti</span>
        </div>
        <button className={styles.exitBtn} onClick={() => router.replace('/login')}>
          ← Esci
        </button>
      </header>

      <div className={styles.content}>

        {/* NEGOZIO */}
        <div className={styles.section}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div className={styles.sectionTitle}>🏪 Dati Negozio</div>
            {!editNegozio ? (
              <button className={styles.techBtn} onClick={() => { setNegozioForm({...negozio}); setEditNegozio(true) }}>
                ✏️ Modifica
              </button>
            ) : (
              <div style={{display:'flex',gap:8}}>
                <button className={styles.savePin} onClick={saveNegozio}>✓ Salva</button>
                <button className={styles.cancelPin} onClick={() => setEditNegozio(false)}>✕</button>
              </div>
            )}
          </div>

          {!editNegozio ? (
            <div className={styles.infoGrid}>
              <div className={styles.infoRow}><span>Ragione Sociale</span><strong>{negozio.ragioneSociale || '—'}</strong></div>
              <div className={styles.infoRow}><span>P.IVA</span><strong>{negozio.partitaIva || '—'}</strong></div>
              <div className={styles.infoRow}><span>Indirizzo</span><strong>{negozio.indirizzo || '—'}</strong></div>
              <div className={styles.infoRow}><span>Telefono</span><strong>{negozio.telefono || '—'}</strong></div>
              <div className={styles.infoRow}><span>Sito Web</span><strong>{negozio.sitoWeb || '—'}</strong></div>
              <div className={styles.infoRow}><span>Numero RT</span><strong>{negozio.numeroRt || '—'}</strong></div>
            </div>
          ) : (
            <div className={styles.negozioForm}>
              {[
                {key:'ragioneSociale', label:'Ragione Sociale'},
                {key:'indirizzo', label:'Indirizzo'},
                {key:'partitaIva', label:'Partita IVA'},
                {key:'telefono', label:'Telefono'},
                {key:'sitoWeb', label:'Sito Web'},
                {key:'numeroRt', label:'Numero RT'},
              ].map(f => (
                <div key={f.key} className={styles.negozioField}>
                  <label>{f.label}</label>
                  <input
                    type="text"
                    value={negozioForm[f.key] || ''}
                    onChange={e => setNegozioForm(n => ({...n, [f.key]: e.target.value}))}
                    className={styles.negozioInput}
                    placeholder={f.label}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CONTATORI */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>📊 Contatori Oggi</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}><span>Scontrini</span><strong style={{color:'#00e5a0'}}>{contatori.scontrini || 0}</strong></div>
            <div className={styles.infoRow}><span>Chiusure</span><strong style={{color:'#00e5a0'}}>{contatori.chiusure || 0}</strong></div>
            <div className={styles.infoRow}><span>Data</span><strong>{contatori.data || '—'}</strong></div>
          </div>
        </div>

        {/* UTENTI E PIN */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>👥 Gestione Utenti e PIN</div>
          <div className={styles.userList}>
            {utenti.map(u => (
              <div key={u.id} className={styles.userRow}>
                <div className={styles.userInfo}>
                  <div className={styles.userName}>{u.nome}</div>
                  <div className={styles.userMeta}>
                    {u.ruolo === 'owner' ? '👑 Titolare' : '👤 Cassiere'} ·
                    PIN: <strong>{u.pin}</strong> ·
                    <span style={{color: u.abilitato ? '#00e5a0' : '#ff4d6a'}}>
                      {u.abilitato ? 'Attivo' : 'Disabilitato'}
                    </span>
                  </div>
                </div>
                <div className={styles.userActions}>
                  {editingPin === u.id ? (
                    <div className={styles.pinEdit}>
                      <input
                        type="tel" maxLength={4} placeholder="Nuovo PIN"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                        className={styles.pinEditInput}
                        autoFocus
                      />
                      <button className={styles.savePin} onClick={() => resetPin(u.id)}>✓</button>
                      <button className={styles.cancelPin} onClick={() => { setEditingPin(null); setNewPin('') }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <button className={styles.techBtn} onClick={() => { setEditingPin(u.id); setNewPin('') }}>
                        🔑 Cambia PIN
                      </button>
                      <button
                        className={`${styles.techBtn} ${u.abilitato ? styles.techBtnOff : styles.techBtnOn}`}
                        onClick={() => toggleUtente(u.id)}
                      >
                        {u.abilitato ? '🔒 Disabilita' : '🔓 Abilita'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* REPARTI */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>🗂️ Reparti ({reparti.length})</div>
          <div className={styles.infoGrid}>
            {reparti.map(r => (
              <div key={r.id} className={styles.infoRow}>
                <span>{r.nome}</span>
                <strong>{r.sottoreparti?.length || 0} prodotti · IVA {r.iva}%</strong>
              </div>
            ))}
          </div>
        </div>

        {/* RESET COMPLETO */}
        <div className={styles.section} style={{borderColor:'rgba(255,77,106,0.3)'}}>
          <div className={styles.sectionTitle} style={{color:'#ff4d6a'}}>⚠️ Reset Sistema</div>
          <p className={styles.resetDesc}>
            Elimina tutti i dati: utenti, reparti, negozio, contatori.<br/>
            Usare solo in caso di reinstallazione completa.
          </p>
          {!showReset ? (
            <button className={styles.resetBtn} onClick={() => setShowReset(true)}>
              Reset completo sistema
            </button>
          ) : (
            <div className={styles.resetConfirm}>
              <span>Sei sicuro? Questa operazione è irreversibile.</span>
              <div style={{display:'flex', gap:10, marginTop:12}}>
                <button className={styles.cancelPin} onClick={() => setShowReset(false)}>Annulla</button>
                <button className={styles.resetBtnConfirm} onClick={resetCompleto}>Sì, resetta tutto</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
