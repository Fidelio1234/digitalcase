/*import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { formatEuro, parseEuro } from '@/lib/storage'
import { getRepartiDb, saveRepartoDb, saveProdottoDb, deleteRepartoDb, deleteProdottoDb } from '@/lib/supabase-db'
import { useNegozioId } from '@/hooks/useNegozioId'
import styles from '@/styles/Reparti.module.css'

const IVA_OPTIONS = [4, 10, 22]
const NATURA_IVA_OPTIONS = [
  { value: '', label: 'Nessuna (IVA standard)' },
  { value: 'N1', label: 'N1 - Escluse ex art. 15' },
  { value: 'N2', label: 'N2 - Non soggette' },
  { value: 'N3', label: 'N3 - Non imponibili' },
  { value: 'N4', label: 'N4 - Esenti' },
  { value: 'N5', label: 'N5 - Regime del margine' },
  { value: 'N6', label: 'N6 - Inversione contabile' },
]


const ICONE = {
  // Bevande
  coffee:'☕', beer:'🍺', wine:'🍷', drink:'🥤', cocktail:'🍹',
  tea:'🍵', juice:'🧃', water:'💧', champagne:'🥂', whiskey:'🥃',
  // Cibo base
  pizza:'🍕', sandwich:'🥪', bread:'🥐', food:'🍽️', salad:'🥗',
  // Carne e pesce
  meat:'🥩', fish:'🐟', chicken:'🍗', bacon:'🥓', shrimp:'🦐',
  // Snack e fritti
  fries:'🍟', popcorn:'🍿', chips:'🥨', hotdog:'🌭', burger:'🍔',
  // Dolci
  cake:'🍰', ice_cream:'🍦', candy:'🍬', donut:'🍩', cookie:'🍪',
  chocolate:'🍫', gelato:'🧁', waffle:'🧇',
  // Frutta e verdura
  fruit:'🍎', lemon:'🍋', tomato:'🍅', pepper:'🌶️', mushroom:'🍄',
  corn:'🌽', avocado:'🥑', olive:'🫒', garlic:'🧄', onion:'🧅',
  // Formaggio e latticini
  cheese:'🧀', egg:'🥚', butter:'🧈',
  // Pasta e riso
  pasta:'🍝', rice:'🍚', soup:'🍜', taco:'🌮', burrito:'🌯',
  // Altro
  shopping:'🛍️', gift:'🎁', star:'⭐', tag:'🏷️', box:'📦',
  fire:'🔥', heart:'❤️', leaf:'🌿',
}

const COLORI = [
  '#00e5a0','#ff9f43','#ff6b6b','#6482ff',
  '#ffd93d','#c44dff','#00d2ff','#ff4d94',
  '#a8e063','#f7971e',
]

const emptyReparto = () => ({
  nome:'', colore:COLORI[0], icona:'coffee',
  iva:10, minimoImporto:0, massimoImporto:5000,
  natura_iva:'', uscita:1, abilitato:true, ordine:0, sottoreparti:[]
})

const emptySottoreparto = (ivaParent) => ({
  nome:'', prezzoFisso:0,
  ivaOverride:null, minimoImporto:0, massimoImporto:5000,
  abilitato:true, ordine:0, _ivaParent:ivaParent
})

function EuroInput({ valueCents, onChange, placeholder }) {
  const [raw, setRaw] = useState('')
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setRaw(valueCents ? formatEuro(valueCents) : '')
  }, [valueCents, focused])
  return (
    <input
      type="text" inputMode="decimal"
      placeholder={placeholder || '0,00'}
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onFocus={() => { setFocused(true); setRaw(valueCents ? formatEuro(valueCents) : '') }}
      onBlur={() => {
        setFocused(false)
        const cents = parseEuro(raw)
        setRaw(cents ? formatEuro(cents) : '')
        onChange(cents)
      }}
    />
  )
}

export default function RepartiPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user } = useAuth()
  const router = useRouter()
  const [reparti, setReparti] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmElimina, setConfirmElimina] = useState(null) // {tipo, id, nome}


  useEffect(() => {
    if (!user) { if (true) router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    loadReparti()
  }, [user, router])

  async function loadReparti() {
    const r = await getRepartiDb(NEGOZIO_ID)
    setReparti(r)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openAddReparto() {
    const d = emptyReparto()
    d.ordine = reparti.length + 1
    setForm(d)
    setModal({ tipo:'reparto', mode:'add' })
  }

  function openEditReparto(r) {
    setForm({ ...r, natura_iva: r.natura_iva || '' })
    setModal({ tipo:'reparto', mode:'edit', id:r.id })
  }

  function openAddSottoreparto(parentId, ivaParent) {
    const d = emptySottoreparto(ivaParent)
    const parent = reparti.find(r => r.id === parentId)
    d.ordine = (parent?.sottoreparti?.length || 0) + 1
    setForm(d)
    setModal({ tipo:'sottoreparto', mode:'add', parentId })
  }

  function openEditSottoreparto(sr, parentId, ivaParent) {
    setForm({ ...sr, _ivaParent:ivaParent })
    setModal({ tipo:'sottoreparto', mode:'edit', parentId, id:sr.id })
  }

  function closeModal() { setModal(null); setForm({}) }

  async function confermaEliminaAction() {
    if (!confirmElimina) return
    if (confirmElimina.tipo === 'reparto') {
      await deleteRepartoDb(confirmElimina.id)
      await loadReparti()
      showToast('Reparto eliminato')
    } else {
      await deleteProdottoDb(confirmElimina.id)
      await loadReparti()
      showToast('Prodotto eliminato')
    }
    setConfirmElimina(null)
  }

  async function saveReparto() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome del reparto'); return }
    setSaving(true)
    try {
      const data = {
        nome: form.nome,
        colore: form.colore,
        icona: form.icona,
        iva: form.iva,
        minimoImporto: form.minimoImporto || 0,
        massimoImporto: form.massimoImporto,
        natura_iva: form.natura_iva || '',
        barcode: form.barcode || '',
        uscita: form.uscita || 1,
        abilitato: form.abilitato,
        ordine: form.ordine,
      }
      if (modal.mode === 'edit') data.id = modal.id
      await saveRepartoDb(NEGOZIO_ID, data)
      await loadReparti()
      showToast(modal.mode === 'add' ? 'Reparto aggiunto ✓' : 'Reparto salvato ✓')
      closeModal()
    } catch(e) {
      showToast('⚠ Errore salvataggio')
    }
    setSaving(false)
  }

  async function saveSottoreparto() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome del prodotto'); return }
    setSaving(true)
    try {
      const data = {
        nome: form.nome,
        prezzoFisso: form.prezzoFisso,
        ivaOverride: form.ivaOverride,
        minimoImporto: form.minimoImporto,
        massimoImporto: form.massimoImporto,
        barcode: form.barcode || null,
        giacenza: form.giacenza !== '' && form.giacenza !== null && form.giacenza !== undefined ? parseInt(form.giacenza) : null,
        giacenzaMinima: form.giacenzaMinima !== '' && form.giacenzaMinima !== null ? parseInt(form.giacenzaMinima) : null,
        abilitato: form.abilitato,
        ordine: form.ordine,
      }
      if (modal.mode === 'edit') data.id = modal.id
      await saveProdottoDb(NEGOZIO_ID, modal.parentId, data)
      await loadReparti()
      showToast(modal.mode === 'add' ? 'Prodotto aggiunto ✓' : 'Prodotto salvato ✓')
      closeModal()
    } catch(e) {
      showToast('⚠ Errore salvataggio')
    }
    setSaving(false)
  }

  function deleteReparto(id) {
    setConfirmElimina({ tipo: 'reparto', id: id, nome: reparti.find(r => r.id === id)?.nome || 'questo reparto' })
  }

  function deleteSottoreparto(srId) {
    setConfirmElimina({ tipo: 'prodotto', id: srId, nome: 'questo prodotto' })
  }

  async function toggleReparto(r) {
    await saveRepartoDb(NEGOZIO_ID, { ...r, abilitato: !r.abilitato })
    await loadReparti()
  }

  async function toggleSottoreparto(parentId, sr, ivaParent) {
    await saveProdottoDb(NEGOZIO_ID, parentId, { ...sr, abilitato: !sr.abilitato })
    await loadReparti()
  }

  async function moveReparto(id, dir) {
    const idx = reparti.findIndex(r => r.id === id)
    const arr = [...reparti]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    await Promise.all(arr.map((r, i) => saveRepartoDb(NEGOZIO_ID, { ...r, ordine: i + 1 })))
    await loadReparti()
  }

  const ivaEffettiva = modal?.tipo === 'sottoreparto'
    ? (form.ivaOverride ?? form._ivaParent)
    : form.iva

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
          <span>Configurazione Reparti</span>
          <span className={styles.headerSub}>
            {reparti.length} reparti · {reparti.reduce((a,r) => a + r.sottoreparti.length, 0)} prodotti
          </span>
        </div>
        <button className={styles.addBtn} onClick={openAddReparto}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuovo reparto
        </button>
      </header>

      <div className={styles.content}>
        {reparti.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🗂️</div>
            <div>Nessun reparto ancora</div>
            <div className={styles.emptySub}>Clicca "Nuovo reparto" per iniziare</div>
          </div>
        )}

        {reparti.map((r, idx) => (
          <div key={r.id} className={`${styles.repartoCard} ${!r.abilitato ? styles.disabled : ''}`}>
            <div className={styles.repartoHeader}>
              <div className={styles.repartoLeft}>
                <div className={styles.repartoOrdine}>
                  <button onClick={() => moveReparto(r.id, -1)} disabled={idx === 0}>▲</button>
                  <button onClick={() => moveReparto(r.id, 1)} disabled={idx === reparti.length - 1}>▼</button>
                </div>
                <div className={styles.repartoIcona} style={{ background:r.colore+'22', borderColor:r.colore }}>
                  {ICONE[r.icona] || '📦'}
                </div>
                <div>
                  <div className={styles.repartoNome}>{r.nome}</div>
                  <div className={styles.repartoMeta}>
                    {r.natura_iva ? <span style={{color:'#ffb830'}}>{r.natura_iva}</span> : `IVA ${r.iva}%`} · max €{formatEuro(r.massimoImporto)} · {r.sottoreparti.length} prodotti
                  </div>
                </div>
              </div>
              <div className={styles.repartoActions}>
                <button className={`${styles.toggleBtn} ${r.abilitato ? styles.on : styles.off}`} onClick={() => toggleReparto(r)}>
                  {r.abilitato ? 'ON' : 'OFF'}
                </button>
                <button className={styles.iconBtn} onClick={() => openEditReparto(r)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteReparto(r.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                  </svg>
                </button>
                <button className={styles.iconBtn} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform:expandedId === r.id ? 'rotate(180deg)' : 'none', transition:'0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
            </div>

            {expandedId === r.id && (
              <div className={styles.sottorepartiWrap}>
                {r.sottoreparti.map(sr => (
                  <div key={sr.id} className={`${styles.srRow} ${!sr.abilitato ? styles.disabled : ''}`}>
                    <div className={styles.srLeft}>
                      <div className={styles.srDot} style={{ background:r.colore }} />
                      <div>
                        <div className={styles.srNome}>{sr.nome}</div>
                        <div className={styles.srMeta}>
                          €{formatEuro(sr.prezzoFisso)} · IVA {sr.ivaOverride ?? r.iva}%
                          {sr.ivaOverride !== null && sr.ivaOverride !== undefined ? ' (personalizzata)' : ' (eredita)'}
                        </div>
                      </div>
                    </div>
                    <div className={styles.srActions}>
                      <button className={`${styles.toggleBtn} ${styles.sm} ${sr.abilitato ? styles.on : styles.off}`}
                        onClick={() => toggleSottoreparto(r.id, sr, r.iva)}>
                        {sr.abilitato ? 'ON' : 'OFF'}
                      </button>
                      <button className={styles.iconBtn} onClick={() => openEditSottoreparto(sr, r.id, r.iva)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteSottoreparto(sr.id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <button className={styles.addSrBtn} onClick={() => openAddSottoreparto(r.id, r.iva)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Aggiungi prodotto
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {modal.mode === 'add'
                  ? (modal.tipo === 'reparto' ? '+ Nuovo Reparto' : '+ Nuovo Prodotto')
                  : (modal.tipo === 'reparto' ? 'Modifica Reparto' : 'Modifica Prodotto')}
              </div>
              <button className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Nome {modal.tipo === 'reparto' ? 'reparto' : 'prodotto'}</label>
                <input type="text"
                  placeholder={modal.tipo === 'reparto' ? 'Es. Caffetteria' : 'Es. Caffè'}
                  value={form.nome || ''}
                  onChange={e => setForm(f => ({ ...f, nome:e.target.value }))}
                  autoFocus
                />
              </div>

              {modal.tipo === 'sottoreparto' && (
                <div className={styles.field}>
                  <label>Prezzo fisso (€)</label>
                  <EuroInput
                    valueCents={form.prezzoFisso}
                    onChange={v => setForm(f => ({ ...f, prezzoFisso:v }))}
                    placeholder="Es. 1,20"
                  />
                </div>
              )}

              <div className={styles.field}>
                <label>
                  Aliquota IVA
                  {modal.tipo === 'sottoreparto' && (
                    <span style={{marginLeft:8, textTransform:'none', letterSpacing:0, color:'#5a5d6e', fontSize:'0.75rem'}}>
                      {form.ivaOverride === null || form.ivaOverride === undefined
                        ? `— eredita ${form._ivaParent}% dal reparto`
                        : '— personalizzata'}
                    </span>
                  )}
                </label>
                {modal.tipo === 'sottoreparto' && (
                  <label className={styles.checkRow}>
                    <input type="checkbox"
                      checked={form.ivaOverride !== null && form.ivaOverride !== undefined}
                      onChange={e => setForm(f => ({ ...f, ivaOverride: e.target.checked ? f._ivaParent : null }))}
                    />
                    Personalizza IVA per questo prodotto
                  </label>
                )}
                {(modal.tipo === 'reparto' || (form.ivaOverride !== null && form.ivaOverride !== undefined)) && (
                  <div className={styles.ivaGroup} style={{opacity: form.natura_iva ? 0.3 : 1, pointerEvents: form.natura_iva ? 'none' : 'auto', transition:'opacity 0.2s'}}>
                    {IVA_OPTIONS.map(v => (
                      <button key={v}
                        className={`${styles.ivaBtn} ${ivaEffettiva === v ? styles.ivaActive : ''}`}
                        onClick={() => {
                          if (modal.tipo === 'reparto') setForm(f => ({ ...f, iva:v }))
                          else setForm(f => ({ ...f, ivaOverride:v }))
                        }}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                )}
                {form.natura_iva && modal.tipo === 'reparto' && (
                  <div style={{fontSize:'0.72rem', color:'#ffb830', marginTop:4}}>
                    ⚠ Con natura {form.natura_iva} l'aliquota IVA non viene applicata
                  </div>
                )}
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Importo minimo (€)</label>
                  <EuroInput
                    valueCents={form.minimoImporto}
                    onChange={v => setForm(f => ({ ...f, minimoImporto:v }))}
                    placeholder="0,00"
                  />
                </div>
                <div className={styles.field}>
                  <label>Importo massimo (€)</label>
                  <EuroInput
                    valueCents={form.massimoImporto}
                    onChange={v => setForm(f => ({ ...f, massimoImporto:v }))}
                    placeholder="Es. 50,00"
                  />
                </div>
              </div>

              {modal.tipo === 'sottoreparto' && (
                <div className={styles.field}>
                  <label>Codice a barre (opzionale)</label>
                  <input
                    id="barcode-input"
                    type="text"
                    value={form.barcode || ''}
                    onChange={e => setForm(f => ({...f, barcode: e.target.value}))}
                    onFocus={e => e.target.select()}
                    placeholder="Scansiona con lo scanner o inserisci manualmente"
                    className={styles.input}
                    style={{fontFamily:"'DM Mono',monospace", letterSpacing:2}}
                  />
                </div>
              )}
              {modal.tipo === 'sottoreparto' && (
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label>Giacenza attuale</label>
                    <input type="number" min="0"
                      value={form.giacenza ?? ''}
                      onChange={e => setForm(f => ({...f, giacenza: e.target.value}))}
                      placeholder="Es. 10"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Soglia minima avviso</label>
                    <input type="number" min="0"
                      value={form.giacenzaMinima ?? ''}
                      onChange={e => setForm(f => ({...f, giacenzaMinima: e.target.value}))}
                      placeholder="Es. 3"
                      className={styles.input}
                    />
                  </div>
                </div>
              )}
              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Colore</label>
                  <div className={styles.colorGrid}>
                    {COLORI.map(c => (
                      <button key={c}
                        className={`${styles.colorDot} ${form.colore === c ? styles.colorActive : ''}`}
                        style={{ background:c }}
                        onClick={() => setForm(f => ({ ...f, colore:c }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Icona</label>
                  <div className={styles.iconGrid}>
                    {Object.entries(ICONE).map(([k,v]) => (
                      <button key={k}
                        className={`${styles.iconChoice} ${form.icona === k ? styles.iconActive : ''}`}
                        onClick={() => setForm(f => ({ ...f, icona:k }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Uscita comanda</label>
                  <div style={{display:'flex', gap:8}}>
                    {[1,2,3].map(n => (
                      <button key={n} type="button"
                        onClick={() => setForm(f => ({...f, uscita: n}))}
                        style={{
                          flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                          background: (form.uscita || 1) === n ? '#00e5a0' : '#1a1c24',
                          color: (form.uscita || 1) === n ? '#08090c' : '#eef0f6',
                          fontSize:'0.82rem', fontWeight: (form.uscita || 1) === n ? 700 : 400,
                        }}>
                        {n}ª uscita
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Natura IVA speciale (opzionale)</label>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                    {NATURA_IVA_OPTIONS.map(n => (
                      <button key={n.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, natura_iva: n.value }))}
                        style={{
                          padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer',
                          fontSize:'0.72rem', fontFamily:"'DM Mono',monospace",
                          background: (form.natura_iva || '') === n.value ? '#00e5a0' : '#1a1c24',
                          color: (form.natura_iva || '') === n.value ? '#08090c' : '#eef0f6',
                          fontWeight: (form.natura_iva || '') === n.value ? 700 : 400,
                        }}
                      >
                        {n.value === '' ? '—' : n.value}
                        {n.label !== 'Nessuna (IVA standard)' ? '' : ' std'}
                      </button>
                    ))}
                  </div>
                  {form.natura_iva && (
                    <div style={{fontSize:'0.72rem', color:'#5a5d6e', marginTop:4}}>
                      {NATURA_IVA_OPTIONS.find(n => n.value === form.natura_iva)?.label}
                    </div>
                  )}
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.checkRow}>
                  <input type="checkbox"
                    checked={form.abilitato ?? true}
                    onChange={e => setForm(f => ({ ...f, abilitato:e.target.checked }))}
                  />
                  {modal.tipo === '  reparto' ? 'Reparto abilitato' : 'Prodotto abilitato'}
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal}>Annulla</button>
              <button className={styles.saveBtn}
                onClick={modal.tipo === 'reparto' ? saveReparto : saveSottoreparto}
                disabled={saving}
              >
                {saving ? '⏳ Salvataggio...' : modal.mode === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFERMA ELIMINA *//*}
      {confirmElimina && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'2px solid #ff4d6a',borderRadius:16,padding:28,maxWidth:380,width:'90%'}}>
            <div style={{fontSize:'1.3rem',textAlign:'center',marginBottom:12}}>🗑️</div>
            <div style={{fontSize:'1rem',fontWeight:700,color:'#ff4d6a',marginBottom:8,textAlign:'center'}}>
              {confirmElimina.tipo === 'reparto' ? 'Elimina reparto' : 'Elimina prodotto'}
            </div>
            <div style={{fontSize:'0.85rem',color:'#5a5d6e',marginBottom:20,textAlign:'center'}}>
              Stai per eliminare <strong style={{color:'#eef0f6'}}>{confirmElimina.nome}</strong>
              {confirmElimina.tipo === 'reparto' && <><br/><span style={{color:'#ff4d6a'}}>e tutti i suoi prodotti</span></>}.
              <br/>Questa operazione non può essere annullata.
            </div>
            <div style={{display:'flex',gap:12}}>
              <button onClick={() => setConfirmElimina(null)}
                style={{flex:1,padding:'12px',borderRadius:10,border:'1px solid #252830',background:'transparent',color:'#eef0f6',cursor:'pointer'}}>
                Annulla
              </button>
              <button onClick={confermaEliminaAction}
                style={{flex:1,padding:'12px',borderRadius:10,border:'none',background:'#ff4d6a',color:'white',cursor:'pointer',fontWeight:700}}>
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL CONFERMA ELIMINA *//*}
      {confirmElimina && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'2px solid #ff4d6a',borderRadius:16,padding:28,maxWidth:380,width:'90%'}}>
            <div style={{fontSize:'1.3rem',textAlign:'center',marginBottom:12}}>🗑️</div>
            <div style={{fontSize:'1rem',fontWeight:700,color:'#ff4d6a',marginBottom:8,textAlign:'center'}}>
              {confirmElimina.tipo === 'reparto' ? 'Elimina reparto' : 'Elimina prodotto'}
            </div>
            <div style={{fontSize:'0.85rem',color:'#5a5d6e',marginBottom:20,textAlign:'center'}}>
              Stai per eliminare <strong style={{color:'#eef0f6'}}>{confirmElimina.nome}</strong>
              {confirmElimina.tipo === 'reparto' && <><br/><span style={{color:'#ff4d6a'}}>e tutti i suoi prodotti</span></>}.
              <br/>Questa operazione non può essere annullata.
            </div>
            <div style={{display:'flex',gap:12}}>
              <button onClick={() => setConfirmElimina(null)}
                style={{flex:1,padding:'12px',borderRadius:10,border:'1px solid #252830',background:'transparent',color:'#eef0f6',cursor:'pointer'}}>
                Annulla
              </button>
              <button onClick={confermaEliminaAction}
                style={{flex:1,padding:'12px',borderRadius:10,border:'none',background:'#ff4d6a',color:'white',cursor:'pointer',fontWeight:700}}>
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



*/







