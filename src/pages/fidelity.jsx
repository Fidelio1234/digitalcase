import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'
import { useAuth } from '@/context/AuthContext'
import { getImpostazioniDb } from '@/lib/supabase-db'
import { cercaClienteFidelity, accreditaPunti } from '@/lib/fidelity'
import FidelityScanner from '@/components/FidelityScanner'

// Caratteri leggibili, senza ambiguità (niente 0/O, 1/I/l)
const CHARSET_CODICE = '23456789'
const CHARSET_PASSWORD = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generaStringa(charset, lunghezza) {
  let s = ''
  for (let i = 0; i < lunghezza; i++) s += charset[Math.floor(Math.random() * charset.length)]
  return s
}

export default function FidelityPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user } = useAuth()
  const router = useRouter()
  const [clienti, setClienti] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'add' | { ...clienteAppenaCreato }
  const [form, setForm] = useState({ nome: '', cognome: '', data_nascita: '' })
  const [errore, setErrore] = useState('')
  const [showPwd, setShowPwd] = useState({}) // { [clienteId]: bool }
  const [toast, setToast] = useState('')
  const [ricerca, setRicerca] = useState('')
  const [confirmElimina, setConfirmElimina] = useState(null)

  // ── Stato scanner / accredito punti ──
  const [impostazioniFidelity, setImpostazioniFidelity] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [clienteScannerizzato, setClienteScannerizzato] = useState(null)
  const [importoInput, setImportoInput] = useState('')
  const [erroreScanner, setErroreScanner] = useState('')
  const [risultatoAccredito, setRisultatoAccredito] = useState(null)
  const [scontrinoInAttesa, setScontrinoInAttesa] = useState(null) 

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    caricaClienti()
    getImpostazioniDb(NEGOZIO_ID).then(setImpostazioniFidelity)

    const pending = sessionStorage.getItem('fidelity_ritorno_scontrino')
    if (pending) {
      try {
        const parsed = JSON.parse(pending)
        setScontrinoInAttesa(parsed)
        setShowScanner(true) // apro subito lo scanner, l'operatore arriva qui apposta per scansionare
      } catch (e) { console.error(e) }
    }
  }, [user])

  async function caricaClienti() {
    setLoading(true)
    const { data } = await supabase
      .from('fidelity_clienti')
      .select('*')
      .eq('negozio_id', NEGOZIO_ID)
      .order('created_at', { ascending: false })
    setClienti(data || [])
    setLoading(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openAdd() {
    setForm({ nome: '', cognome: '', data_nascita: '' })
    setErrore('')
    setModal('add')
  }

  function closeModal() { setModal(null); setErrore('') }

  async function salvaCliente() {
    if (!form.nome?.trim() || !form.cognome?.trim()) {
      setErrore('Inserisci nome e cognome')
      return
    }

    // Genera codice univoco per negozio (riprova se collisione)
    let codice = null
    for (let tentativo = 0; tentativo < 10; tentativo++) {
      const candidato = generaStringa(CHARSET_CODICE, 4)
      const esiste = clienti.some(c => c.codice_cliente === candidato)
      if (!esiste) { codice = candidato; break }
    }
    if (!codice) { setErrore('Errore generazione codice, riprova'); return }

    const password = generaStringa(CHARSET_PASSWORD, 6)

    const { data, error } = await supabase
      .from('fidelity_clienti')
      .insert({
        negozio_id: NEGOZIO_ID,
        codice_cliente: codice,
        nome: form.nome.trim(),
        cognome: form.cognome.trim(),
        data_nascita: form.data_nascita || null,
        password,
      })
      .select()
      .single()

    if (error) { setErrore('Errore salvataggio: ' + error.message); return }

    await caricaClienti()
    setModal(data) // mostro subito codice+password generati
  }

  async function toggleAttivo(cliente) {
    await supabase.from('fidelity_clienti').update({ attivo: !cliente.attivo }).eq('id', cliente.id)
    setClienti(prev => prev.map(c => c.id === cliente.id ? { ...c, attivo: !c.attivo } : c))
  }

  async function confermaElimina() {
    await supabase.from('fidelity_clienti').delete().eq('id', confirmElimina.id)
    setClienti(prev => prev.filter(c => c.id !== confirmElimina.id))
    showToast('Cliente eliminato')
    setConfirmElimina(null)
  }

  // ── Scanner USB ──
  async function handleScan(token) {
    setErroreScanner('')
    const cliente = await cercaClienteFidelity(NEGOZIO_ID, token)
    if (!cliente) {
      setErroreScanner('QR non riconosciuto o cliente disabilitato')
      return
    }
    setShowScanner(false)

    if (scontrinoInAttesa) {
      // Arrivo da uno scontrino aperto in cassa: l'importo è già noto, niente da chiedere
      const importoEuro = scontrinoInAttesa.totale / 100
      const risultato = await accreditaPunti(cliente, importoEuro, impostazioniFidelity, user?.id || null)
      setRisultatoAccredito(risultato)
      await caricaClienti()
    } else {
      // Scan "libero" dalla pagina fidelity, senza scontrino in corso: chiedo l'importo come prima
      setClienteScannerizzato(cliente)
      setImportoInput('')
    }
  }

  async function confermaAccredito() {
    const importo = parseFloat((importoInput || '').replace(',', '.'))
    if (isNaN(importo) || importo <= 0) { setErroreScanner('Inserisci un importo valido'); return }

    const risultato = await accreditaPunti(clienteScannerizzato, importo, impostazioniFidelity, user?.id || null)
    setRisultatoAccredito(risultato)
    setClienteScannerizzato(null)
    await caricaClienti() // ricarica per aggiornare il saldo punti in lista
  }

  const clientiFiltrati = clienti.filter(c => {
    const q = ricerca.trim().toLowerCase()
    if (!q) return true
    return c.nome.toLowerCase().includes(q) || c.cognome.toLowerCase().includes(q) || c.codice_cliente.includes(q.toUpperCase())
  })

  const inputStyle = {
    background: '#111318', border: '1px solid #252830', borderRadius: 8,
    padding: '10px 12px', color: '#eef0f6', fontSize: '0.9rem',
    fontFamily: "'DM Mono',monospace", width: '100%', boxSizing: 'border-box'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#08090c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00e5a0', fontFamily: 'monospace' }}>
      ⏳ Caricamento...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#08090c', color: '#eef0f6', fontFamily: "'DM Mono',monospace", padding: 24 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <button onClick={() => router.replace('/cassa')} style={{ background: 'transparent', border: '1px solid #ffffff44', borderRadius: 10, color: '#00e5a0', padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem' }}>
          ← Cassa
        </button>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>💳 Fidelity</div>
          <div style={{ fontSize: '0.8rem', color: '#5a5d6e', marginTop: 2 }}>{clienti.length} clienti registrati</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowScanner(true)} style={{
            padding: '10px 20px', borderRadius: 12, border: '1px solid #00e5a0', cursor: 'pointer',
            background: 'transparent', color: '#00e5a0', fontSize: '0.85rem', fontWeight: 700
          }}>
            🔌 Scansiona cliente
          </button>
          <button onClick={openAdd} style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: '#00e5a0', color: '#08090c', fontSize: '0.85rem', fontWeight: 700
          }}>
            + Nuovo cliente
          </button>
        </div>
      </div>

      <input
        type="text" placeholder="Cerca per nome, cognome o codice..."
        value={ricerca} onChange={e => setRicerca(e.target.value)}
        style={{ ...inputStyle, marginBottom: 20, maxWidth: 400 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clientiFiltrati.length === 0 && (
          <div style={{ color: '#5a5d6e', textAlign: 'center', padding: 40 }}>Nessun cliente trovato</div>
        )}
        {clientiFiltrati.map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '14px 18px', background: '#111318', borderRadius: 12,
            border: `1px solid ${c.attivo ? '#252830' : '#ff4d6a44'}`, opacity: c.attivo ? 1 : 0.6, flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: '#00e5a022', border: '1px solid #00e5a0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#00e5a0', flexShrink: 0
              }}>
                {c.nome.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{c.nome} {c.cognome}</div>
                <div style={{ fontSize: '0.80rem', color: 'white', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>Codice: <strong style={{ color: '#00e5a0' }}>{c.codice_cliente}</strong></span>
                  <span>·</span>
                  <span onClick={() => setShowPwd(s => ({ ...s, [c.id]: !s[c.id] }))} style={{ cursor: 'pointer' }}>
                    Password: <strong style={{ color: '#00e5a0' }}>{showPwd[c.id] ? c.password : '••••••'}</strong> {showPwd[c.id] ? '🙈' : '👁'}
                  </span>
                  <span>·</span>
                  <span>🎯 {c.punti} punti</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => toggleAttivo(c)} style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                background: c.attivo ? 'rgba(0,229,160,0.15)' : 'rgba(255,77,106,0.15)',
                color: c.attivo ? '#00e5a0' : '#ff4d6a'
              }}>
                {c.attivo ? 'ATTIVO' : 'DISABILITATO'}
              </button>
              <button onClick={() => setConfirmElimina(c)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4d6a', padding: 4, display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: form nuovo cliente */}
      {modal === 'add' && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111318', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, border: '1px solid #252830' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 18 }}>+ Nuovo cliente fidelity</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.72rem', color: '#00e5a0', letterSpacing: 1, display: 'block', marginBottom: 4 }}>NOME</label>
              <input type="text" autoFocus value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.72rem', color: '#00e5a0', letterSpacing: 1, display: 'block', marginBottom: 4 }}>COGNOME</label>
              <input type="text" value={form.cognome} onChange={e => setForm(f => ({ ...f, cognome: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: '0.72rem', color: '#5a5d6e', letterSpacing: 1, display: 'block', marginBottom: 4 }}>DATA DI NASCITA (opzionale)</label>
              <input type="date" value={form.data_nascita} onChange={e => setForm(f => ({ ...f, data_nascita: e.target.value }))} style={inputStyle} />
            </div>

            {errore && <div style={{ color: '#ff4d6a', fontSize: '0.8rem', marginBottom: 14 }}>{errore}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #252830', background: 'transparent', color: '#eef0f6', cursor: 'pointer' }}>Annulla</button>
              <button onClick={salvaCliente} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#00e5a0', color: '#08090c', fontWeight: 700, cursor: 'pointer' }}>Crea card</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: cliente appena creato, mostro codice+password */}
      {modal && modal !== 'add' && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111318', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, border: '1px solid #00e5a0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{modal.nome} {modal.cognome}</div>
            <div style={{ fontSize: '0.78rem', color: '#5a5d6e', marginBottom: 20 }}>Card fidelity creata</div>

            <div style={{ background: '#08090c', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: '0.7rem', color: '#5a5d6e', letterSpacing: 1, marginBottom: 4 }}>CODICE CLIENTE</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#00e5a0', letterSpacing: 2 }}>{modal.codice_cliente}</div>
              <div style={{ fontSize: '0.7rem', color: '#5a5d6e', letterSpacing: 1, marginTop: 14, marginBottom: 4 }}>PASSWORD</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#00e5a0', letterSpacing: 2 }}>{modal.password}</div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#5a5d6e', marginBottom: 20, lineHeight: 1.5 }}>
              Comunica questi dati al cliente: dovrà accedere su <strong style={{ color: '#eef0f6' }}>fidelity.digitalcase.it</strong> per generare il suo QR code.
            </div>

            <button onClick={() => setModal(null)} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#00e5a0', color: '#08090c', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              Fatto
            </button>
          </div>
        </div>
      )}

      {/* MODAL: confirm elimina */}
      {confirmElimina && (
        <div onClick={() => setConfirmElimina(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111318', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, border: '1px solid #ff4d6a44', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🗑️</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Eliminare la card?</div>
            <div style={{ fontSize: '0.85rem', color: 'red', marginBottom: 20 }}>
              {confirmElimina.nome} {confirmElimina.cognome} perderà i {confirmElimina.punti} punti accumulati. Operazione non reversibile.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmElimina(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #252830', background: 'transparent', color: '#eef0f6', cursor: 'pointer' }}>Annulla</button>
              <button onClick={confermaElimina} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#ff4d6a', color: '#08090c', fontWeight: 700, cursor: 'pointer' }}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* SCANNER USB */}
      {showScanner && (
        <FidelityScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {/* CLIENTE TROVATO -> chiedo importo */}
      {clienteScannerizzato && (
        <div onClick={() => setClienteScannerizzato(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111318', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, border: '1px solid #00e5a0' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{clienteScannerizzato.nome} {clienteScannerizzato.cognome}</div>
              <div style={{ fontSize: '0.78rem', color: '#5a5d6e', marginTop: 4 }}>Saldo attuale: {clienteScannerizzato.punti} punti</div>
            </div>
            <label style={{ fontSize: '0.72rem', color: '#00e5a0', letterSpacing: 1, display: 'block', marginBottom: 6 }}>IMPORTO SPESO (€)</label>
            <input
              type="text" autoFocus value={importoInput}
              onChange={e => setImportoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confermaAccredito()}
              placeholder="es. 10.00"
              style={{ width: '100%', boxSizing: 'border-box', background: '#08090c', border: '1px solid #252830', borderRadius: 10, padding: '12px', color: '#eef0f6', fontSize: '1rem', textAlign: 'center', marginBottom: 14 }}
            />
            {erroreScanner && <div style={{ color: '#ff4d6a', fontSize: '0.8rem', textAlign: 'center', marginBottom: 14 }}>{erroreScanner}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setClienteScannerizzato(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #252830', background: 'transparent', color: '#eef0f6', cursor: 'pointer' }}>Annulla</button>
              <button onClick={confermaAccredito} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#00e5a0', color: '#08090c', fontWeight: 700, cursor: 'pointer' }}>Accredita</button>
            </div>
          </div>
        </div>
      )}







      {/* RISULTATO ACCREDITO */}
      {risultatoAccredito && (
        <div ref={el => {
            // Auto-chiusura SOLO se non c'è omaggio: in quel caso il cassiere deve leggere e confermare lui
            if (el && scontrinoInAttesa && !risultatoAccredito.omaggioRaggiunto) {
              setTimeout(() => { setRisultatoAccredito(null); setScontrinoInAttesa(null); router.push('/cassa') }, 1000)
            }
          }}
          onClick={() => { if (!scontrinoInAttesa && !risultatoAccredito.omaggioRaggiunto) setRisultatoAccredito(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111318', borderRadius: 16, padding: 28, width: '100%', maxWidth: 360, border: `1px solid ${risultatoAccredito.omaggioRaggiunto ? '#ffb830' : '#00e5a0'}`, textAlign: 'center' }}>
            {risultatoAccredito.omaggioRaggiunto ? (
              <>
                <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#ffb830', marginBottom: 8 }}>Soglia raggiunta!</div>
                <div style={{ fontSize: '0.85rem', color: '#eef0f6', lineHeight: 1.6 }}>
                  Applica <strong>€ {(risultatoAccredito.valoreOmaggio / 100).toFixed(2)}</strong> di sconto/omaggio.<br/>
                  I punti del cliente sono stati azzerati.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>+{risultatoAccredito.puntiGuadagnati} punti</div>
                <div style={{ fontSize: '0.85rem', color: '#5a5d6e' }}>
                  Nuovo saldo: <strong style={{ color: '#00e5a0' }}>{risultatoAccredito.puntiFinali} punti</strong>
                </div>
              </>
            )}
            {(!scontrinoInAttesa || risultatoAccredito.omaggioRaggiunto) && (
              <button onClick={() => {
                  setRisultatoAccredito(null)
                  if (scontrinoInAttesa) { setScontrinoInAttesa(null); router.push('/cassa') }
                }} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#00e5a0', color: '#08090c', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                {scontrinoInAttesa ? 'Torna alla cassa' : 'Fatto'}
              </button>
            )}
          </div>
        </div>
      )}






      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#00e5a0', color: '#08090c', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem' }}>
          {toast}
        </div>
      )}
    </div>
  )
}