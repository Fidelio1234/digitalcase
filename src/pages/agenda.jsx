import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '@/context/AuthContext'
import { useNegozioId } from '@/hooks/useNegozioId'
import { supabase } from '@/lib/supabase'
import {
  getRepartiDb, getPrenotazioniDb, salvaPrenotazioneDb, eliminaPrenotazioneDb,
  chiudiPrenotazioneDb, getClientiAgendaDb, salvaClienteAgendaDb,
} from '@/lib/supabase-db'

const ORA_INIZIO = '07:30'
const ORA_FINE = '21:00'
const STEP_MIN = 30

function generaSlot() {
  const slots = []
  let [h, m] = ORA_INIZIO.split(':').map(Number)
  const [hFine, mFine] = ORA_FINE.split(':').map(Number)
  while (h < hFine || (h === hFine && m <= mFine)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    m += STEP_MIN
    if (m >= 60) { m -= 60; h += 1 }
  }
  return slots
}
const SLOTS = generaSlot()

function toISOLocale(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

function oggiISO() {
  return toISOLocale(new Date())
}

function fmtEuro(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function fmtDataItaliana(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })
}

const DURATE = [
  { label: '30 min', slot: 1 },
  { label: '1 ora', slot: 2 },
  { label: '1 ora e 30', slot: 3 },
  { label: '2 ore', slot: 4 },
]

