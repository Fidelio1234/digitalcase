import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID } from '@/lib/config'
import styles from '@/styles/Tech.module.css'

export default function TechPage() {
  const router = useRouter()
  const { loadUtenti } = useAuth()
  const [utenti, setUtenti] = useState([])
  const [reparti, setReparti] = useState([])
  const [negozio, setNegozio] = useState({})
  const [negozioForm, setNegozioForm] = useState({})
  const [editNegozio, setEditNegozio] = useState(false)
  const [editingPin, setEditingPin] = useState(null)
  const [newPin, setNewPin] = useState('')
  const [showPin, setShowPin] = useState({})
  const [expandedReparto, setExpandedReparto] = useState(null)
  const [showReset, setShowReset] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // Utenti da Supabase
    const { data: utentiData } = await supabase
      .from('utenti')
      .select('*')
      .eq('negozio_id', NEGOZIO_ID)
      .order('created_at')
    if (utentiData) {
      const sorted = [...utentiData].sort((a,b) =>
        a.ruolo === 'owner' ? -1 : b.ruolo === 'owner' ? 1 : a.nome.localeCompare(b.nome)
      )
      setUtenti(sorted)
    }

    // Reparti da Supabase
    const { data: repartiData } = await supabase
      .from('reparti')
      .select('*, prodotti(*)')
      .eq('negozio_id', NEGOZIO_ID)
      .order('ordine')
    if (repartiData) {
      setReparti(repartiData.map(r => ({
        ...r,
        sottoreparti: (r.prodotti || []).sort((a,b) => a.ordine - b.ordine)
      })))
    }

    // Negozio da Supabase
    const { data: negozioData } = await supabase
      .from('negozi')
      .select('*')
      .eq('id', NEGOZIO_ID)
      .single()
    if (negozioData) {
      const n = {
        ragioneSociale: negozioData.ragione_sociale,
        indirizzo: negozioData.indirizzo,
        partitaIva: negozioData.partita_iva,
        telefono: negozioData.telefono,
        sitoWeb: negozioData.sito_web,
        numeroRt: negozioData.numero_rt,
      }
      setNegozio(n)
    }
    setLoading(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── PIN ────────────────────────────────────────────────────────────────────
  async function resetPin(utente) {
    if (newPin.length < 4) { showToast('⚠ PIN deve essere almeno 4 cifre'); return }
    const { error } = await supabase
      .from('utenti')
      .update({ pin: newPin })
      .eq('id', utente.id)
      .select()
    if (error) { showToast('⚠ Errore: ' + error.message); return }
    setUtenti(prev => prev.map(u => u.id === utente.id ? { ...u, pin: newPin } : u))
    setEditingPin(null)
    setNewPin('')
    await loadUtenti() // aggiorna AuthContext
    showToast(`✓ PIN di ${utente.nome} aggiornato`)
  }

  async function toggleUtente(utente) {
    const { error } = await supabase
      .from('utenti')
      .update({ abilitato: !utente.abilitato })
      .eq('id', utente.id)
      .select()
    if (error) { showToast('⚠ Errore'); return }
    setUtenti(prev => prev.map(u => u.id === utente.id ? { ...u, abilitato: !u.abilitato } : u))
    showToast('✓ Stato aggiornato')
  }

  // ── NEGOZIO ────────────────────────────────────────────────────────────────
  async function saveNegozio() {
    const { error } = await supabase
      .from('negozi')
      .update({
        ragione_sociale: negozioForm.ragioneSociale,
        indirizzo: negozioForm.indirizzo,
        partita_iva: negozioForm.partitaIva,
        telefono: negozioForm.telefono,
        sito_web: negozioForm.sitoWeb,
        numero_rt: negozioForm.numeroRt,
      })
      .eq('id', NEGOZIO_ID)
    if (error) { showToast('⚠ Errore salvataggio'); return }
    setNegozio(negozioForm)
    setEditNegozio(false)
    showToast('✓ Intestazione salvata')
  }

  // ── REPARTI ────────────────────────────────────────────────────────────────
  async function toggleReparto(r) {
    await supabase.from('reparti').update({ abilitato: !r.abilitato }).eq('id', r.id)
    setReparti(prev => prev.map(x => x.id === r.id ? { ...x, abilitato: !x.abilitato } : x))
    showToast('✓ Reparto aggiornato')
  }

  async function deleteReparto(r) {
    if (!confirm(`Eliminare reparto "${r.nome}" e tutti i suoi prodotti?`)) return
    await supabase.from('reparti').delete().eq('id', r.id)
    setReparti(prev => prev.filter(x => x.id !== r.id))
    showToast('✓ Reparto eliminato')
  }

  async function toggleProdotto(repartoId, p) {
    await supabase.from('prodotti').update({ abilitato: !p.abilitato }).eq('id', p.id)
    setReparti(prev => prev.map(r => r.id === repartoId ? {
      ...r,
      sottoreparti: r.sottoreparti.map(s => s.id === p.id ? { ...s, abilitato: !s.abilitato } : s)
    } : r))
    showToast('✓ Prodotto aggiornato')
  }

  async function deleteProdotto(repartoId, p) {
    if (!confirm(`Eliminare prodotto "${p.nome}"?`)) return
    await supabase.from('prodotti').delete().eq('id', p.id)
    setReparti(prev => prev.map(r => r.id === repartoId ? {
      ...r,
      sottoreparti: r.sottoreparti.filter(s => s.id !== p.id)
    } : r))
    showToast('✓ Prodotto eliminato')
  }

  // ── RESET ──────────────────────────────────────────────────────────────────
  function resetCompleto() {
    localStorage.clear()
    showToast('✓ Reset locale eseguito')
    setShowReset(false)
    setTimeout(() => router.replace('/login'), 1500)
  }

  const fmt = (cents) => cents ? (cents / 100).toFixed(2).replace('.', ',') : '0,00'

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#08090c',display:'flex',alignItems:'center',justifyContent:'center',color:'#ffb830',fontFamily:'monospace'}}>
      ⏳ Caricamento dati...
    </div>
  )

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

        {/* ── INTESTAZIONE NEGOZIO ── */}
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
              {[
                ['Ragione Sociale', negozio.ragioneSociale],
                ['Indirizzo', negozio.indirizzo],
                ['P.IVA', negozio.partitaIva],
                ['Telefono', negozio.telefono],
                ['Sito Web', negozio.sitoWeb],
                ['Numero RT', negozio.numeroRt],
              ].map(([label, val]) => (
                <div key={label} className={styles.infoRow}>
                  <span>{label}</span>
                  <strong>{val || '—'}</strong>
                </div>
              ))}
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

        {/* ── UTENTI E PIN ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>👥 Utenti e PIN</div>
          <div className={styles.userList}>
            {utenti.map(u => (
              <div key={u.id} className={styles.userRow}>
                <div className={styles.userInfo}>
                  <div className={styles.userName}>
                    {u.ruolo === 'owner' ? '👑' : '👤'} {u.nome}
                    <span style={{
                      marginLeft:8, fontSize:'0.65rem', padding:'2px 8px',
                      borderRadius:6, background: u.abilitato ? 'rgba(0,229,160,0.15)' : 'rgba(255,77,106,0.15)',
                      color: u.abilitato ? '#00e5a0' : '#ff4d6a'
                    }}>
                      {u.abilitato ? 'ATTIVO' : 'DISABILITATO'}
                    </span>
                  </div>

                  {/* PIN display/edit */}
                  {editingPin === u.id ? (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}>
                      <span style={{fontSize:'0.75rem',color:'#5a5d6e'}}>Vecchio PIN: <strong style={{color:'#ffb830'}}>{u.pin}</strong></span>
                      <span style={{color:'#5a5d6e'}}>→</span>
                      <span style={{fontSize:'0.75rem',color:'#5a5d6e'}}>Nuovo:</span>
                      <input
                        type="tel"
                        maxLength={6}
                        placeholder="Nuovo PIN"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,6))}
                        className={styles.pinEditInput}
                        autoFocus
                      />
                      <button className={styles.savePin} onClick={() => resetPin(u)}>✓</button>
                      <button className={styles.cancelPin} onClick={() => { setEditingPin(null); setNewPin('') }}>✕</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                      <span style={{fontSize:'0.75rem',color:'#5a5d6e'}}>PIN:</span>
                      <span style={{
                        fontFamily:'monospace', fontSize:'0.9rem',
                        color:'#ffb830', letterSpacing:3,
                        background:'rgba(255,184,48,0.1)',
                        padding:'2px 10px', borderRadius:6,
                      }}>
                        {showPin[u.id] ? u.pin : '●'.repeat(u.pin?.length || 4)}
                      </span>
                      <button
                        onClick={() => setShowPin(p => ({...p, [u.id]: !p[u.id]}))}
                        style={{background:'none',border:'none',cursor:'pointer',color:'#5a5d6e',fontSize:'0.75rem'}}
                      >
                        {showPin[u.id] ? '🙈' : '👁'}
                      </button>
                    </div>
                  )}
                </div>

                {editingPin !== u.id && (
                  <div className={styles.userActions}>
                    <button className={styles.techBtn} onClick={() => { setEditingPin(u.id); setNewPin('') }}>
                      🔑 Cambia PIN
                    </button>
                    <button
                      className={`${styles.techBtn} ${u.abilitato ? styles.techBtnOff : styles.techBtnOn}`}
                      onClick={() => toggleUtente(u)}
                    >
                      {u.abilitato ? '🔒 Disabilita' : '🔓 Abilita'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── REPARTI ── */}
        <div className={styles.section}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div className={styles.sectionTitle}>🗂️ Reparti e Prodotti</div>
            <button className={styles.techBtn} onClick={() => router.push('/configurazione/reparti')}>
              ✏️ Modifica completa
            </button>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {reparti.map(r => (
              <div key={r.id} style={{
                background:'#1a1c24', borderRadius:12,
                border:`1px solid ${r.abilitato ? r.colore + '44' : '#252830'}`,
                overflow:'hidden'
              }}>
                {/* Header reparto */}
                <div style={{display:'flex',alignItems:'center',padding:'12px 16px',gap:12}}>
                  <div style={{
                    width:36,height:36,borderRadius:8,
                    background:r.colore+'22',border:`1px solid ${r.colore}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:'1.1rem',flexShrink:0
                  }}>
                    {r.icona === 'coffee' ? '☕' : r.icona === 'beer' ? '🍺' :
                     r.icona === 'wine' ? '🍷' : r.icona === 'cake' ? '��' :
                     r.icona === 'pizza' ? '��' : '📦'}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'0.9rem',fontWeight:500}}>{r.nome}</div>
                    <div style={{fontSize:'0.72rem',color:'#5a5d6e',marginTop:2}}>
                      IVA {r.iva}% · max €{fmt(r.massimoImporto)} · {r.sottoreparti?.length || 0} prodotti
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <button
                      onClick={() => toggleReparto(r)}
                      style={{
                        padding:'3px 10px',borderRadius:6,border:'none',cursor:'pointer',
                        fontSize:'0.65rem',fontWeight:500,letterSpacing:1,
                        background: r.abilitato ? 'rgba(0,229,160,0.15)' : '#252830',
                        color: r.abilitato ? '#00e5a0' : '#5a5d6e',
                      }}
                    >
                      {r.abilitato ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => setExpandedReparto(expandedReparto === r.id ? null : r.id)}
                      style={{background:'transparent',border:'1px solid #252830',borderRadius:8,padding:'4px 8px',cursor:'pointer',color:'#5a5d6e',fontSize:'0.75rem'}}
                    >
                      {expandedReparto === r.id ? '▲' : '▼'}
                    </button>
                    <button
                      onClick={() => deleteReparto(r)}
                      style={{background:'transparent',border:'1px solid #252830',borderRadius:8,padding:'4px 8px',cursor:'pointer',color:'#ff4d6a',fontSize:'0.75rem'}}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Sottoreparti */}
                {expandedReparto === r.id && r.sottoreparti?.length > 0 && (
                  <div style={{borderTop:'1px solid #252830',padding:'8px 12px',display:'flex',flexDirection:'column',gap:6}}>
                    {r.sottoreparti.map(p => (
                      <div key={p.id} style={{
                        display:'flex',alignItems:'center',gap:10,
                        padding:'8px 12px',background:'#111318',borderRadius:8,
                        opacity: p.abilitato ? 1 : 0.5,
                        border:`1px solid ${r.colore}33`
                      }}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:r.colore,flexShrink:0}} />
                        <div style={{flex:1}}>
                          <div style={{fontSize:'0.85rem'}}>{p.nome}</div>
                          <div style={{fontSize:'0.7rem',color:'#5a5d6e'}}>
                            €{fmt(p.prezzo_fisso || p.prezzoFisso)} · IVA {p.iva_override ?? r.iva}%
                          </div>
                        </div>
                        <button
                          onClick={() => toggleProdotto(r.id, p)}
                          style={{
                            padding:'2px 8px',borderRadius:5,border:'none',cursor:'pointer',
                            fontSize:'0.62rem',
                            background: p.abilitato ? 'rgba(0,229,160,0.15)' : '#252830',
                            color: p.abilitato ? '#00e5a0' : '#5a5d6e',
                          }}
                        >
                          {p.abilitato ? 'ON' : 'OFF'}
                        </button>
                        <button
                          onClick={() => deleteProdotto(r.id, p)}
                          style={{background:'transparent',border:'none',cursor:'pointer',color:'#ff4d6a',fontSize:'0.8rem'}}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {expandedReparto === r.id && (!r.sottoreparti || r.sottoreparti.length === 0) && (
                  <div style={{borderTop:'1px solid #252830',padding:'12px 16px',color:'#5a5d6e',fontSize:'0.8rem',textAlign:'center'}}>
                    Nessun prodotto
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── RESET ── */}
        <div className={styles.section} style={{borderColor:'rgba(255,77,106,0.3)'}}>
          <div className={styles.sectionTitle} style={{color:'#ff4d6a'}}>⚠️ Reset Sistema</div>
          <p className={styles.resetDesc}>
            Pulisce i dati locali del browser (cache, localStorage).<br/>
            I dati su Supabase non vengono eliminati.
          </p>
          {!showReset ? (
            <button className={styles.resetBtn} onClick={() => setShowReset(true)}>
              Reset cache locale
            </button>
          ) : (
            <div className={styles.resetConfirm}>
              <span>Sei sicuro?</span>
              <div style={{display:'flex',gap:10,marginTop:12}}>
                <button className={styles.cancelPin} onClick={() => setShowReset(false)}>Annulla</button>
                <button className={styles.resetBtnConfirm} onClick={resetCompleto}>Sì, resetta</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