import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { formatEuro, parseEuro } from '@/lib/storage'
import { getRepartiDb, saveRepartoDb, saveProdottoDb, deleteRepartoDb, deleteProdottoDb, getAggiunteRapideDb, salvaAggiunteRapideDb } from '@/lib/supabase-db'
import { useNegozioId } from '@/hooks/useNegozioId'
import styles from '@/styles/Reparti.module.css'

const IVA_OPTIONS = [4, 10, 22]
const NATURA_IVA_OPTIONS = [
  { value: '', label: 'Nessuna (IVA standard)' },
  { value: 'N1', label: 'N1 - Escluse ex art. 15' },
  { value: 'N2', label: 'N2 - Non soggette' },
  { value: 'N3', label: 'N3 - Non imponibili' },
  { value: 'N4', label: 'N4 - Esenti' },
  { value: 'N5', label: 'N5 - Regime del margine' },
  { value: 'N6', label: 'N6 - Inversione contabile' },
]


const ICONE = {
  coffee:'☕', cake:'🍰', food:'🍽️', drink:'🥤', beer:'🍺',
  wine:'🍷', pizza:'🍕', sandwich:'🥪', ice_cream:'🍦', candy:'🍬',
  bread:'🥐', fruit:'🍎', salad:'🥗', fish:'🐟', meat:'🥩',
  shopping:'🛍️', gift:'🎁', star:'⭐', tag:'🏷️', box:'��',
}