export default function AgendaPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loading } = useAuth()
  const router = useRouter()

  const [data, setData] = useState(oggiISO())
  const [prenotazioni, setPrenotazioni] = useState([])
  const [reparti, setReparti] = useState([])
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [ricercaCliente, setRicercaCliente] = useState('')
  const [suggerimentiCliente, setSuggerimentiCliente] = useState([])
  const [showElimina, setShowElimina] = useState(null)
  const [toast, setToast] = useState('')

  const carica = useCallback(async () => {
    if (!NEGOZIO_ID) return
    const [p, r] = await Promise.all([
      getPrenotazioniDb(NEGOZIO_ID, data),
      getRepartiDb(NEGOZIO_ID),
    ])
    setPrenotazioni(p)
    const abilitati = r.filter(x => x.abilitato)
    setReparti(abilitati)
    if (abilitati.length > 0) setRepartoAttivo(prev => prev || abilitati[0].id)
  }, [NEGOZIO_ID, data])

  useEffect(() => {
    if (loading) return
    if (!user) {
      sessionStorage.setItem('login_redirect', '/agenda')
      router.replace('/login')
      return
    }
    carica()
  }, [user, loading, carica])

  // Realtime: se un altro dispositivo (es. un telefono) modifica le prenotazioni
  // di questo negozio, ricarico automaticamente la lista senza bisogno di refresh manuale.
  useEffect(() => {
    if (!NEGOZIO_ID) return
    const channel = supabase
      .channel(`prenotazioni-${NEGOZIO_ID}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'prenotazioni',
        filter: `negozio_id=eq.${NEGOZIO_ID}`,
      }, () => { carica() })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [NEGOZIO_ID, carica])

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function cambiaGiorno(delta) {
    const d = new Date(data + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    setData(toISOLocale(d))
  }

  // Mappa slot -> prenotazione (copre anche gli slot occupati da durate multiple)
  function costruisciSlotMap(lista) {
    const map = {}
    for (const p of lista) {
      const idx = SLOTS.indexOf(p.ora)
      if (idx === -1) continue
      for (let i = 0; i < (p.num_slot || 1); i++) {
        const s = SLOTS[idx + i]
        if (s) map[s] = { prenotazione: p, primo: i === 0 }
      }
    }
    return map
  }
  const slotMap = costruisciSlotMap(prenotazioni)

  function apriNuovo(ora) {
    setForm({ ora, clienteNome: '', clienteTelefono: '', clienteId: null, servizi: [], numSlot: 1, note: '' })
    setRicercaCliente('')
    setSuggerimentiCliente([])
    setModal({ ora, mode: 'nuovo' })
  }

  function apriModifica(p) {
    setForm({
      id: p.id, ora: p.ora, clienteNome: p.cliente_nome, clienteTelefono: p.cliente_telefono || '',
      clienteId: p.cliente_id, servizi: p.servizi || [],
      numSlot: p.num_slot || 1, note: p.note || '',
    })
    setRicercaCliente(p.cliente_nome)
    setSuggerimentiCliente([])
    setModal({ ora: p.ora, mode: 'modifica', id: p.id })
  }

  async function cercaCliente(testo) {
    setRicercaCliente(testo)
    setForm(f => ({ ...f, clienteNome: testo, clienteId: null }))
    if (testo.trim().length < 2) { setSuggerimentiCliente([]); return }
    const risultati = await getClientiAgendaDb(NEGOZIO_ID, testo.trim())
    setSuggerimentiCliente(risultati)
  }

  function selezionaCliente(c) {
    setForm(f => ({ ...f, clienteId: c.id, clienteNome: c.nome, clienteTelefono: c.telefono || '' }))
    setRicercaCliente(c.nome)
    setSuggerimentiCliente([])
  }

  function toggleServizio(reparto, prodotto) {
    setForm(f => {
      const esiste = f.servizi.find(s => s.servizioId === prodotto.id)
      if (esiste) return { ...f, servizi: f.servizi.filter(s => s.servizioId !== prodotto.id) }
      return {
        ...f,
        servizi: [...f.servizi, {
          servizioId: prodotto.id,
          nome: prodotto.nome,
          prezzo: prodotto.prezzoFisso,
          iva: prodotto.ivaOverride ?? reparto.iva,
        }],
      }
    })
  }

  function rimuoviServizio(servizioId) {
    setForm(f => ({ ...f, servizi: f.servizi.filter(s => s.servizioId !== servizioId) }))
  }

  function slotDisponibile(oraInizio, numSlot, escludiId, mappa = slotMap) {
    const idx = SLOTS.indexOf(oraInizio)
    if (idx === -1) return false
    for (let i = 0; i < numSlot; i++) {
      const s = SLOTS[idx + i]
      if (!s) return false
      const occ = mappa[s]
      if (occ && occ.prenotazione.id !== escludiId) return false
    }
    return true
  }

  async function salvaPrenotazione() {
    if (!form.clienteNome?.trim()) { showToast('⚠ Inserisci il nome del cliente'); return }
    if (!form.servizi || form.servizi.length === 0) { showToast('⚠ Seleziona almeno un servizio'); return }

    // Ricarico le prenotazioni del giorno appena prima di salvare (dati freschi dal DB):
    // se nel frattempo un altro dispositivo ha preso lo stesso slot, lo scopriamo qui
    // invece di sovrascriverlo silenziosamente.
    const prenotazioniFresche = await getPrenotazioniDb(NEGOZIO_ID, data)
    const slotMapFresco = costruisciSlotMap(prenotazioniFresche)
    if (!slotDisponibile(form.ora, form.numSlot, form.id, slotMapFresco)) {
      setPrenotazioni(prenotazioniFresche)
      showToast('⚠ Orario non più disponibile: appena preso da un altro dispositivo')
      return
    }

    let clienteId = form.clienteId
    if (form.clienteTelefono?.trim()) {
      const cliente = await salvaClienteAgendaDb(NEGOZIO_ID, { nome: form.clienteNome.trim(), telefono: form.clienteTelefono.trim() })
      if (cliente) clienteId = cliente.id
    }

    const totale = form.servizi.reduce((s, x) => s + x.prezzo, 0)

    const ok = await salvaPrenotazioneDb(NEGOZIO_ID, {
      id: form.id,
      clienteId,
      clienteNome: form.clienteNome.trim(),
      clienteTelefono: form.clienteTelefono?.trim() || null,
      servizi: form.servizi,
      totale,
      data,
      ora: form.ora,
      numSlot: form.numSlot,
      note: form.note?.trim() || null,
      stato: 'prenotato',
      operatoreId: user?.id || null,
      operatoreNome: user?.name || null,
    })
    if (ok) {
      showToast('✓ Prenotazione salvata')
      setModal(null)
      carica()
    } else {
      showToast('⚠ Errore salvataggio')
    }
  }

  async function confermaElimina() {
    if (!showElimina) return
    await eliminaPrenotazioneDb(showElimina)
    setShowElimina(null)
    showToast('✓ Prenotazione eliminata')
    carica()
  }

  function chiudiEVaiInCassa(p) {
    const servizi = p.servizi && p.servizi.length > 0 ? p.servizi : []
    sessionStorage.setItem('agenda_da_chiudere', JSON.stringify({
      id: p.id,
      cliente: p.cliente_nome,
      righe: servizi.map((s, i) => ({
        id: Date.now() + i,
        nome: s.nome,
        importo: s.prezzo,
        quantita: 1,
        totaleRiga: s.prezzo,
        iva: s.iva || 10,
      })),
    }))
    router.push('/cassa')
  }

  const repAttivo = reparti.find(r => r.id === repartoAttivo)
  const totaleOggi = prenotazioni.length
  const isOggi = data === oggiISO()

  if (loading || !user) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dc-bg)', color: 'var(--dc-text)', fontFamily: "'DM Sans', sans-serif" }}>
      <Head>
        <link rel="manifest" href="/manifest-agenda.json" />
        <link rel="apple-touch-icon" href="/icon-agenda-192.png" />
      </Head>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'var(--dc-surface)', borderBottom: '1px solid var(--dc-surface2)', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => router.replace('/cassa')} style={{ background: 'transparent', border: '1px solid #ffffff44', borderRadius: 10, color: 'var(--dc-menta)', padding: '8px 16px', cursor: 'pointer', fontSize: '0.92rem' }}>
          ← Cassa
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>🗓️ Agenda</div>
          <div style={{ fontSize: '0.98rem', color: 'var(--dc-ambra)' }}>{totaleOggi} Prenotazion{totaleOggi === 1 ? 'e' : 'i'} · {fmtDataItaliana(data)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => cambiaGiorno(-1)} style={{ background: 'transparent', border: '1px solid var(--dc-lime)', borderRadius: 10, color: 'var(--dc-rosso-vivo)', padding: '8px 12px', cursor: 'pointer' }}>◀</button>
          <input type="date" value={data} onChange={e => e.target.value && setData(e.target.value)}
            style={{ background: 'var(--dc-surface2)', border: '1px solid var(--dc-lime)', borderRadius: 10, color: 'var(--dc-text)', padding: '8px 10px', fontSize: '0.8rem', fontFamily: "'DM Mono',monospace", colorScheme: 'dark' }}
          />
          <button onClick={() => setData(oggiISO())} disabled={isOggi} style={{
            background: 'transparent', border: '1px solid var(--dc-lime)', borderRadius: 10,
            color: 'var(--dc-ambra)', padding: '8px 12px', fontSize: '0.8rem',
            cursor: isOggi ? 'default' : 'pointer',
            visibility: isOggi ? 'hidden' : 'visible',
          }}>Oggi</button>
          <button onClick={() => cambiaGiorno(1)} style={{ background: 'transparent', border: '1px solid var(--dc-lime)', borderRadius: 10, color: 'var(--dc-rosso-vivo)', padding: '10px 12px', cursor: 'pointer' }}>▶</button>
        </div>
      </header>

      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SLOTS.map(ora => {
          const occ = slotMap[ora]

          if (occ && !occ.primo) {
            return (
              <div key={ora} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', opacity: 0.75 }}>
                <span style={{ width: 52, fontFamily: "'DM Mono',monospace", fontSize: '0.95rem', color: 'var(--dc-rosso-vivo)' }}>{ora}</span>
                <span style={{ fontSize: '0.95rem', color: 'var(--dc-rosso-vivo)' }}>↳ Occupato</span>
              </div>
            )
          }

          if (occ) {
            const p = occ.prenotazione
            const completato = p.stato === 'completato'
            return (
              <div key={ora} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
                background: completato ? 'rgba(var(--dc-verde-rgb), 0.05)' : 'rgba(var(--dc-ambra-rgb), 0.08)',
                border: `1px solid ${completato ? 'rgba(var(--dc-verde-rgb), 0.27)' : 'rgba(var(--dc-ambra-rgb), 0.4)'}`,
              }}>
                <span style={{ width: 52, fontFamily: "'DM Mono',monospace", fontSize: '0.85rem', fontWeight: 700, color: completato ? 'var(--dc-verde)' : 'var(--dc-ambra)' }}>{ora}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{p.cliente_nome}{p.cliente_telefono ? ` · ${p.cliente_telefono}` : ''}</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(var(--dc-text-rgb), 0.67)' }}>{(p.servizi || []).map(s => s.nome).join(' + ')} · € {fmtEuro(p.totale || 0)}{p.num_slot > 1 ? ` · ${p.num_slot * STEP_MIN} min` : ''}</div>
                  {p.operatore_nome && <div style={{ fontSize: '0.92rem', color: 'var(--dc-lime)' }}>👤 PRENOTATO DA {p.operatore_nome}</div>}
                  {p.note && <div style={{ fontSize: '0.78rem', color: 'var(--dc-giallo)', marginTop: 2 }}> 📝 {p.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!completato && (
                    <button onClick={() => chiudiEVaiInCassa(p)} title="Chiudi e vai in cassa"
                      style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--dc-verde)', color: 'var(--dc-bg)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
                      Cassa 💳
                    </button>
                  )}
                  {!completato && (
                    <button onClick={() => apriModifica(p)} title="Modifica"
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--dc-border)', background: 'transparent', color: 'var(--dc-text)', cursor: 'pointer' }}>
                      ✏️
                    </button>
                  )}
                  <button onClick={() => setShowElimina(p.id)} title="Elimina"
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(var(--dc-rosso-rgb), 0.27)', background: 'transparent', color: 'var(--dc-rosso)', cursor: 'pointer' }}>
                    🗑️
                  </button>
                </div>
              </div>
            )
          }

          return (
            <button key={ora} onClick={() => apriNuovo(ora)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
              background: 'transparent', border: '1px dashed var(--dc-border)', cursor: 'pointer', textAlign: 'left', color: 'var(--dc-muted)',
            }}>
              <span style={{ width: 52, fontFamily: "'DM Mono',monospace", fontSize: '0.85rem', color: 'white' }}>{ora}</span>
              <span style={{ fontSize: '1rem', color: 'white' }}>➥ Libero</span>
            </button>
          )
        })}
      </div>

      {/* MODAL NUOVA/MODIFICA PRENOTAZIONE */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(var(--dc-bg-rgb), 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 20 }}>
          <div style={{ background: 'var(--dc-surface)', border: '1px solid var(--dc-border)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>
              {modal.mode === 'nuovo' ? '📅 Nuova prenotazione' : '✏️ Modifica prenotazione'} · {modal.ora}
            </div>

            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--dc-muted)' }}>Cliente</label>
              <input type="text" value={ricercaCliente} onChange={e => cercaCliente(e.target.value)}
                placeholder="Nome e cognome..."
                style={{ width: '100%', background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)', borderRadius: 10, padding: 12, color: 'var(--dc-text)', fontSize: '0.9rem', boxSizing: 'border-box', marginTop: 4 }}
              />
              {suggerimentiCliente.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)', borderRadius: 10, marginTop: 4, zIndex: 10, maxHeight: 160, overflowY: 'auto' }}>
                  {suggerimentiCliente.map(c => (
                    <div key={c.id} onClick={() => selezionaCliente(c)}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--dc-border)', fontSize: '0.85rem' }}>
                      {c.nome} {c.telefono ? `· ${c.telefono}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--dc-muted)' }}>Telefono</label>
              <input type="tel" value={form.clienteTelefono || ''} onChange={e => setForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                placeholder="Es. 3331234567"
                style={{ width: '100%', background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)', borderRadius: 10, padding: 12, color: 'var(--dc-text)', fontSize: '0.9rem', boxSizing: 'border-box', marginTop: 4 }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--dc-verde)' }}>Servizi (puoi selezionarne più di uno)</label>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0' }}>
                {reparti.map(r => (
                  <button key={r.id} onClick={() => setRepartoAttivo(r.id)}
                    style={{
                      flexShrink: 0, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
                      border: `1px solid ${repartoAttivo === r.id ? r.colore : '#252830'}`,
                      background: repartoAttivo === r.id ? r.colore + '22' : 'transparent', color: '#eef0f6',
                    }}>
                    {r.nome}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 6, marginTop: 6 }}>
                {repAttivo?.sottoreparti?.filter(s => s.abilitato).map(sr => {
                  const selezionato = form.servizi?.some(s => s.servizioId === sr.id)
                  return (
                    <button key={sr.id} onClick={() => toggleServizio(repAttivo, sr)}
                      style={{
                        padding: '8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                        border: `1px solid ${selezionato ? '#00e5a0' : repAttivo.colore + '44'}`,
                        background: selezionato ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'var(--dc-surface2)',
                      }}>
                      <div style={{ fontSize: '0.80rem', fontWeight: 600, color:'white' }}>{selezionato ? '✓ ' : ''}{sr.nome}</div>
                      <div style={{ fontSize: '0.79rem', color: 'var(--dc-verde)' }}>€ {fmtEuro(sr.prezzoFisso)}</div>
                    </button>
                  )
                })}
              </div>
              {form.servizi?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, padding: '8px 10px', background: 'var(--dc-surface2)', borderRadius: 10 }}>
                  {form.servizi.map(s => (
                    <span key={s.servizioId} onClick={() => rimuoviServizio(s.servizioId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'rgba(var(--dc-verde-rgb), 0.15)', color: 'var(--dc-verde)', fontSize: '0.75rem', cursor: 'pointer' }}>
                      {s.nome} · €{fmtEuro(s.prezzo)} ✕
                    </span>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 700, color: 'var(--dc-text)' }}>
                    Totale € {fmtEuro(form.servizi.reduce((s, x) => s + x.prezzo, 0))}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--dc-verde)' }}>Durata</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {DURATE.map(d => (
                  <button key={d.slot} onClick={() => setForm(f => ({ ...f, numSlot: d.slot }))}
                    style={{
                      flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
                      border: `1px solid ${form.numSlot === d.slot ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
                      background: form.numSlot === d.slot ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'transparent', color: 'var(--dc-text)',
                    }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--dc-verde)' }}>Note (opzionale)</label>
              <textarea value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Es. cliente allergico alla crema di cocco..."
                rows={2}
                style={{ width: '100%', background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)', borderRadius: 10, padding: 12, color: 'var(--dc-text)', fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box', marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 12, borderRadius: 10, background: 'transparent', border: '1px solid var(--dc-border)', color: 'var(--dc-rosso-vivo)', cursor: 'pointer' }}>Annulla</button>
              <button onClick={salvaPrenotazione} style={{ flex: 1, padding: 12, borderRadius: 10, background: 'var(--dc-verde)', border: 'none', color: 'var(--dc-bg)', fontWeight: 700, cursor: 'pointer' }}>✓ Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINA */}
      {showElimina && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--dc-surface)', border: '2px solid var(--dc-rosso)', borderRadius: 16, padding: 28, width: 320 }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--dc-rosso)', marginBottom: 8 }}>🗑️ Eliminare la prenotazione?</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--dc-ambra)', marginBottom: 20 }}>Questa operazione non può essere annullata.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowElimina(null)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--dc-border)', background: 'transparent', color: 'var(--dc-text)', cursor: 'pointer' }}>Annulla</button>
              <button onClick={confermaElimina} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--dc-rosso)', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--dc-surface2)', border: '1px solid var(--dc-verde)', borderRadius: 10, padding: '10px 20px', color: 'var(--dc-verde)', fontSize: '0.85rem', zIndex: 9999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}