import { useState, useEffect } from 'react'
import ImpostazioniRT from '@/components/ImpostazioniRT'
import ImpostazioniTavoli from '@/components/ImpostazioniTavoli'
import ImpostazioniStampanti from '@/components/ImpostazioniStampanti'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'
import styles from '@/styles/Tech.module.css'
import { COOKIE_TECH, tokenValido } from '@/lib/techSession'



function slugCorrente() {
  const hn = window.location.hostname
  if (hn === 'localhost' || hn === '127.0.0.1') return process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
  return hn.replace('.digitalcase.it', '')
}

async function apiUtenti(body) {
  try {
    const res = await fetch('/api/utenti-gestione', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slugCorrente(), ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error || 'Errore' }
    return data
  } catch {
    return { error: 'Errore di rete' }
  }
}


async function apiPalmari(body) {
  try {
    const res = await fetch('/api/palmare-gestione', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slugCorrente(), ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error || 'Errore' }
    return data
  } catch {
    return { error: 'Errore di rete' }
  }
}



export default function TechPage() {
  const NEGOZIO_ID = useNegozioId()
  const router = useRouter()
  const { loadUtenti } = useAuth()
  const [utenti, setUtenti] = useState([])
  const [reparti, setReparti] = useState([])
  const [negozio, setNegozio] = useState({})
  const [negozioForm, setNegozioForm] = useState({})
  const [editNegozio, setEditNegozio] = useState(false)
  const [editingPin, setEditingPin] = useState(null)
  const [newPin, setNewPin] = useState('')
  const [expandedReparto, setExpandedReparto] = useState(null)
  const [showReset, setShowReset] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)

  const [dashboardPassword, setDashboardPassword] = useState('')
