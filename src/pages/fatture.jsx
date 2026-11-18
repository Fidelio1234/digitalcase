import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '@/context/AuthContext'
import { useNegozioId } from '@/hooks/useNegozioId'
import { getClientiFatturaDb, salvaClienteFatturaDb, eliminaClienteFatturaDb } from '@/lib/supabase-db'

const VUOTO = {
  tipo: 'azienda', denominazione: '', nome: '', cognome: '',
  partitaIva: '', codiceFiscale: '', indirizzo: '', cap: '', comune: '',
  provincia: '', nazione: 'IT', codiceDestinatario: '', pec: '', email: '', telefono: '', note: '',
}

export default function FatturePage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loading } = useAuth()
  const router = useRouter()

  const [clienti, setClienti] = useState([])
  const [cerca, setCerca] = useState('')
  const [modal, setModal] = useState(null)      // null | 'nuovo' | cliente in modifica
  const [form, setForm] = useState(VUOTO)
  const [showElimina, setShowElimina] = useState(null)
  const [toast, setToast] = useState('')
  const [cercandoPiva, setCercandoPiva] = useState(false)

  const carica = useCallback(async () => {
    if (!NEGOZIO_ID) return
    setClienti(await getClientiFatturaDb(NEGOZIO_ID, cerca))
  }, [NEGOZIO_ID, cerca])

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    carica()
  }, [user, loading, carica])

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  function apriNuovo() { setForm(VUOTO); setModal('nuovo') }
  function apriModifica(c) {
    setForm({
      id: c.id, tipo: c.tipo || 'azienda', denominazione: c.denominazione || '',
      nome: c.nome || '', cognome: c.cognome || '', partitaIva: c.partita_iva || '',
      codiceFiscale: c.codice_fiscale || '', indirizzo: c.indirizzo || '', cap: c.cap || '',
      comune: c.comune || '', provincia: c.provincia || '', nazione: c.nazione || 'IT',
      codiceDestinatario: c.codice_destinatario || '', pec: c.pec || '',
      email: c.email || '', telefono: c.telefono || '', note: c.note || '',
    })
    setModal('modifica')
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }




  async function cercaPiva() {
    const piva = (form.partitaIva || '').replace(/\D/g, '')
    if (piva.length !== 11) { showToast('⚠ Inserisci una P.IVA di 11 cifre'); return }
    setCercandoPiva(true)
    try {
      const res = await fetch('/api/lookup-piva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partitaIva: piva }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) { showToast('⚠ ' + (data.error || 'P.IVA non trovata')); return }
      setForm(f => ({
        ...f,
        tipo: 'azienda',
        denominazione: data.denominazione || f.denominazione,
        indirizzo: data.indirizzo || f.indirizzo,
        cap: data.cap || f.cap,
        comune: data.comune || f.comune,
        provincia: data.provincia || f.provincia,
      }))
      showToast('✓ Dati trovati — controlla e completa (codice SDI/PEC a mano)')
    } catch {
      showToast('⚠ Errore nella ricerca')
    } finally {
      setCercandoPiva(false)
    }
  }



  async function salva() {
    if (form.tipo === 'azienda' && !form.denominazione.trim()) { showToast('⚠ Inserisci la ragione sociale'); return }
    if (form.tipo === 'privato' && (!form.nome.trim() || !form.cognome.trim())) { showToast('⚠ Inserisci nome e cognome'); return }
    if (!form.indirizzo.trim() || !form.cap.trim() || !form.comune.trim() || !form.provincia.trim()) {
      showToast('⚠ Indirizzo, CAP, comune e provincia sono obbligatori'); return
    }
    if (!form.partitaIva.trim() && !form.codiceFiscale.trim()) {
      showToast('⚠ Serve almeno P.IVA o codice fiscale'); return
    }


    
    const salvato = await salvaClienteFatturaDb(NEGOZIO_ID, {
        ...form,
        provincia: form.provincia.toUpperCase(),
        codiceDestinatario: form.codiceDestinatario.trim() || '0000000',
      })
      if (salvato) {
        showToast('✓ Cliente salvato')
        setModal(null)
        setClienti(prev => [salvato, ...prev.filter(x => x.id !== salvato.id)])
      } else showToast('⚠ Errore salvataggio')
    }


  async function confermaElimina() {
    if (!showElimina) return
    await eliminaClienteFatturaDb(showElimina)
    setShowElimina(null); showToast('✓ Cliente eliminato'); carica()
  }

  if (loading || !user) return null

  const inp = { width: '100%', background: '#1a1c24', border: '1px solid #252830', borderRadius: 10, padding: 10, color: '#eef0f6', fontSize: '0.9rem', boxSizing: 'border-box', marginTop: 4 }
  const lbl = { fontSize: '0.75rem', color: '#eef0f6' }

  return (
    <div style={{ minHeight: '100vh', background: '#08090c', color: '#eef0f6', fontFamily: "'DM Sans', sans-serif" }}>
      <Head><title>Fatture · Clienti</title></Head>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#111318', borderBottom: '1px solid #1a1c24' }}>
        <button onClick={() => router.replace('/cassa')} style={{ background: 'transparent', border: '1px solid #ffffff44', borderRadius: 10, color: '#00ffb3', padding: '8px 16px', cursor: 'pointer' }}>← Cassa</button>



               <div style={{ fontWeight: 700 }}>🧾 Fatturazione</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/fatture/nuova')} style={{ background: '#ffd06b', border: 'none', borderRadius: 10, color: '#08090c', fontWeight: 700, padding: '8px 16px', cursor: 'pointer' }}>📄 Nuova fattura</button>
          <button onClick={apriNuovo} style={{ background: '#00e5a0', border: 'none', borderRadius: 10, color: '#08090c', fontWeight: 700, padding: '8px 16px', cursor: 'pointer' }}>+ Nuovo cliente</button>
        </div>

      </header>

      <div style={{ padding: 16, maxWidth: 820, margin: '0 auto' }}>
      <input type="search" name="ricerca-clienti" autoComplete="off" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca per ragione sociale, cognome, P.IVA o C.F…"
          style={{ ...inp, marginTop: 0, marginBottom: 14 }} />


        {clienti.length === 0 && (
          <div style={{ textAlign: 'center', color: '#5a5d6e', padding: 40 }}>Nessun cliente. Premi “+ Nuovo cliente”.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clienti.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#111318', border: '1px solid #1a1c24', borderRadius: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.tipo === 'azienda' ? (c.denominazione || '—') : `${c.nome || ''} ${c.cognome || ''}`.trim()}</div>
                <div style={{ fontSize: '0.78rem', color: '#eef0f6aa' }}>
                  {c.partita_iva ? `P.IVA ${c.partita_iva}` : ''}{c.partita_iva && c.codice_fiscale ? ' · ' : ''}{c.codice_fiscale ? `C.F. ${c.codice_fiscale}` : ''}
                  {' · '}{c.comune} ({c.provincia})
                </div>
              </div>
              <button onClick={() => apriModifica(c)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #252830', background: 'transparent', color: '#eef0f6', cursor: 'pointer' }}>✏️</button>
              <button onClick={() => setShowElimina(c.id)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ff4d6a44', background: 'transparent', color: '#ff4d6a', cursor: 'pointer' }}>🗑️</button>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL NUOVO/MODIFICA */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,12,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 20}}>
          <div style={{ background: '#111318', border: '1px solid #252830', borderRadius: 20, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>{modal === 'nuovo' ? '📇 Nuovo cliente' : '✏️ Modifica cliente'}</div>

            <div style={{ display: 'flex', gap: 8 }}>
              {['azienda', 'privato'].map(t => (
                <button key={t} onClick={() => set('tipo', t)} style={{ flex: 1, padding: 10, borderRadius: 10, cursor: 'pointer', border: `1px solid ${form.tipo === t ? '#00e5a0' : '#252830'}`, background: form.tipo === t ? 'rgba(0,229,160,0.15)' : 'transparent', color: '#eef0f6', fontWeight: form.tipo === t ? 700 : 400 }}>
                  {t === 'azienda' ? 'Azienda' : 'Privato'}
                </button>
              ))}
            </div>

            {form.tipo === 'azienda' ? (
              <div><label style={lbl}>Ragione sociale *</label><input style={inp} value={form.denominazione} onChange={e => set('denominazione', e.target.value)} /></div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Nome *</label><input style={inp} value={form.nome} onChange={e => set('nome', e.target.value)} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>Cognome *</label><input style={inp} value={form.cognome} onChange={e => set('cognome', e.target.value)} /></div>
              </div>
            )}

<div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>P.IVA (solo cifre)</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input style={{ ...inp, marginTop: 0 }} value={form.partitaIva} onChange={e => set('partitaIva', e.target.value.replace(/\D/g, ''))} />
                  <button type="button" onClick={cercaPiva} disabled={cercandoPiva}
                    title="Cerca dati da P.IVA (VIES)"
                    style={{ flexShrink: 0, padding: '0 14px', borderRadius: 10, border: 'none', background: '#6482ff', color: 'white', fontWeight: 700, cursor: cercandoPiva ? 'default' : 'pointer' }}>
                    {cercandoPiva ? '…' : '🔍'}
                  </button>
                </div>
              </div>
              <div style={{ flex: 1 }}><label style={lbl}>Codice fiscale</label><input style={inp} value={form.codiceFiscale} onChange={e => set('codiceFiscale', e.target.value.toUpperCase())} /></div>
            </div>

            <div><label style={lbl}>Indirizzo *</label><input style={inp} value={form.indirizzo} onChange={e => set('indirizzo', e.target.value)} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 110 }}><label style={lbl}>CAP *</label><input style={inp} value={form.cap} onChange={e => set('cap', e.target.value.replace(/\D/g, '').slice(0, 5))} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Comune *</label><input style={inp} value={form.comune} onChange={e => set('comune', e.target.value)} /></div>
              <div style={{ width: 80 }}><label style={lbl}>Prov. *</label><input style={inp} value={form.provincia} onChange={e => set('provincia', e.target.value.toUpperCase().slice(0, 2))} /></div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Codice destinatario SDI</label><input style={inp} value={form.codiceDestinatario} onChange={e => set('codiceDestinatario', e.target.value.toUpperCase().slice(0, 7))} placeholder="0000000 o una PEC" /></div>
              <div style={{ flex: 1 }}><label style={lbl}>PEC</label><input style={inp} value={form.pec} onChange={e => set('pec', e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => set('email', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Telefono</label><input style={inp} value={form.telefono} onChange={e => set('telefono', e.target.value)} /></div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 12, borderRadius: 10, background: 'transparent', border: '1px solid #252830', color: '#eef0f6', cursor: 'pointer' }}>Annulla</button>
              <button onClick={salva} style={{ flex: 1, padding: 12, borderRadius: 10, background: '#00e5a0', border: 'none', color: '#08090c', fontWeight: 700, cursor: 'pointer' }}>✓ Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINA */}
      {showElimina && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111318', border: '2px solid #ff4d6a', borderRadius: 16, padding: 28, width: 320 }}>
            <div style={{ fontWeight: 700, color: '#ff4d6a', marginBottom: 8 }}>🗑️ Eliminare il cliente?</div>
            <div style={{ fontSize: '0.85rem', color: '#ffb830', marginBottom: 20 }}>Le fatture già emesse restano invariate.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowElimina(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #252830', background: 'transparent', color: '#eef0f6', cursor: 'pointer' }}>Annulla</button>
              <button onClick={confermaElimina} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#ff4d6a', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#1a1c24', border: '1px solid #00e5a0', borderRadius: 10, padding: '10px 20px', color: '#00e5a0', zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  )
}