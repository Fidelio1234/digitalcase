import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { generateId, formatEuro, parseEuro } from '@/lib/storage'
import { getRepartiDb, saveRepartoDb, saveProdottoDb, deleteRepartoDb, deleteProdottoDb } from '@/lib/supabase-db'
import { NEGOZIO_ID } from '@/lib/config'
import styles from '@/styles/Reparti.module.css'

const IVA_OPTIONS = [4, 10, 22]

const ICONE = {
  coffee:'☕', cake:'🍰', food:'🍽️', drink:'🥤', beer:'🍺',
  wine:'🍷', pizza:'🍕', sandwich:'🥪', ice_cream:'��', candy:'🍬',
  bread:'🥐', fruit:'🍎', salad:'��', fish:'🐟', meat:'🥩',
  shopping:'🛍️', gift:'🎁', star:'⭐', tag:'🏷️', box:'📦',
}

const COLORI = [
  '#00e5a0','#ff9f43','#ff6b6b','#6482ff',
  '#ffd93d','#c44dff','#00d2ff','#ff4d94',
  '#a8e063','#f7971e',
]

const emptyReparto = () => ({
  id:'', nome:'', colore:COLORI[0], icona:'coffee',
  iva:10, minimoImporto:0, massimoImporto:5000,
  abilitato:true, ordine:0, sottoreparti:[]
})

const emptySottoreparto = (ivaParent) => ({
  id:'', nome:'', prezzoFisso:0,
  ivaOverride:null, minimoImporto:0, massimoImporto:5000,
  abilitato:true, ordine:0, _ivaParent:ivaParent
})

// Input euro che permette digitazione libera e salva in centesimi al blur
function EuroInput({ valueCents, onChange, placeholder }) {
  const [raw, setRaw] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setRaw(valueCents ? formatEuro(valueCents) : '')
    }
  }, [valueCents, focused])

  return (
    <input
      type="text"
      inputMode="decimal"
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
  const { user, loading } = useAuth()
  const router = useRouter()
  const [reparti, setReparti] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!user) { if (!loading) router.replace('/login'); return }
    if (user?.role !== 'owner') { router.push('/configurazione'); return }
    getRepartiDb(NEGOZIO_ID).then(r => setReparti(r))
  }, [user, router])

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
    setForm({ ...r })
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

  async function saveReparto() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome del reparto'); return }
    try {
      const repartoData = { ...form }
      if (modal.mode === 'add') delete repartoData.id
      else repartoData.id = modal.id
      const result = await saveRepartoDb(NEGOZIO_ID, repartoData)
      console.log('saveRepartoDb result:', result)
      const updated = await getRepartiDb(NEGOZIO_ID)
      setReparti(updated)
      showToast(modal.mode === 'add' ? 'Reparto aggiunto ✓' : 'Reparto salvato ✓')
      closeModal()
    } catch(e) {
      console.log('errore saveReparto:', e)
      showToast('⚠ Errore: ' + e.message)
    }
  }

  function saveSottoreparto() {
    if (!form.nome?.trim()) { showToast('Inserisci il nome del prodotto'); return }
    const updated = reparti.map(r => {
      if (r.id !== modal.parentId) return r
      let subs
      if (modal.mode === 'add') {
        const nuovo = { ...form, id:generateId() }
        delete nuovo._ivaParent
        subs = [...r.sottoreparti, nuovo]
      } else {
        subs = r.sottoreparti.map(sr => {
          if (sr.id !== modal.id) return sr
          const saved = { ...form }
          delete saved._ivaParent
          return saved
        })
      }
      return { ...r, sottoreparti:subs }
    })
    setReparti(updated)
    showToast(modal.mode === 'add' ? 'Prodotto aggiunto ✓' : 'Prodotto salvato ✓')
    closeModal()
  }

  function deleteReparto(id) {
    if (!confirm('Eliminare questo reparto e tutti i suoi prodotti?')) return
    const updated = reparti.filter(r => r.id !== id)
    setReparti(updated)
    showToast('Reparto eliminato')
  }

  function deleteSottoreparto(parentId, srId) {
    if (!confirm('Eliminare questo prodotto?')) return
    const updated = reparti.map(r => {
      if (r.id !== parentId) return r
      return { ...r, sottoreparti:r.sottoreparti.filter(sr => sr.id !== srId) }
    })
    setReparti(updated)
    showToast('Prodotto eliminato')
  }

  function toggleReparto(id) {
    const updated = reparti.map(r => r.id === id ? { ...r, abilitato:!r.abilitato } : r)
    setReparti(updated)
  }

  function toggleSottoreparto(parentId, srId) {
    const updated = reparti.map(r => {
      if (r.id !== parentId) return r
      return { ...r, sottoreparti:r.sottoreparti.map(sr =>
        sr.id === srId ? { ...sr, abilitato:!sr.abilitato } : sr
      )}
    })
    setReparti(updated)
  }

  function moveReparto(id, dir) {
    const idx = reparti.findIndex(r => r.id === id)
    const newArr = [...reparti]
    const swap = idx + dir
    if (swap < 0 || swap >= newArr.length) return
    ;[newArr[idx], newArr[swap]] = [newArr[swap], newArr[idx]]
    setReparti(newArr)
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
                    IVA {r.iva}% · max €{formatEuro(r.massimoImporto)} · {r.sottoreparti.length} prodotti
                  </div>
                </div>
              </div>
              <div className={styles.repartoActions}>
                <button className={`${styles.toggleBtn} ${r.abilitato ? styles.on : styles.off}`} onClick={() => toggleReparto(r.id)}>
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
                      <button className={`${styles.toggleBtn} ${styles.sm} ${sr.abilitato ? styles.on : styles.off}`} onClick={() => toggleSottoreparto(r.id, sr.id)}>
                        {sr.abilitato ? 'ON' : 'OFF'}
                      </button>
                      <button className={styles.iconBtn} onClick={() => openEditSottoreparto(sr, r.id, r.iva)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteSottoreparto(r.id, sr.id)}>
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
                <input
                  type="text"
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
                    <input
                      type="checkbox"
                      checked={form.ivaOverride !== null && form.ivaOverride !== undefined}
                      onChange={e => setForm(f => ({
                        ...f, ivaOverride: e.target.checked ? f._ivaParent : null
                      }))}
                    />
                    Personalizza IVA per questo prodotto
                  </label>
                )}
                {(modal.tipo === 'reparto' || (form.ivaOverride !== null && form.ivaOverride !== undefined)) && (
                  <div className={styles.ivaGroup}>
                    {IVA_OPTIONS.map(v => (
                      <button
                        key={v}
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

              {modal.tipo === 'reparto' && (
                <div className={styles.field}>
                  <label>Colore</label>
                  <div className={styles.colorGrid}>
                    {COLORI.map(c => (
                      <button
                        key={c}
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
                      <button
                        key={k}
                        className={`${styles.iconChoice} ${form.icona === k ? styles.iconActive : ''}`}
                        onClick={() => setForm(f => ({ ...f, icona:k }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={form.abilitato ?? true}
                    onChange={e => setForm(f => ({ ...f, abilitato:e.target.checked }))}
                  />
                  {modal.tipo === 'reparto' ? 'Reparto abilitato' : 'Prodotto abilitato'}
                </label>
              </div>

            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal}>Annulla</button>
              <button className={styles.saveBtn} onClick={modal.tipo === 'reparto' ? saveReparto : saveSottoreparto}>
                {modal.mode === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