const COLORI = [
  '#00e5a0','#ff9f43','#ff6b6b','#6482ff',
  '#ffd93d','#c44dff','#00d2ff','#ff4d94',
  '#a8e063','#f7971e',
]

const emptyReparto = () => ({
  nome:'', colore:COLORI[0], icona:'coffee',
  iva:10, minimoImporto:0, massimoImporto:5000,
  natura_iva:'', uscita:1, abilitato:true, ordine:0, sottoreparti:[]
})

const emptySottoreparto = (ivaParent) => ({
  nome:'', prezzoFisso:0,
  ivaOverride:null, minimoImporto:0, massimoImporto:5000,
  abilitato:true, ordine:0, _ivaParent:ivaParent
})

function EuroInput({ valueCents, onChange, placeholder }) {
  const [raw, setRaw] = useState('')
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setRaw(valueCents ? formatEuro(valueCents) : '')
  }, [valueCents, focused])
  return (
    <input
      type="text" inputMode="decimal"
      placeholder={placeholder || '0,00'}
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onFocus={() => { setFocused(true); setRaw(valueCents ? formatEuro(valueCents) : '') }}
      onBlur={() => {
        setFocused(false)
        const cents = parseEuro(raw)
        setRaw(cents ? formatEuro(cents) : '')
        onChange(cents)
      }}
    />
  )
}

