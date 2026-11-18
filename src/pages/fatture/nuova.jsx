import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '@/context/AuthContext'
import { useNegozioId } from '@/hooks/useNegozioId'
import { getClientiFatturaDb, getProssimoNumeroFattura, salvaFatturaDb } from '@/lib/supabase-db'

const ALIQUOTE = [22, 10, 5, 4, 0]
const oggiISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const parseEuro = (s) => Math.round((parseFloat(String(s).replace(',', '.')) || 0) * 100)
const fmt = (cents) => (cents / 100).toFixed(2).replace('.', ',')

const FORFETTARIO = process.env.NEXT_PUBLIC_CEDENTE_REGIME === 'RF19'

function calcolaTotali(righe) {
  let imponibile = 0, iva = 0, totale = 0
  for (const r of righe) {
    const gross = parseEuro(r.prezzo) * (parseInt(r.quantita) || 0)
    if (FORFETTARIO) {
      imponibile += gross            // forfettario: niente IVA, imponibile = prezzo pieno
    } else {
      const a = parseInt(r.aliquotaIva) || 0
      const imp = Math.round(gross * 100 / (100 + a))
      imponibile += imp
      iva += gross - imp
    }
    totale += gross
  }
  return { imponibile, iva, totale }
}

export default function NuovaFatturaPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loading } = useAuth()
  const router = useRouter()

  const [clienti, setClienti] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [numero, setNumero] = useState('')
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [data, setData] = useState(oggiISO())
  const [righe, setRighe] = useState([{ descrizione: '', quantita: 1, prezzo: '', aliquotaIva: 22 }])
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState('')
  const [daCassa, setDaCassa] = useState(false)
  const [showMetodo, setShowMetodo] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (!NEGOZIO_ID) return
    getClientiFatturaDb(NEGOZIO_ID).then(setClienti)
    getProssimoNumeroFattura(NEGOZIO_ID).then(({ numero, anno }) => { setNumero(String(numero)); setAnno(anno) })
  }, [user, loading, NEGOZIO_ID])





  // Righe dal conto aperto in cassa (se arriviamo da lì)
  useEffect(() => {
    const raw = sessionStorage.getItem('fattura_da_cassa')
    if (!raw) return
    try {
      const { righe: rc } = JSON.parse(raw)
      const mappate = (rc || [])
        .filter(r => (r.importo ?? 0) >= 0)
        .map(r => ({
          descrizione: r.nome || '',
          quantita: r.quantita || 1,
          prezzo: ((r.importo || 0) / 100).toFixed(2).replace('.', ','),
          aliquotaIva: r.iva ?? 22,
        }))
      if (mappate.length > 0) setRighe(mappate)
      setDaCassa(true)
    } catch {}
    sessionStorage.removeItem('fattura_da_cassa')
  }, [])




  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2500) }
  function setRiga(i, k, v) { setRighe(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r)) }
  function aggiungiRiga() { setRighe(rs => [...rs, { descrizione: '', quantita: 1, prezzo: '', aliquotaIva: 22 }]) }
  function rimuoviRiga(i) { setRighe(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs) }

  const tot = calcolaTotali(righe)



  function apriMetodo() {
    if (!clienteId) { showToast('⚠ Seleziona un cliente'); return }
    const righeValide = righe.filter(r => r.descrizione.trim() && parseEuro(r.prezzo) > 0 && (parseInt(r.quantita) || 0) > 0)
    if (righeValide.length === 0) { showToast('⚠ Aggiungi almeno una riga valida'); return }
    if (!numero || parseInt(numero) < 1) { showToast('⚠ Numero fattura non valido'); return }
    setShowMetodo(true)
  }

  async function salvaConMetodo(metodo) {
    setShowMetodo(false)
    const righeValide = righe.filter(r => r.descrizione.trim() && parseEuro(r.prezzo) > 0 && (parseInt(r.quantita) || 0) > 0)
    const cliente = clienti.find(c => c.id === clienteId)
    const t = calcolaTotali(righeValide)
    setSalvando(true)
    const res = await salvaFatturaDb(NEGOZIO_ID, {
      numero: parseInt(numero), anno, data,
      clienteId: cliente.id, clienteSnapshot: cliente,
      righe: righeValide.map(r => ({
        descrizione: r.descrizione.trim(),
        quantita: parseInt(r.quantita) || 1,
        prezzo_cents: parseEuro(r.prezzo),
        aliquota_iva: parseInt(r.aliquotaIva) || 0,
      })),
      imponibileCents: t.imponibile, ivaCents: t.iva, totaleCents: t.totale,
      metodoPagamento: metodo,
      stato: 'bozza',
    })
    setSalvando(false)
    if (res.error) {
      if (res.error.code === '23505') showToast('⚠ Numero già usato per quest\'anno — cambialo')
      else showToast('⚠ Errore: ' + res.error.message)
      return
    }
    showToast(daCassa ? '✓ Fattura salvata — torno in cassa' : '✓ Fattura salvata come bozza')
    setTimeout(() => router.push(daCassa ? '/cassa' : '/fatture'), 900)
  }



  const inp = { background: '#1a1c24', border: '1px solid #252830', borderRadius: 10, padding: 10, color: '#eef0f6', fontSize: '0.9rem', boxSizing: 'border-box' }
  const lbl = { fontSize: '0.72rem', color: '#5a5d6e', display: 'block', marginBottom: 4 }
  const clienteLabel = (c) => c.tipo === 'azienda' ? (c.denominazione || '—') : `${c.nome || ''} ${c.cognome || ''}`.trim()

  return (
    <div style={{ minHeight: '100vh', background: '#08090c', color: '#eef0f6', fontFamily: "'DM Sans', sans-serif" }}>
      <Head><title>Nuova fattura</title></Head>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#111318', borderBottom: '1px solid #1a1c24' }}>
        <button onClick={() => router.replace('/fatture')} style={{ background: 'transparent', border: '1px solid #ffffff44', borderRadius: 10, color: '#00ffb3', padding: '8px 16px', cursor: 'pointer' }}>← Fatture</button>
        <div style={{ fontWeight: 700 }}>📄 Nuova fattura</div>
        <button onClick={apriMetodo} disabled={salvando} style={{ background: '#ffd06b', border: 'none', borderRadius: 10, color: '#08090c', fontWeight: 700, padding: '8px 16px', cursor: salvando ? 'default' : 'pointer' }}>
          {salvando ? '…' : '✓ Salva bozza'}
        </button>
      </header>

      <div style={{ padding: 16, maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Cliente + numero + data */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={lbl}>Cliente *</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="">— seleziona —</option>
              {clienti.map(c => <option key={c.id} value={c.id}>{clienteLabel(c)}{c.partita_iva ? ` · ${c.partita_iva}` : ''}</option>)}
            </select>
          </div>
          <div style={{ width: 90 }}>
            <label style={lbl}>Numero *</label>
            <input style={{ ...inp, width: '100%' }} value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div style={{ width: 90 }}>
            <label style={lbl}>Anno</label>
            <input style={{ ...inp, width: '100%', color: '#5a5d6e' }} value={anno} readOnly />
          </div>
          <div style={{ width: 150 }}>
            <label style={lbl}>Data</label>
            <input type="date" style={{ ...inp, width: '100%', colorScheme: 'dark' }} value={data} onChange={e => e.target.value && setData(e.target.value)} />
          </div>
        </div>

        {daCassa && (
          <div style={{ background: 'rgba(255,208,107,0.1)', border: '1px solid #ffd06b55', borderRadius: 10, padding: '8px 12px', color: '#ffd06b', fontSize: '0.82rem' }}>
            🛒 Righe caricate dal conto in cassa — seleziona il cliente e salva, poi tornerai in cassa per chiudere.
          </div>
        )}
        {clienti.length === 0 && (
          <div style={{ color: '#ffb830', fontSize: '0.82rem' }}>Nessun cliente in anagrafica. Aggiungine uno dalla pagina Fatture → + Nuovo cliente.</div>
        )}

        {/* Righe */}
        <div>
          <label style={lbl}>Righe (prezzo IVA inclusa)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {righe.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input placeholder="Descrizione" value={r.descrizione} onChange={e => setRiga(i, 'descrizione', e.target.value)} style={{ ...inp, flex: 1 }} />
                <input placeholder="Qtà" value={r.quantita} onChange={e => setRiga(i, 'quantita', e.target.value.replace(/\D/g, ''))} style={{ ...inp, width: 56, textAlign: 'center' }} />
                <input placeholder="€ cad." value={r.prezzo} onChange={e => setRiga(i, 'prezzo', e.target.value)} style={{ ...inp, width: 90, textAlign: 'right' }} />
                <select value={r.aliquotaIva} onChange={e => setRiga(i, 'aliquotaIva', e.target.value)} style={{ ...inp, width: 80 }}>
                  {ALIQUOTE.map(a => <option key={a} value={a}>{a}%</option>)}
                </select>
                <button onClick={() => rimuoviRiga(i)} style={{ background: 'transparent', border: '1px solid #ff4d6a44', borderRadius: 8, color: '#ff4d6a', padding: '8px 10px', cursor: 'pointer' }}>🗑️</button>
              </div>
            ))}
          </div>
          <button onClick={aggiungiRiga} style={{ marginTop: 8, background: 'transparent', border: '1px dashed #252830', borderRadius: 10, color: '#00e5a0', padding: '8px 14px', cursor: 'pointer' }}>+ Aggiungi riga</button>
        </div>

        {/* Totali */}
        <div style={{ background: '#111318', border: '1px solid #1a1c24', borderRadius: 12, padding: 16, marginLeft: 'auto', width: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#eef0f6aa' }}><span>Imponibile</span><span>€ {fmt(tot.imponibile)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#eef0f6aa', marginTop: 4 }}><span>IVA</span><span>€ {fmt(tot.iva)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid #252830' }}><span>Totale</span><span>€ {fmt(tot.totale)}</span></div>
        </div>
      </div>

      {showMetodo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,12,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: 20 }}>
          <div style={{ background: '#111318', border: '1px solid #252830', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>💳 Metodo di pagamento</div>
            <div style={{ fontSize: '0.82rem', color: '#5a5d6e' }}>Come è stata pagata questa fattura?</div>
            {[
              { v: 'carta', l: '💳 Carta (MP08)' },
              { v: 'contanti', l: '💵 Contanti (MP01)' },
              { v: 'bonifico', l: '🏦 Bonifico (MP05)' },
              { v: 'nonriscosso', l: '🕒 Non riscosso' },
            ].map(m => (
              <button key={m.v} onClick={() => salvaConMetodo(m.v)} disabled={salvando}
                style={{ padding: 14, borderRadius: 12, border: '1px solid #252830', background: '#1a1c24', color: '#eef0f6', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                {m.l}
              </button>
            ))}
            <button onClick={() => setShowMetodo(false)} style={{ padding: 10, borderRadius: 10, background: 'transparent', border: '1px solid #252830', color: '#5a5d6e', cursor: 'pointer', marginTop: 4 }}>Annulla</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#1a1c24', border: '1px solid #00e5a0', borderRadius: 10, padding: '10px 20px', color: '#00e5a0', zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  )
}