const [showDashboardPassword, setShowDashboardPassword] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // Utenti da Supabase
    const r = await apiUtenti({ azione: 'lista' })
    if (r.utenti) setUtenti(r.utenti)

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
      setDashboardPassword(negozioData.dashboard_password || '')
    }
    setLoading(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── PIN ────────────────────────────────────────────────────────────────────
  async function resetPin(utente) {
    if (!/^\d{8}$/.test(newPin)) { showToast('⚠ Il PIN deve essere di 8 cifre'); return }
    const r = await apiUtenti({ azione: 'salva', id: utente.id, pin: newPin })
    if (r.error) { showToast('⚠ ' + r.error); return }
    if (r.utenti) setUtenti(r.utenti)
    setEditingPin(null)
    setNewPin('')
    await loadUtenti() // aggiorna AuthContext
    showToast(`✓ PIN di ${utente.nome} aggiornato`)
  }

  async function toggleUtente(utente) {
    const r = await apiUtenti({ azione: 'abilita', id: utente.id })
    if (r.error) { showToast('⚠ ' + r.error); return }
    if (r.utenti) setUtenti(r.utenti)
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



  async function saveDashboardPassword() {
    if (!dashboardPassword.trim()) { showToast('⚠ Inserisci una password'); return }
    const { error } = await supabase
      .from('negozi')
      .update({ dashboard_password: dashboardPassword.trim() })
      .eq('id', NEGOZIO_ID)
    if (error) { showToast('⚠ Errore: ' + error.message); return }
    showToast('✓ Password dashboard salvata')
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
        <button className={styles.exitBtn} onClick={async () => { await fetch('/api/tech-login', { method: 'DELETE' }); router.replace('/login') }}>
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
                      <span style={{fontSize:'0.75rem',color:'#5a5d6e'}}>Nuovo PIN (8 cifre):</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="Nuovo PIN"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0,8))}
                        className={styles.pinEditInput}
                        autoFocus
                      />
                      <button className={styles.savePin} onClick={() => resetPin(u)}>✓</button>
                      <button className={styles.cancelPin} onClick={() => { setEditingPin(null); setNewPin('') }}>✕</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                      <span style={{fontSize:'0.75rem',color:'white'}}>PIN:</span>
                      <span style={{
                        fontFamily:'monospace', fontSize:'0.9rem',
                        color:'#ffb830', letterSpacing:3,
                        background:'rgba(255,184,48,0.1)',
                        padding:'2px 10px', borderRadius:6,
                      }}>
                        {'●'.repeat(8)}
                      </span>
                    </div>
                  )}
                </div>

                {editingPin !== u.id && (
                  <div className={styles.userActions}>
                    <button className={styles.techBtn} onClick={() => { setEditingPin(u.id); setNewPin('') }}>
                      🔑 Cambia PIN
                    </button>
                    {u.ruolo !== 'owner' && (
                      <button
                        className={`${styles.techBtn} ${u.abilitato ? styles.techBtnOff : styles.techBtnOn}`}
                        onClick={() => toggleUtente(u)}
                      >
                        {u.abilitato ? '🔒 Disabilita' : '🔓 Abilita'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

{/* ── DASHBOARD TITOLARE ── */}
<div className={styles.section}>
  <div className={styles.sectionTitle}>📊 Dashboard Titolare</div>
  <div style={{display:'flex', flexDirection:'column', gap:16}}>
    <div style={{fontSize:'0.78rem', color:'#5a5d6e'}}>
      Password per accedere alla dashboard di monitoraggio remoto.<br/>
      Il titolare la usa su <strong style={{color:'#00e5a0'}}>dmi.digitalcase.it/dashboard</strong>
    </div>
    <div style={{display:'flex', alignItems:'flex-end', gap:10}}>
      <div style={{flex:1}}>
        <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6', marginBottom:6}}>
          Password dashboard
        </div>
        <div style={{position:'relative'}}>
          <input
            type={showDashboardPassword ? 'text' : 'password'}
            value={dashboardPassword}
            onChange={e => setDashboardPassword(e.target.value)}
            placeholder="Es. Ristorante2026!"
            style={{
              width:'100%', background:'#1a1c24', border:'1px solid #252830',
              borderRadius:10, padding:'10px 40px 10px 12px',
              color:'#00e5a0', fontFamily:"'DM Mono',monospace",
              fontSize:'1rem', letterSpacing:2, boxSizing:'border-box',
            }}
          />
          <button
            onClick={() => setShowDashboardPassword(v => !v)}
            style={{
              position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer',
              color:'#5a5d6e', fontSize:'0.85rem',
            }}
          >
            {showDashboardPassword ? '🙈' : '👁'}
          </button>
        </div>
      </div>
      <button
        onClick={saveDashboardPassword}
        style={{
          padding:'10px 16px', borderRadius:10, border:'none',
          background:'#00e5a0', color:'#08090c',
          fontWeight:700, cursor:'pointer', marginBottom:0,
          whiteSpace:'nowrap',
        }}
      >
        Salva
      </button>
    </div>
    <button
      onClick={() => window.open('/dashboard', '_blank')}
      style={{
        padding:'10px 16px', borderRadius:10,
        border:'1px solid #00e5a044', background:'rgba(0,229,160,0.08)',
        color:'#00e5a0', cursor:'pointer', fontSize:'0.82rem',
        fontFamily:"'DM Mono',monospace", textAlign:'left',
      }}
    >
      → Apri dashboard
    </button>
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
                     r.icona === 'wine' ? '🍷' : r.icona === 'cake' ? '🍰' :
                     r.icona === 'pizza' ? '🍕' : '📦'}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'0.9rem',fontWeight:500}}>{r.nome}</div>
                    <div style={{fontSize:'0.72rem',color:'#00e5a0',marginTop:2}}>
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

        {/* ── TAVOLI ── */}
              
              <div className={styles.section}>
          <div className={styles.sectionTitle}>🍽️ Impostazioni Tavoli</div>
          <ImpostazioniTavoli negozioId={NEGOZIO_ID} showToast={showToast} />
        </div>

        {/* ── PAGAMENTO NON RISCOSSO ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>🛵 Pagamento Non Riscosso</div>
          <SezioneNonRiscosso negozioId={NEGOZIO_ID} showToast={showToast} />
        </div>


        {/* ── FATTURAZIONE ELETTRONICA ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>🧾 Fatturazione Elettronica</div>
          <SezioneFatturazione negozioId={NEGOZIO_ID} showToast={showToast} />
        </div>

        {/* ── LICENZA PALMARI (/ordini) ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>📱 Licenza Palmari</div>
          <SezionePalmari showToast={showToast} />
        </div>


        {/* ── REGISTRATORE TELEMATICO ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>🖨️ Stampanti Comande</div>
          <ImpostazioniStampanti reparti={reparti} showToast={showToast} />
        </div>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>🖨️ Registratore Telematico</div>
          <ImpostazioniRT
            reparti={reparti}
            showToast={showToast}
          />
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


export async function getServerSideProps({ req }) {
  if (!tokenValido(req.cookies?.[COOKIE_TECH])) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}



function SezioneNonRiscosso({ negozioId, showToast }) {
  const [attivo, setAttivo] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!negozioId) return
    supabase.from('impostazioni_negozio')
      .select('non_riscosso_abilitato')
      .eq('negozio_id', negozioId)
      .single()
      .then(({ data }) => { setAttivo(!!data?.non_riscosso_abilitato); setLoaded(true) })
  }, [negozioId])

  async function toggle() {
    const nuovo = !attivo
    const { error } = await supabase.from('impostazioni_negozio')
      .update({ non_riscosso_abilitato: nuovo })
      .eq('negozio_id', negozioId)
    if (error) { showToast('⚠ Errore: ' + error.message); return }
    setAttivo(nuovo)
    showToast(nuovo ? '✓ Non riscosso attivato' : '✓ Non riscosso disattivato')
  }







  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
      <div style={{fontSize:'0.82rem', color:'white'}}>
        Mostra il pulsante <strong style={{color:'#00e5a0'}}>🛵 Non riscosso (Glovo)</strong> in cassa alla chiusura.<br/>
        Funziona solo con registratore 3i.
      </div>
      <button onClick={toggle} disabled={!loaded}
        style={{padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer',
          fontSize:'0.7rem', fontWeight:700, letterSpacing:1,
          background: attivo ? 'rgba(0,229,160,0.15)' : '#252830',
          color: attivo ? '#00e5a0' : '#5a5d6e'}}>
        {attivo ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}


function SezioneFatturazione({ negozioId, showToast }) {
  const [attivo, setAttivo] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!negozioId) return
    supabase.from('impostazioni_negozio').select('fatturazione_abilitato')
      .eq('negozio_id', negozioId).single()
      .then(({ data }) => { setAttivo(!!data?.fatturazione_abilitato); setLoaded(true) })
  }, [negozioId])

  async function toggle() {
    const nuovo = !attivo
    const { error } = await supabase.from('impostazioni_negozio')
      .update({ fatturazione_abilitato: nuovo }).eq('negozio_id', negozioId)
    if (error) { showToast('⚠ Errore: ' + error.message); return }
    setAttivo(nuovo)
    showToast(nuovo ? '✓ Fatturazione attivata' : '✓ Fatturazione disattivata')
  }

  if (!loaded) return <div style={{ color: '#5a5d6e' }}>Caricamento…</div>

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#eef0f6' }}>Modulo Fatturazione</div>
        <div style={{ fontSize: '0.72rem', color: '#5a5d6e', marginTop: 2 }}>Abilita l'emissione di fatture elettroniche (pagina /fatture)</div>
      </div>
      <div onClick={toggle}
        style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
          background: attivo ? '#00e5a0' : '#252830', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: attivo ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
      </div>
    </div>
  )
}



function SezionePalmari({ showToast }) {
  const [dati, setDati] = useState(null) // { max, palmari }
  const [maxInput, setMaxInput] = useState('0')
  const [codice, setCodice] = useState(null) // { codice, scade_il }
  const [occupato, setOccupato] = useState(false)
  const [daDisattivare, setDaDisattivare] = useState(null) // palmare in attesa di conferma

  useEffect(() => {
    apiPalmari({ azione: 'stato' }).then(r => {
      if (r.error) { showToast('⚠ ' + r.error); return }
      setDati(r)
      setMaxInput(String(r.max))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function chiama(body, okMsg) {
    if (occupato) return null
    setOccupato(true)
    const r = await apiPalmari(body)
    setOccupato(false)
    if (r.error) { showToast('⚠ ' + r.error); return null }
    if (okMsg) showToast(okMsg)
    return r
  }

  async function salvaMax() {
    const r = await chiama({ azione: 'imposta_max', max: maxInput }, '✓ Licenza aggiornata')
    if (r) setDati(r)
  }

  async function genera() {
    const r = await chiama({ azione: 'genera_codice' })
    if (r) {
      setCodice({ codice: r.codice, scade_il: r.scade_il })
      setDati({ max: r.max, palmari: r.palmari })
    }
  }

  async function disattiva(id) {
    const r = await chiama({ azione: 'disattiva', id }, '✓ Palmare disattivato')
    setDaDisattivare(null)
    if (r) setDati(r)
  }

  const quando = (iso) => iso
    ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

  if (!dati) return <div style={{ color: '#5a5d6e' }}>Caricamento…</div>
  const attivi = dati.palmari.filter(p => p.attivo).length
  const campo = { background: '#252830', border: 'none', borderRadius: 8, color: '#eef0f6', padding: '8px 10px', fontSize: '0.85rem' }
  const bottone = { border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {daDisattivare && (
        <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:20 }}>
          <div style={{ width:'100%', maxWidth:340, background:'#13151c', borderRadius:16, padding:22, textAlign:'center' }}>
            <div style={{ fontSize:'1.6rem', marginBottom:6 }}>📱</div>
            <div style={{ fontWeight:700, color:'#eef0f6', marginBottom:6 }}>Disattivare il palmare?</div>
            <div style={{ fontSize:'0.8rem', color:'#8a8d9e', marginBottom:16 }}>
              «{daDisattivare.nome || 'Palmare senza nome'}» smetterà di funzionare entro un minuto. Per riattivarlo servirà un nuovo codice.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setDaDisattivare(null)} disabled={occupato}
                style={{ ...bottone, flex:1, background:'#252830', color:'#eef0f6' }}>Annulla</button>
              <button onClick={() => disattiva(daDisattivare.id)} disabled={occupato}
                style={{ ...bottone, flex:1, background:'#ff6b6b', color:'#08090c' }}>Disattiva</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#eef0f6' }}>Palmari autorizzati su /ordini</div>
        <div style={{ fontSize: '0.72rem', color: '#5a5d6e', marginTop: 2 }}>
          In uso: {attivi} su {dati.max}. Con 0 nessun telefono può usare /ordini.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min="0" max="20" value={maxInput} onChange={e => setMaxInput(e.target.value)}
          style={{ ...campo, width: 80 }} />
        <button onClick={salvaMax} disabled={occupato} style={{ ...bottone, background: '#252830', color: '#eef0f6' }}>
          Salva massimo
        </button>
        <button onClick={genera} disabled={occupato} style={{ ...bottone, background: '#00e5a0', color: '#08090c' }}>
          Genera codice
        </button>
      </div>

      {codice && (
        <div style={{ background: '#252830', borderRadius: 10, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', letterSpacing: '0.25em', fontWeight: 700, color: '#00e5a0', fontFamily: 'monospace' }}>
            {codice.codice}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#5a5d6e', marginTop: 6 }}>
            Inseriscilo sul telefono entro le {new Date(codice.scade_il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}. Si usa una sola volta.
          </div>
        </div>
      )}

      {dati.palmari.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: '#5a5d6e' }}>Nessun telefono attivato.</div>
      )}
      {dati.palmari.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: p.attivo ? 1 : 0.45 }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#eef0f6' }}>{p.nome || 'Palmare senza nome'}{p.attivo ? '' : ' (disattivato)'}</div>
            <div style={{ fontSize: '0.72rem', color: '#5a5d6e' }}>
              Attivato {quando(p.creato_il)} · ultimo accesso {quando(p.ultimo_accesso)}
            </div>
          </div>
          {p.attivo && (
            <button onClick={() => setDaDisattivare(p)} disabled={occupato}
              style={{ ...bottone, background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b' }}>
              Disattiva
            </button>
          )}
        </div>
      ))}
    </div>
  )
}