export default function RepartiPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user } = useAuth()
  const router = useRouter()
  const [reparti, setReparti] = useState([])
  const [aggiunteRapide, setAggiunteRapide] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmElimina, setConfirmElimina] = useState(null) // {tipo, id, nome}


  useEffect(() => {
    if (!user) { if (true) router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    loadReparti()
    loadAggiunteRapide()
  }, [user, router])

  async function loadReparti() {
    const r = await getRepartiDb(NEGOZIO_ID)
    setReparti(r)
  }

  async function loadAggiunteRapide() {
    const lista = await getAggiunteRapideDb(NEGOZIO_ID)
    setAggiunteRapide(lista)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openAddReparto() {
    const d = emptyReparto()
    d.ordine = reparti.length + 1
    setForm(d)
    setModal({ tipo:'reparto', mode:'add' })
  }

  function openEditReparto(r) {
    setForm({ ...r, natura_iva: r.natura_iva || '' })
    setModal({ tipo:'reparto', mode:'edit', id:r.id })
  }

  function openAddSottoreparto(parentId, ivaParent) {
    const d = emptySottoreparto(ivaParent)
    const parent = reparti.find(r => r.id === parentId)
    d.ordine = (parent?.sottoreparti?.length || 0) + 1
    setForm(d)
    setModal({ tipo:'sottoreparto', mode:'add', parentId })
  }

  function openEditSottoreparto(sr, parentId, ivaParent) {
    setForm({ ...sr, _ivaParent:ivaParent })
    setModal({ tipo:'sottoreparto', mode:'edit', parentId, id:sr.id })
  }

  function closeModal() { setModal(null); setForm({}) }

  function openAddAggiunta() {
    setForm({ nome: '', costo: 0 })
    setModal({ tipo: 'aggiunta', mode: 'add' })
  }

  function openEditAggiunta(idx) {
    setForm({ ...aggiunteRapide[idx] })
    setModal({ tipo: 'aggiunta', mode: 'edit', idx })
  }

  async function saveAggiunta() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome dell\'aggiunta'); return }
    if (!form.costo || form.costo <= 0) { showToast('Inserisci un costo valido'); return }
    const nomeNorm = form.nome.trim()
    const duplicato = aggiunteRapide.some((a, i) =>
      i !== modal.idx && a.nome.trim().toLowerCase() === nomeNorm.toLowerCase() && a.costo === form.costo
    )
    if (duplicato) { showToast('⚠ Esiste già un\'aggiunta con questo nome e prezzo'); return }
    setSaving(true)
    try {
      const nuova = { nome: nomeNorm, costo: form.costo }
      let nuovaLista
      if (modal.mode === 'edit') {
        nuovaLista = aggiunteRapide.map((a, i) => i === modal.idx ? nuova : a)
      } else {
        nuovaLista = [...aggiunteRapide, nuova]
      }
      const ok = await salvaAggiunteRapideDb(NEGOZIO_ID, nuovaLista)
      if (!ok) throw new Error()
      setAggiunteRapide(nuovaLista)
      showToast(modal.mode === 'add' ? 'Aggiunta creata ✓' : 'Aggiunta salvata ✓')
      closeModal()
    } catch (e) {
      showToast('⚠ Errore salvataggio')
    }
    setSaving(false)
  }

  function deleteAggiunta(idx) {
    setConfirmElimina({ tipo: 'aggiunta', idx, nome: aggiunteRapide[idx]?.nome || 'questa aggiunta' })
  }

  async function confermaEliminaAggiunta() {
    const nuovaLista = aggiunteRapide.filter((_, i) => i !== confirmElimina.idx)
    const ok = await salvaAggiunteRapideDb(NEGOZIO_ID, nuovaLista)
    if (ok) {
      setAggiunteRapide(nuovaLista)
      showToast('Aggiunta eliminata')
    } else {
      showToast('⚠ Errore eliminazione')
    }
    setConfirmElimina(null)
  }

  async function confermaEliminaAction() {
    if (!confirmElimina) return
    if (confirmElimina.tipo === 'reparto') {
      await deleteRepartoDb(confirmElimina.id)
      await loadReparti()
      showToast('Reparto eliminato')
    } else if (confirmElimina.tipo === 'aggiunta') {
      await confermaEliminaAggiunta()
      return // confermaEliminaAggiunta gestisce già setConfirmElimina(null)
    } else {
      await deleteProdottoDb(confirmElimina.id)
      await loadReparti()
      showToast('Prodotto eliminato')
    }
    setConfirmElimina(null)
  }

  async function saveReparto() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome del reparto'); return }
    setSaving(true)
    try {
      const data = {
        nome: form.nome,
        colore: form.colore,
        icona: form.icona,
        iva: form.iva,
        minimoImporto: form.minimoImporto || 0,
        massimoImporto: form.massimoImporto,
        natura_iva: form.natura_iva || '',
        barcode: form.barcode || '',
        uscita: form.uscita || 1,
        abilitato: form.abilitato,
        ordine: form.ordine,
      }
      if (modal.mode === 'edit') data.id = modal.id
      await saveRepartoDb(NEGOZIO_ID, data)
      await loadReparti()
      showToast(modal.mode === 'add' ? 'Reparto aggiunto ✓' : 'Reparto salvato ✓')
      closeModal()
    } catch(e) {
      showToast('⚠ Errore salvataggio')
    }
    setSaving(false)
  }

  async function saveSottoreparto() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome del prodotto'); return }
    setSaving(true)
    try {
      const data = {
        nome: form.nome,
        prezzoFisso: form.prezzoFisso,
        ivaOverride: form.ivaOverride,
        minimoImporto: form.minimoImporto,
        massimoImporto: form.massimoImporto,
        barcode: form.barcode || null,
        giacenza: form.giacenza !== '' && form.giacenza !== null && form.giacenza !== undefined ? parseInt(form.giacenza) : null,
        giacenzaMinima: form.giacenzaMinima !== '' && form.giacenzaMinima !== null ? parseInt(form.giacenzaMinima) : null,
        abilitato: form.abilitato,
        ordine: form.ordine,
      }
      if (modal.mode === 'edit') data.id = modal.id
      await saveProdottoDb(NEGOZIO_ID, modal.parentId, data)
      await loadReparti()
      showToast(modal.mode === 'add' ? 'Prodotto aggiunto ✓' : 'Prodotto salvato ✓')
      closeModal()
    } catch(e) {
      showToast('⚠ Errore salvataggio')
    }
    setSaving(false)
  }

  function deleteReparto(id) {
    setConfirmElimina({ tipo: 'reparto', id: id, nome: reparti.find(r => r.id === id)?.nome || 'questo reparto' })
  }

  function deleteSottoreparto(srId) {
    setConfirmElimina({ tipo: 'prodotto', id: srId, nome: 'questo prodotto' })
  }

  async function toggleReparto(r) {
    await saveRepartoDb(NEGOZIO_ID, { ...r, abilitato: !r.abilitato })
    await loadReparti()
  }

  async function toggleSottoreparto(parentId, sr, ivaParent) {
    await saveProdottoDb(NEGOZIO_ID, parentId, { ...sr, abilitato: !sr.abilitato })
    await loadReparti()
  }

  async function moveReparto(id, dir) {
    const idx = reparti.findIndex(r => r.id === id)
    const arr = [...reparti]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    await Promise.all(arr.map((r, i) => saveRepartoDb(NEGOZIO_ID, { ...r, ordine: i + 1 })))
    await loadReparti()
  }

  const ivaEffettiva = modal?.tipo === 'sottoreparto'
    ? (form.ivaOverride ?? form._ivaParent)
    : form.iva

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
          <span>Configurazione Reparti</span>
          <span className={styles.headerSub}>
            {reparti.length} reparti · {reparti.reduce((a,r) => a + r.sottoreparti.length, 0)} prodotti
          </span>
        </div>
        <button className={styles.addBtn} onClick={openAddReparto}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuovo reparto
        </button>
      </header>

      <div className={styles.content}>
        {reparti.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🗂️</div>
            <div>Nessun reparto ancora</div>
            <div className={styles.emptySub}>Clicca "Nuovo reparto" per iniziare</div>
          </div>
        )}

        {reparti.map((r, idx) => (
          <div key={r.id} className={`${styles.repartoCard} ${!r.abilitato ? styles.disabled : ''}`}>
            <div className={styles.repartoHeader}>
              <div className={styles.repartoLeft}>
                <div className={styles.repartoOrdine}>
                  <button onClick={() => moveReparto(r.id, -1)} disabled={idx === 0}>▲</button>
                  <button onClick={() => moveReparto(r.id, 1)} disabled={idx === reparti.length - 1}>▼</button>
                </div>
                <div className={styles.repartoIcona} style={{ background:r.colore+'22', borderColor:r.colore }}>
                  {ICONE[r.icona] || '📦'}
                </div>
                <div>
                  <div className={styles.repartoNome}>{r.nome}</div>
                  <div className={styles.repartoMeta}>
                    {r.natura_iva ? <span style={{color:'#ffb830'}}>{r.natura_iva}</span> : `IVA ${r.iva}%`} · max €{formatEuro(r.massimoImporto)} · {r.sottoreparti.length} prodotti
                  </div>
                </div>
              </div>
              <div className={styles.repartoActions}>
                <button className={`${styles.toggleBtn} ${r.abilitato ? styles.on : styles.off}`} onClick={() => toggleReparto(r)}>
                  {r.abilitato ? 'ON' : 'OFF'}
                </button>
                <button className={styles.iconBtn} onClick={() => openEditReparto(r)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteReparto(r.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                  </svg>
                </button>
                <button className={styles.iconBtn} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform:expandedId === r.id ? 'rotate(180deg)' : 'none', transition:'0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
            </div>

            {expandedId === r.id && (
              <div className={styles.sottorepartiWrap}>
                {r.sottoreparti.map(sr => (
                  <div key={sr.id} className={`${styles.srRow} ${!sr.abilitato ? styles.disabled : ''}`}>
                    <div className={styles.srLeft}>
                      <div className={styles.srDot} style={{ background:r.colore }} />
                      <div>
                        <div className={styles.srNome}>{sr.nome}</div>
                        <div className={styles.srMeta}>
                          €{formatEuro(sr.prezzoFisso)} · IVA {sr.ivaOverride ?? r.iva}%
                          {sr.ivaOverride !== null && sr.ivaOverride !== undefined ? ' (personalizzata)' : ' (eredita)'}
                        </div>
                      </div>
                    </div>
                    <div className={styles.srActions}>
                      <button className={`${styles.toggleBtn} ${styles.sm} ${sr.abilitato ? styles.on : styles.off}`}
                        onClick={() => toggleSottoreparto(r.id, sr, r.iva)}>
                        {sr.abilitato ? 'ON' : 'OFF'}
                      </button>
                      <button className={styles.iconBtn} onClick={() => openEditSottoreparto(sr, r.id, r.iva)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteSottoreparto(sr.id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <button className={styles.addSrBtn} onClick={() => openAddSottoreparto(r.id, r.iva)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Aggiungi prodotto
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.content} style={{marginTop: 24}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12}}>
          <div className={styles.headerTitle} style={{display:'block'}}>
            <span>Aggiunte rapide (cassa)</span>
            <span className={styles.headerSub}>{aggiunteRapide.length} voci configurate</span>
          </div>
          <button className={styles.addBtn} onClick={openAddAggiunta}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuova Aggiunta
          </button>
        </div>

        {aggiunteRapide.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>➕</div>
            <div>Nessuna aggiunta rapida configurata</div>
            <div className={styles.emptySub}>Clicca "Nuova Aggiunta" per crearne una (es. "Funghi" — €1,00)</div>
          </div>
        )}

        <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
          {aggiunteRapide.map((a, idx) => (
            <div key={idx} style={{
              display:'flex', alignItems:'center', gap:8,
              background:'#1a1c24', border:'1px solid #252830', borderRadius:10,
              padding:'8px 10px 8px 14px',
            }}>
              <div>
                <div style={{fontSize:'0.88rem', color:'#eef0f6', fontWeight:600}}>{a.nome}</div>
                <div style={{fontSize:'0.75rem', color:'#ffb830'}}>€ {(a.costo/100).toFixed(2).replace('.',',')}</div>
              </div>
              <button className={styles.iconBtn} onClick={() => openEditAggiunta(idx)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteAggiunta(idx)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {modal.mode === 'add'
                  ? (modal.tipo === 'reparto' ? '+ Nuovo Reparto' : modal.tipo === 'aggiunta' ? '+ Nuova Aggiunta' : '+ Nuovo Prodotto')
                  : (modal.tipo === 'reparto' ? 'Modifica Reparto' : modal.tipo === 'aggiunta' ? 'Modifica Aggiunta' : 'Modifica Prodotto')}
              </div>
              <button className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {modal.tipo === 'aggiunta' && (
                <>
                  <div className={styles.field}>
                    <label>Nome aggiunta</label>
                    <input type="text"
                      placeholder="Es. Funghi"
                      value={form.nome || ''}
                      onChange={e => setForm(f => ({ ...f, nome:e.target.value.toUpperCase() }))}
                      autoFocus
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Costo aggiunta (€)</label>
                    <EuroInput
                      valueCents={form.costo}
                      onChange={v => setForm(f => ({ ...f, costo:v }))}
                      placeholder="Es. 1,00"
                    />
                  </div>
                </>
              )}
              {modal.tipo !== 'aggiunta' && (
              <>
              <div className={styles.field}>
                <label>Nome {modal.tipo === 'reparto' ? 'reparto' : 'prodotto'}</label>
                <input type="text"
                  placeholder={modal.tipo === 'reparto' ? 'Es. Caffetteria' : 'Es. Caffè'}
                  value={form.nome || ''}
                  onChange={e => setForm(f => ({ ...f, nome:e.target.value }))}
                  autoFocus
                />
              </div>

              {modal.tipo === 'sottoreparto' && (
                <div className={styles.field}>
                  <label>Prezzo fisso (€)</label>
                  <EuroInput
                    valueCents={form.prezzoFisso}
                    onChange={v => setForm(f => ({ ...f, prezzoFisso:v }))}
                    placeholder="Es. 1,20"
                  />
                </div>
              )}

              <div className={styles.field}>
                <label>
                  Aliquota IVA
                  {modal.tipo === 'sottoreparto' && (
                    <span style={{marginLeft:8, textTransform:'none', letterSpacing:0, color:'#5a5d6e', fontSize:'0.75rem'}}>
                      {form.ivaOverride === null || form.ivaOverride === undefined
                        ? `— eredita ${form._ivaParent}% dal reparto`
                        : '— personalizzata'}
                    </span>
                  )}
                </label>
                {modal.tipo === 'sottoreparto' && (
                  <label className={styles.checkRow}>
                    <input type="checkbox"
                      checked={form.ivaOverride !== null && form.ivaOverride !== undefined}
                      onChange={e => setForm(f => ({ ...f, ivaOverride: e.target.checked ? f._ivaParent : null }))}
                    />
                    Personalizza IVA per questo prodotto
                  </label>
                )}
                {(modal.tipo === 'reparto' || (form.ivaOverride !== null && form.ivaOverride !== undefined)) && (
                  <div className={styles.ivaGroup} style={{opacity: form.natura_iva ? 0.3 : 1, pointerEvents: form.natura_iva ? 'none' : 'auto', transition:'opacity 0.2s'}}>
                    {IVA_OPTIONS.map(v => (
                      <button key={v}
                        className={`${styles.ivaBtn} ${ivaEffettiva === v ? styles.ivaActive : ''}`}
                        onClick={() => {
                          if (modal.tipo === 'reparto') setForm(f => ({ ...f, iva:v }))
                          else setForm(f => ({ ...f, ivaOverride:v }))
                        }}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                )}
                {form.natura_iva && modal.tipo === 'reparto' && (
                  <div style={{fontSize:'0.72rem', color:'#ffb830', marginTop:4}}>
                    ⚠ Con natura {form.natura_iva} l'aliquota IVA non viene applicata
                  </div>
                )}
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Importo minimo (€)</label>
                  <EuroInput
                    valueCents={form.minimoImporto}
                    onChange={v => setForm(f => ({ ...f, minimoImporto:v }))}
                    placeholder="0,00"
                  />
                </div>
                <div className={styles.field}>
                  <label>Importo massimo (€)</label>
                  <EuroInput
                    valueCents={form.massimoImporto}
                    onChange={v => setForm(f => ({ ...f, massimoImporto:v }))}
                    placeholder="Es. 50,00"
                  />
                </div>
              </div>

              {modal.tipo === 'sottoreparto' && (
                <div className={styles.field}>
                  <label>Codice a barre (opzionale)</label>
                  <input
                    id="barcode-input"
                    type="text"
                    value={form.barcode || ''}
                    onChange={e => setForm(f => ({...f, barcode: e.target.value}))}
                    onFocus={e => e.target.select()}
                    placeholder="Scansiona con lo scanner o inserisci manualmente"
                    className={styles.input}
                    style={{fontFamily:"'DM Mono',monospace", letterSpacing:2}}
                  />
                </div>
              )}
              {modal.tipo === 'sottoreparto' && (
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label>Giacenza attuale</label>
                    <input type="number" min="0"
                      value={form.giacenza ?? ''}
                      onChange={e => setForm(f => ({...f, giacenza: e.target.value}))}
                      placeholder="Es. 10"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Soglia minima avviso</label>
                    <input type="number" min="0"
                      value={form.giacenzaMinima ?? ''}
                      onChange={e => setForm(f => ({...f, giacenzaMinima: e.target.value}))}
                      placeholder="Es. 3"
                      className={styles.input}
                    />
                  </div>
                </div>
              )}
              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Colore</label>
                  <div className={styles.colorGrid}>
                    {COLORI.map(c => (
                      <button key={c}
                        className={`${styles.colorDot} ${form.colore === c ? styles.colorActive : ''}`}
                        style={{ background:c }}
                        onClick={() => setForm(f => ({ ...f, colore:c }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Icona</label>
                  <div className={styles.iconGrid}>
                    {Object.entries(ICONE).map(([k,v]) => (
                      <button key={k}
                        className={`${styles.iconChoice} ${form.icona === k ? styles.iconActive : ''}`}
                        onClick={() => setForm(f => ({ ...f, icona:k }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Uscita comanda</label>
                  <div style={{display:'flex', gap:8}}>
                    {[1,2,3].map(n => (
                      <button key={n} type="button"
                        onClick={() => setForm(f => ({...f, uscita: n}))}
                        style={{
                          flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                          background: (form.uscita || 1) === n ? '#00e5a0' : '#1a1c24',
                          color: (form.uscita || 1) === n ? '#08090c' : '#eef0f6',
                          fontSize:'0.82rem', fontWeight: (form.uscita || 1) === n ? 700 : 400,
                        }}>
                        {n}ª uscita
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Natura IVA speciale (opzionale)</label>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                    {NATURA_IVA_OPTIONS.map(n => (
                      <button key={n.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, natura_iva: n.value }))}
                        style={{
                          padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer',
                          fontSize:'0.72rem', fontFamily:"'DM Mono',monospace",
                          background: (form.natura_iva || '') === n.value ? '#00e5a0' : '#1a1c24',
                          color: (form.natura_iva || '') === n.value ? '#08090c' : '#eef0f6',
                          fontWeight: (form.natura_iva || '') === n.value ? 700 : 400,
                        }}
                      >
                        {n.value === '' ? '—' : n.value}
                        {n.label !== 'Nessuna (IVA standard)' ? '' : ' std'}
                      </button>
                    ))}
                  </div>
                  {form.natura_iva && (
                    <div style={{fontSize:'0.72rem', color:'#5a5d6e', marginTop:4}}>
                      {NATURA_IVA_OPTIONS.find(n => n.value === form.natura_iva)?.label}
                    </div>
                  )}
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.checkRow}>
                  <input type="checkbox"
                    checked={form.abilitato ?? true}
                    onChange={e => setForm(f => ({ ...f, abilitato:e.target.checked }))}
                  />
                  {modal.tipo === '  reparto' ? 'Reparto abilitato' : 'Prodotto abilitato'}
                </label>
              </div>
              </>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal}>Annulla</button>
              <button className={styles.saveBtn}
                onClick={modal.tipo === 'reparto' ? saveReparto : modal.tipo === 'aggiunta' ? saveAggiunta : saveSottoreparto}
                disabled={saving}
              >
                {saving ? '⏳ Salvataggio...' : modal.mode === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFERMA ELIMINA */}
      {confirmElimina && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'2px solid #ff4d6a',borderRadius:16,padding:28,maxWidth:380,width:'90%'}}>
            <div style={{fontSize:'1.3rem',textAlign:'center',marginBottom:12}}>🗑️</div>
            <div style={{fontSize:'1rem',fontWeight:700,color:'#ff4d6a',marginBottom:8,textAlign:'center'}}>
              {confirmElimina.tipo === 'reparto' ? 'Elimina reparto' : confirmElimina.tipo === 'aggiunta' ? 'Elimina aggiunta' : 'Elimina prodotto'}
            </div>
            <div style={{fontSize:'0.85rem',color:'#5a5d6e',marginBottom:20,textAlign:'center'}}>
              Stai per eliminare <strong style={{color:'#eef0f6'}}>{confirmElimina.nome}</strong>
              {confirmElimina.tipo === 'reparto' && <><br/><span style={{color:'#ff4d6a'}}>e tutti i suoi prodotti</span></>}.
              <br/>Questa operazione non può essere annullata.
            </div>
            <div style={{display:'flex',gap:12}}>
              <button onClick={() => setConfirmElimina(null)}
                style={{flex:1,padding:'12px',borderRadius:10,border:'1px solid #252830',background:'transparent',color:'#eef0f6',cursor:'pointer'}}>
                Annulla
              </button>
              <button onClick={confermaEliminaAction}
                style={{flex:1,padding:'12px',borderRadius:10,border:'none',background:'#ff4d6a',color:'white',cursor:'pointer',fontWeight:700}}>
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