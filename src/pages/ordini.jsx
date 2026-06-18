import { useState, useEffect, useRef, useCallback  } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getTavoliDb, salvaTavoloDb, getRepartiDb, getImpostazioniDb } from '@/lib/supabase-db'
import { stampaComanda } from '@/lib/stampante'
import { useNegozioId } from '@/hooks/useNegozioId'
import { supabase } from '@/lib/supabase'
import InstallPWAButton from '@/components/InstallPWAButton'

const ICONE = {
  coffee:'☕', beer:'🍺', wine:'🍷', cocktail:'🍹', pizza:'🍕',
  sandwich:'🥪', icecream:'🍦', candy:'🍬', croissant:'🥐',
  apple:'🍎', salad:'🥗', meat:'🥩', gift:'🎁', star:'⭐',
  bread:'🍞', diamond:'💎'
}

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function tempoTrascorso(iso) {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return diff + 's'
  if (diff < 3600) return Math.floor(diff / 60) + 'm'
  return Math.floor(diff / 3600) + 'h ' + Math.floor((diff % 3600) / 60) + 'm'
}

export default function OrdiniPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tavoli, setTavoli] = useState([])
  const [reparti, setReparti] = useState([])
  const [impostazioni, setImpostazioni] = useState({ copertoAbilitato: false, copertoImporto: 200, numeroTavoli: 10 })
  const [vista, setVista] = useState('griglia')
  const [tavoloAttivo, setTavoloAttivo] = useState(null)
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [righeComanda, setRigheComanda] = useState([])
  const [notaModal, setNotaModal] = useState(null)
  const [notaTesto, setNotaTesto] = useState('')
  const [modalCoperti, setModalCoperti] = useState(null)
  const [numCoperti, setNumCoperti] = useState(2)
  const [invioOk, setInvioOk] = useState(false)
  const [timer, setTimer] = useState(0)

  // 1. PRIMA carica
  const carica = useCallback(async () => {
    if (!NEGOZIO_ID) return
    const [t, imp, r] = await Promise.all([
      getTavoliDb(NEGOZIO_ID),
      getImpostazioniDb(NEGOZIO_ID),
      getRepartiDb(NEGOZIO_ID)
    ])
    const tavMap = Object.fromEntries(t.map(x => [x.numero, x]))
    const tutti = Array.from({ length: imp.numeroTavoli }, (_, i) => {
      const n = i + 1
      return tavMap[n] || { id: null, numero: n, stato: 'libero', coperti: 0, righe: [], ultimoOrdine: null, apertoAlle: null }
    })
    setTavoli(tutti)
    setImpostazioni(imp)
    setReparti(r.filter(r => r.abilitato))
    if (r.length > 0) setRepartoAttivo(prev => prev || r.filter(r => r.abilitato)[0]?.id)
  }, [NEGOZIO_ID])

  // 2. POI gli useEffect
  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    carica()
  }, [user, loading, carica])

  useEffect(() => {
    const interval = setInterval(() => setTimer(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!NEGOZIO_ID) return
    const channel = supabase
      .channel(`tavoli-${NEGOZIO_ID}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tavoli',
        filter: `negozio_id=eq.${NEGOZIO_ID}`
      }, () => { carica() })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [NEGOZIO_ID, carica])

  function apriTavolo(tavolo) {
    if (impostazioni.copertoAbilitato && tavolo.stato === 'libero') {
      setModalCoperti(tavolo.numero)
      return
    }
    setTavoloAttivo(tavolo.numero)
    setRigheComanda([...tavolo.righe])
    setVista('comanda')
  }


function confermaCoperti(numero, coperti) {
    const updated = tavoli.map(t => t.numero === numero ? {...t, coperti} : t)
    setTavoli(updated)
    setModalCoperti(null)
    setTavoloAttivo(numero)
    const tavolo = updated.find(t => t.numero === numero)
    const righe = [...(tavolo.righe || [])]
    if (coperti > 0) {
      righe.unshift({
        id: 'coperto',
        nome: 'Coperto',
        importo: impostazioni.copertoImporto,
        quantita: coperti,
        totaleRiga: impostazioni.copertoImporto * coperti,
        iva: 10,
        colore: '#ffb830',
        icona: 'star',
        repartoId: null,
        nota: '',
      })
    }
    setRigheComanda(righe)
    setVista('comanda')
  }

  function aggiungiProdotto(reparto, prodotto) {
    const importo = prodotto.prezzoFisso
    if (!importo) return
    setRigheComanda(prev => {
      const existing = prev.find(r => r.nome === prodotto.nome && r.importo === importo && !r.nota)
      if (existing) {
        return prev.map(r => r.id === existing.id
          ? { ...r, quantita: r.quantita + 1, totaleRiga: r.importo * (r.quantita + 1) }
          : r)
      }
      return [...prev, {
        id: Date.now() + Math.random(),
        nome: prodotto.nome,
        importo,
        quantita: 1,
        totaleRiga: importo,
        iva: prodotto.ivaOverride || reparto.iva,
        colore: reparto.colore,
        icona: reparto.icona,
        repartoId: reparto.id,
        nota: '',
      }]
    })
  }

  function eliminaRiga(id) {
    setRigheComanda(prev => prev.filter(r => r.id !== id))
  }

  function aggiornaQuantita(id, delta) {
    setRigheComanda(prev => prev
      .map(r => r.id === id ? { ...r, quantita: Math.max(0, r.quantita + delta), totaleRiga: r.importo * Math.max(0, r.quantita + delta) } : r)
      .filter(r => r.quantita > 0)
    )
  }

  function salvaNota(id, nota) {
    setRigheComanda(prev => prev.map(r => r.id === id ? {...r, nota} : r))
    setNotaModal(null)
    setNotaTesto('')
  }

  const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)
  const repAttivo = reparti.find(r => r.id === repartoAttivo)
  const tavoloCorrente = tavoli.find(t => t.numero === tavoloAttivo)

  async function inviaComanda() {
    if (righeComanda.length === 0) return
    const ora = new Date().toISOString()

    // Calcola solo le nuove righe
    const righeVecchie = tavoloCorrente?.righe || []
    const righeNuove = righeComanda.filter(r => {
      const vecchia = righeVecchie.find(v => v.id === r.id)
      if (!vecchia) return true
      if (r.id === 'coperto') return false
      return r.quantita > vecchia.quantita
    }).map(r => {
      const vecchia = righeVecchie.find(v => v.id === r.id)
      if (!vecchia) return r
      const diff = r.quantita - vecchia.quantita
      return { ...r, quantita: diff, totaleRiga: r.importo * diff }
    })

    await salvaTavoloDb(NEGOZIO_ID, {
      numero: tavoloAttivo,
      stato: 'occupato',
      coperti: tavoloCorrente?.coperti || 0,
      righe: righeComanda,
      ultimoOrdine: ora,
      apertoAlle: tavoloCorrente?.apertoAlle || ora,
    })

    // Stampa comanda
    if (righeNuove.length > 0) {
      await stampaComanda(tavoloAttivo, righeNuove, 'comanda', reparti)
    }

    setInvioOk(true)
    setTimeout(() => {
      setInvioOk(false)
      setVista('griglia')
      setTavoloAttivo(null)
      carica()
    }, 1500)
  }

  // ── MODAL NOTA ───────────────────────────────────────────────────────────
  if (notaModal !== null) {
    const riga = righeComanda.find(r => r.id === notaModal)
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:20 }}>
        <div style={{ background:'#111318', border:'1px solid #252830', borderRadius:20, padding:24, width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ fontSize:'0.9rem', fontWeight:700, color:'#eef0f6' }}>✏️ Nota per: {riga?.nome}</div>
          <textarea
            autoFocus
            value={notaTesto}
            onChange={e => setNotaTesto(e.target.value)}
            placeholder="es. senza mozzarella, ben cotto..."
            rows={3}
            style={{ background:'#1a1c24', border:'1px solid #252830', borderRadius:10, padding:12, color:'#eef0f6', fontSize:'0.9rem', resize:'none', fontFamily:"'DM Sans',sans-serif" }}
          />
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => { setNotaModal(null); setNotaTesto('') }}
              style={{ flex:1, padding:12, borderRadius:10, background:'transparent', border:'1px solid #252830', color:'#eef0f6', cursor:'pointer', fontSize:'0.85rem' }}>
              Annulla
            </button>
            <button onClick={() => salvaNota(notaModal, notaTesto)}
              style={{ flex:1, padding:12, borderRadius:10, background:'#00e5a0', border:'none', color:'#08090c', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
              Salva nota
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── MODAL COPERTI ────────────────────────────────────────────────────────
  if (modalCoperti !== null) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:20 }}>
        <div style={{ background:'#111318', border:'1px solid #252830', borderRadius:20, padding:32, width:'100%', maxWidth:320, display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>
          <div style={{ fontSize:'1.2rem', fontWeight:700, color:'#ffb830' }}>🍽️ Tavolo {modalCoperti}</div>
          <div style={{ fontSize:'1rem', color:'#ffb830' }}>Quante persone al tavolo?</div>
          <div style={{ display:'flex', alignItems:'center', gap:24 }}>
            <button onClick={() => setNumCoperti(n => Math.max(1, n-1))}
              style={{ width:52, height:52, borderRadius:14, background:'#1a1c24', border:'1px solid #252830', color:'#eef0f6', fontSize:'1.8rem', cursor:'pointer' }}>−</button>
            <span style={{ fontSize:'3.5rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace", minWidth:60, textAlign:'center' }}>{numCoperti}</span>
            <button onClick={() => setNumCoperti(n => n+1)}
              style={{ width:52, height:52, borderRadius:14, background:'#1a1c24', border:'1px solid #252830', color:'#eef0f6', fontSize:'1.8rem', cursor:'pointer' }}>+</button>
          </div>
            {/* COSTO COMANDA COPERTO
          <div style={{ fontSize:'0.78rem', color:'#ffb830' }}>
            Coperto: € {((impostazioni.copertoImporto * numCoperti) / 100).toFixed(2)} totale
          </div>
        */}
          <div style={{ display:'flex', gap:12, width:'100%' }}>
            <button onClick={() => setModalCoperti(null)}
              style={{ flex:1, padding:14, borderRadius:12, background:'transparent', border:'1px solid #252830', color:'#eef0f6', cursor:'pointer' }}>Annulla</button>
            <button onClick={() => confermaCoperti(modalCoperti, numCoperti)}
              style={{ flex:1, padding:14, borderRadius:12, background:'#00e5a0', border:'none', color:'#08090c', fontWeight:700, cursor:'pointer' }}>Apri tavolo</button>
          </div>
        </div>
      </div>
    )
  }

  // ── VISTA COMANDA ────────────────────────────────────────────────────────
  if (vista === 'comanda') {
    return (
      <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#111318', borderBottom:'1px solid #1a1c24', position:'sticky', top:0, zIndex:100 }}>
          <button onClick={() => { setVista('griglia'); carica() }}
            style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#00ffb3', padding:'8px 14px', cursor:'pointer', fontSize:'0.92rem' }}>
            ← Tavoli
          </button>
          <div style={{ fontWeight:700 }}>🍽️ Tavolo {tavoloAttivo}</div>
          <button onClick={inviaComanda} disabled={righeComanda.length === 0}
            style={{ padding:'8px 16px', borderRadius:10, border:'none', background: righeComanda.length === 0 ? '#1a1c24' : '#00e5a0', color: righeComanda.length === 0 ? '#5a5d6e' : '#08090c', fontWeight:700, cursor: righeComanda.length === 0 ? 'not-allowed' : 'pointer', fontSize:'0.82rem' }}>
            {invioOk ? '✓ Inviato!' : '✓ Invia comanda'}
          </button>
        </div>

        {/* Reparti */}
        <div style={{ display:'flex', gap:8, padding:'10px 16px', overflowX:'auto', background:'#111318', borderBottom:'1px solid #1a1c24' }}>
          {reparti.map(r => (
            <button key={r.id} onClick={() => setRepartoAttivo(r.id)}
              style={{ flexShrink:0, padding:'6px 14px', borderRadius:20, border:'1px solid ' + (repartoAttivo === r.id ? r.colore : '#252830'), background: repartoAttivo === r.id ? r.colore + '22' : 'transparent', color: repartoAttivo === r.id ? r.colore : '#ffb830', fontSize:'0.78rem', cursor:'pointer', whiteSpace:'nowrap' }}>
              {ICONE[r.icona]||'📦'} {r.nome}
            </button>
          ))}
        </div>

        {/* Prodotti */}
        {repAttivo && (
          <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px,1fr))', gap:8 }}>
            {repAttivo.sottoreparti?.filter(s => s.abilitato).map(sr => (
              <button key={sr.id} onClick={() => aggiungiProdotto(repAttivo, sr)}
                style={{ padding:'12px 8px', background:'#111318', border:'1px solid ' + repAttivo.colore + '44', borderRadius:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, active:{transform:'scale(0.95)'} }}>
                <div style={{ fontSize:'0.78rem', color:'#eef0f6', fontWeight:500, textAlign:'center', lineHeight:1.2 }}>{sr.nome}</div>

              </button>
            ))}
          </div>
        )}

        {/* Scontrino in corso */}
        {righeComanda.length > 0 && (
          <div style={{ marginTop:'auto', background:'#111318', borderTop:'1px solid #1a1c24', padding:'12px 16px', maxHeight:'40vh', overflowY:'auto' }}>
            <div style={{ fontSize:'0.65rem', color:'#5a5d6e', letterSpacing:2, marginBottom:8 }}>COMANDA</div>
            {righeComanda.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #1a1c2440' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.85rem', display:'flex', alignItems:'center', gap:6 }}>
                    {r.nome}
                    {r.quantita > 1 && <span style={{ color:'#ffffff', fontSize:'0.85rem', fontWeight:600 }}>×{r.quantita}</span>}
                    <button onClick={() => { setNotaModal(r.id); setNotaTesto(r.nota || '') }}
                      style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:'0.8rem', color: r.nota ? '#ffb830' : '#5a5d6e', padding:'0 4px' }}
                      title="Aggiungi nota">
                      ✏️
                    </button>
                  </div>
                  {r.nota && <div style={{ fontSize:'0.7rem', color:'#ffb830', marginTop:2 }}>📝 {r.nota}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => aggiornaQuantita(r.id, -1)}
                    style={{ width:24, height:24, borderRadius:6, background:'#252830', border:'none', color:'#eef0f6', cursor:'pointer', fontSize:'0.9rem' }}>−</button>
                  <button onClick={() => aggiornaQuantita(r.id, 1)}
                    style={{ width:24, height:24, borderRadius:6, background:'#252830', border:'none', color:'#eef0f6', cursor:'pointer', fontSize:'0.9rem' }}>+</button>

                  {r.id !== 'coperto' && <button onClick={() => eliminaRiga(r.id)}
                    style={{ background:'transparent', border:'none', color:'#ffffff', cursor:'pointer', fontSize:'1rem' }}>✕</button>}
                </div>
              </div>
            ))}

          </div>
        )}
      </div>
    )
  }

  // ── VISTA GRIGLIA TAVOLI ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans',sans-serif" }}>

      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#111318', borderBottom:'1px solid #1a1c24', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>🍽️ Tavoli</div>
        <div style={{ fontSize:'0.75rem', color:'#ffb830' }}>{user?.name}</div>
        <button onClick={carica}
          style={{ background:'transparent', border:'1px solid #252830', borderRadius:10, color:'#ffb830', padding:'8px 14px', cursor:'pointer', fontSize:'0.82rem' }}>
          ↻ Aggiorna
        </button>
      </header>





      <div style={{ padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px,1fr))', gap:12 }}>
        {tavoli.map(t => {
          const occupato = t.stato === 'occupato'
          const tempo = t.ultimoOrdine ? tempoTrascorso(t.ultimoOrdine) : null
          const totTavolo = t.righe?.reduce((s, r) => s + r.totaleRiga, 0) || 0
          return (
            <button key={t.numero} onClick={() => apriTavolo(t)}
              style={{
                padding:16, borderRadius:16, cursor:'pointer', textAlign:'left',
                background: occupato ? 'rgba(255,77,106,0.1)' : 'rgba(0,229,160,0.05)',
                border:'2px solid ' + (occupato ? '#ff4d6a' : '#00e5a044'),
                display:'flex', flexDirection:'column', gap:6,
              }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.7rem', color:'#ffb830', letterSpacing:2 }}>N° TAVOLO</span>
                <div style={{ width:8, height:8, borderRadius:'50%', background: occupato ? '#ff4d6a' : '#00e5a0', boxShadow:'0 0 6px ' + (occupato ? '#ff4d6a' : '#00e5a0') }} />
              </div>
              <div style={{ fontSize:'2.2rem', fontWeight:700, color: occupato ? '#ff4d6a' : '#00e5a0', lineHeight:1 }}>{t.numero}</div>
              {occupato ? (
                <>
                  {/* VISUALIZZA IL TOTALE
                  <div style={{ fontSize:'0.95rem', fontWeight:600, color:'#eef0f6', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totTavolo)}</div>
                  */}
                  {tempo && <div style={{ fontSize:'0.92rem', color:'#ffb830' }}>Occupato ⏱ {tempo}</div>}
                </>
              ) : (
                <div style={{ fontSize:'1rem', color:'#ffb830' }}>Libero</div>
              )}
            </button>
            
          )
        })}
         <InstallPWAButton />
        <>

</>
      </div>
     
    </div>
  )
}
