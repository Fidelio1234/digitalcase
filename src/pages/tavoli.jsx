import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getTavoliDb, salvaTavoloDb, chiudiTavoloDb, getImpostazioniDb, getRepartiDb } from '@/lib/supabase-db'
import { stampaComanda } from '@/lib/stampante'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'
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

export default function TavoliPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tavoli, setTavoli] = useState([])
  const [impostazioni, setImpostazioni] = useState({ copertoAbilitato: false, copertoImporto: 200, numeroTavoli: 10 })
  const [reparti, setReparti] = useState([])
  const [tavoloAttivo, setTavoloAttivo] = useState(null) // numero tavolo
  const [vista, setVista] = useState('griglia') // griglia | comanda | conferma
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [righeComanda, setRigheComanda] = useState([])
  const [inputCents, setInputCents] = useState(0)
  const [timer, setTimer] = useState(0)
  const [modalCoperti, setModalCoperti] = useState(null) // numero tavolo
  const [numCoperti, setNumCoperti] = useState(2)
  const [modalElimina, setModalElimina] = useState(null) // numero tavolo
  const [pinElimina, setPinElimina] = useState('')
  const [pinErrore, setPinErrore] = useState(false)
  const longPressTimer = useRef(null)

  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    carica()
  }, [user])

  useEffect(() => {
    const interval = setInterval(() => setTimer(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  async function carica() {
    const [t, imp, r] = await Promise.all([
      getTavoliDb(NEGOZIO_ID),
      getImpostazioniDb(NEGOZIO_ID),
      getRepartiDb(NEGOZIO_ID)
    ])
    // Crea tavoli mancanti
    const tavMap = Object.fromEntries(t.map(x => [x.numero, x]))
    const tutti = Array.from({ length: imp.numeroTavoli }, (_, i) => {
      const n = i + 1
      return tavMap[n] || { id: null, numero: n, stato: 'libero', coperti: 0, righe: [], ultimoOrdine: null, apertoAlle: null }
    })
    setTavoli(tutti)
    setImpostazioni(imp)
    setReparti(r.filter(r => r.abilitato))
    if (r.length > 0) setRepartoAttivo(r[0].id)
  }

  function startLongPress(tavolo) {
    if (tavolo.stato !== 'occupato') return
    longPressTimer.current = setTimeout(() => {
      setModalElimina(tavolo.numero)
      setPinElimina('')
      setPinErrore(false)
    }, 2000)
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  async function verificaPinEdElimina(pin) {
    const { data: utenti } = await supabase
      .from('utenti')
      .select('pin, ruolo')
      .eq('negozio_id', NEGOZIO_ID)
      .eq('ruolo', 'owner')
      .single()

    if (!utenti || utenti.pin !== pin) {
      setPinErrore(true)
      setPinElimina('')
      setTimeout(() => setPinErrore(false), 1500)
      return
    }

    await chiudiTavoloDb(NEGOZIO_ID, modalElimina)
    setModalElimina(null)
    setPinElimina('')
    await carica()
  }

  function apriTavolo(tavolo) {
    if (impostazioni.copertoAbilitato && tavolo.stato === 'libero') {
      setModalCoperti(tavolo.numero)
      return
    }
    setTavoloAttivo(tavolo.numero)
    setRigheComanda([...tavolo.righe])
    setVista('comanda')
    setInputCents(0)
  }

  function confermaCoperti(numero, coperti) {
    const updated = tavoli.map(t => t.numero === numero ? {...t, coperti} : t)
    setTavoli(updated)
    setModalCoperti(null)
    setTavoloAttivo(numero)
    const tavolo = updated.find(t => t.numero === numero)
    const righe = [...(tavolo.righe || [])]
    // Aggiunge coperto come prima riga se non già presente
    const hasCoperto = righe.some(r => r.id === 'coperto')
    if (coperti > 0 && !hasCoperto) {
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
      })
    }
    setRigheComanda(righe)
    setVista('comanda')
    setInputCents(0)
  }

  function pressDigit(n) {
    setInputCents(prev => {
      const s = String(prev) + String(n)
      return parseInt(s.slice(-8))
    })
  }

  function pressClear() { setInputCents(0) }

  function aggiungiProdotto(reparto, prodotto) {
    const importo = prodotto.prezzoFisso || inputCents
    if (!importo) return
    const riga = {
      id: Date.now() + Math.random(),
      nome: prodotto.nome,
      importo,
      quantita: 1,
      totaleRiga: importo,
      iva: prodotto.ivaOverride || reparto.iva,
      colore: reparto.colore,
      icona: reparto.icona,
      repartoId: reparto.id,
    }
    setRigheComanda(prev => {
      const existing = prev.find(r => r.nome === riga.nome && r.importo === riga.importo)
      if (existing) {
        return prev.map(r => r.id === existing.id
          ? { ...r, quantita: r.quantita + 1, totaleRiga: r.importo * (r.quantita + 1) }
          : r)
      }
      return [...prev, riga]
    })
    setInputCents(0)
  }

  function aggiungiReparto(reparto) {
    if (!inputCents) return
    const riga = {
      id: Date.now() + Math.random(),
      nome: reparto.nome,
      importo: inputCents,
      quantita: 1,
      totaleRiga: inputCents,
      iva: reparto.iva,
      colore: reparto.colore,
      icona: reparto.icona,
      repartoId: reparto.id,
    }
    setRigheComanda(prev => [...prev, riga])
    setInputCents(0)
  }

  function eliminaRiga(id) {
    setRigheComanda(prev => prev.filter(r => r.id !== id))
  }

  const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)

  async function inviaComanda() {
    const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
    const ora = new Date().toISOString()
    
    // Calcola solo le righe nuove o con quantità aumentata
    const righeVecchie = tavolo.righe || []
    const righeNuove = righeComanda.filter(r => {
      const vecchia = righeVecchie.find(v => v.id === r.id)
      if (!vecchia) return true // riga nuova
      if (r.id === 'coperto') return false // coperto non si ristampa
      return r.quantita > vecchia.quantita // quantità aumentata
    }).map(r => {
      const vecchia = righeVecchie.find(v => v.id === r.id)
      if (!vecchia) return r
      // Stampa solo la differenza di quantità
      const diff = r.quantita - vecchia.quantita
      return { ...r, quantita: diff, totaleRiga: r.importo * diff }
    })

    const aggiornato = {
      ...tavolo,
      numero: tavoloAttivo,
      stato: 'occupato',
      righe: righeComanda,
      ultimoOrdine: ora,
      apertoAlle: tavolo.apertoAlle || ora,
    }
    await salvaTavoloDb(NEGOZIO_ID, aggiornato)

    // Stampa comanda solo con le nuove righe
    if (righeNuove.length > 0) {
      await stampaComanda(tavoloAttivo, righeNuove, 'comanda', reparti)
    }

    await carica()
    setVista('griglia')
    setTavoloAttivo(null)
  }

  async function stampaPreconto() {
    await stampaComanda(tavoloAttivo, righeComanda, 'preconto', reparti)
  }

  async function chiudiTavolo() {
    const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
    if (!tavolo) return

    // Le righe già includono il coperto se aggiunto in confermaCoperti
    const righeFinali = [...righeComanda]

    // Salva in sessionStorage PRIMA di navigare
    sessionStorage.setItem('tavolo_da_chiudere', JSON.stringify({
      numero: tavoloAttivo,
      righe: righeFinali,
    }))

    // NON chiudiamo il tavolo ora — lo chiuderemo dopo la conferma in cassa
    router.push('/cassa')
  }

  const repAttivo = reparti.find(r => r.id === repartoAttivo)
  const tavoloCorrente = tavoli.find(t => t.numero === tavoloAttivo)

  if (vista === 'comanda') {
    return (
      <div style={{ display:'flex', height:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans', sans-serif" }}>

        {/* SINISTRA — tastiera */}
        <div style={{ width:220, background:'#111318', borderRight:'1px solid #1a1c24', display:'flex', flexDirection:'column', padding:16, gap:8, flexShrink:0 }}>
          <button onClick={() => setVista('griglia')} style={{ background:'transparent', border:'1px solid #252830', borderRadius:10, color:'#ffffff', padding:'8px', cursor:'pointer', fontSize:'0.8rem', marginBottom:8 }}>
            ← Tavoli
          </button>
          <div style={{ textAlign:'center', padding:'12px', background:'#1a1c24', borderRadius:12, marginBottom:8 }}>
            <div style={{ fontSize:'0.65rem', color:'#ffffff', letterSpacing:2 }}>TAVOLO</div>
            <div style={{ fontSize:'2rem', fontWeight:700, color:'#00e5a0' }}>{tavoloAttivo}</div>
            {impostazioni.copertoAbilitato && tavoloCorrente?.coperti > 0 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:8 }}>
                <span style={{ fontSize:'0.7rem', color:'#ffffff' }}>👤 {tavoloCorrente.coperti} coperti</span>
              </div>
            )}
          </div>

          <div style={{ background:'#1a1c24', borderRadius:12, padding:'12px 16px', textAlign:'center', marginBottom:4 }}>
            <div style={{ fontSize:'0.65rem', color:'#ffffff', letterSpacing:2 }}>IMPORTO</div>
            <div style={{ fontSize:'1.8rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace" }}>
              € {fmt(inputCents)}
            </div>
          </div>

          {/* Tastiera */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {[7,8,9,4,5,6,1,2,3].map(n => (
              <button key={n} onClick={() => pressDigit(n)} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>{n}</button>
            ))}
            <button onClick={pressClear} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #ff4d6a44', borderRadius:10, color:'#ff4d6a', fontSize:'0.8rem', cursor:'pointer' }}>C</button>
            <button onClick={() => pressDigit(0)} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>0</button>
            <button onClick={() => setInputCents(prev => parseInt(String(prev) + '00'))} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'0.9rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>00</button>
          </div>

          {/* Bottoni azione */}
          <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:8 }}>
            {totale > 0 && (
              <>
                <button onClick={stampaPreconto} style={{ padding:'12px', background:'#ffb830', border:'none', borderRadius:12, color:'#08090c', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                  🧾 Preconto
                </button>
                <button onClick={chiudiTavolo} style={{ padding:'12px', background:'#ff4d6a', border:'none', borderRadius:12, color:'white', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                  💳 Chiudi tavolo
                </button>
              </>
            )}
            <button onClick={inviaComanda} disabled={righeComanda.length === 0} style={{ padding:'12px', background: righeComanda.length === 0 ? '#1a1c24' : '#00e5a0', border:'none', borderRadius:12, color: righeComanda.length === 0 ? '#5a5d6e' : '#08090c', fontWeight:700, cursor: righeComanda.length === 0 ? 'not-allowed' : 'pointer', fontSize:'0.85rem' }}>
              ✓ Invia comanda
            </button>
          </div>
        </div>

        {/* CENTRO — scontrino + prodotti */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Scontrino in corso */}
          <div style={{ flex:'0 0 50%', borderBottom:'1px solid #1a1c24', overflow:'auto', padding:16 }}>
            <div style={{ fontSize:'0.72rem', color:'#ffffff', letterSpacing:2, marginBottom:12 }}>COMANDA TAVOLO {tavoloAttivo}</div>
            {righeComanda.length === 0 ? (
              <div style={{ textAlign:'center', color:'#ffffff', padding:40 }}>
                <div style={{ fontSize:'2rem' }}>🍽️</div>
                <div>Nessun prodotto</div>
              </div>
            ) : (
              <>
                {righeComanda.map(r => (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1a1c2440' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:r.colore+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>{ICONE[r.icona]||'📦'}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'0.85rem' }}>{r.nome}{r.quantita > 1 ? <span style={{ color:'#ffffff', marginLeft:6 }}>×{r.quantita}</span> : ''}</div>
                      <div style={{ fontSize:'0.7rem', color:'#ffffff' }}>€ {fmt(r.importo)} cad.</div>
                    </div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.85rem', fontWeight:600 }}>€ {fmt(r.totaleRiga)}</div>
                    {r.id !== 'coperto' && <button onClick={() => eliminaRiga(r.id)} style={{ background:'transparent', border:'none', color:'#ff4d6a', cursor:'pointer', fontSize:'1rem' }}>✕</button>}
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', fontWeight:700, fontSize:'0.9rem' }}>
                  <span style={{ color:'#ffffff' }}>TOTALE</span>
                  <span style={{ color:'#00e5a0', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totale)}</span>
                </div>
              </>
            )}
          </div>

          {/* Griglia prodotti */}
          <div style={{ flex:'0 0 50%', overflow:'auto', padding:16 }}>
            {repAttivo && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:8 }}>
                {repAttivo.sottoreparti?.filter(s => s.abilitato).map(sr => (
                  <button key={sr.id}
                    onClick={() => aggiungiProdotto(repAttivo, sr)}
                    style={{ padding:'12px 8px', background:'#111318', border:'1px solid ' + repAttivo.colore + '44', borderRadius:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:'0.78rem', color:'#eef0f6', fontWeight:500 }}>{sr.nome}</div>
                    <div style={{ fontSize:'0.85rem', fontWeight:700, color:repAttivo.colore, fontFamily:"'DM Mono',monospace" }}>€ {fmt(sr.prezzoFisso)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DESTRA — reparti */}
        <div style={{ width:180, background:'#111318', borderLeft:'1px solid #1a1c24', overflow:'auto', padding:12, flexShrink:0 }}>
          <div style={{ fontSize:'0.65rem', color:'#ffffff', letterSpacing:2, marginBottom:12 }}>REPARTI</div>
          {reparti.map(r => (
            <button key={r.id}
              onClick={() => { setRepartoAttivo(r.id); if (inputCents > 0) aggiungiReparto(r) }}
              style={{
                width:'100%', textAlign:'left', padding:'10px 12px', marginBottom:6,
                background: repartoAttivo === r.id ? r.colore + '22' : 'transparent',
                border: '1px solid ' + (repartoAttivo === r.id ? r.colore : 'transparent'),
                borderRadius:10, cursor:'pointer', color:'#eef0f6', fontSize:'0.82rem',
                display:'flex', alignItems:'center', gap:8,
              }}>
              <span>{ICONE[r.icona]||'📦'}</span>
              <span>{r.nome}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // MODAL COPERTI
  if (modalCoperti !== null) {
    return (
      <div style={{
        position:'fixed', inset:0, background:'rgba(8,9,12,0.92)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:500
      }}>
        <div style={{
          background:'#111318', border:'1px solid #252830',
          borderRadius:20, padding:32, width:320,
          display:'flex', flexDirection:'column', gap:20, alignItems:'center'
        }}>
          <div style={{fontSize:'1rem', fontWeight:700}}>🍽️ Tavolo {modalCoperti}</div>
          <div style={{fontSize:'0.82rem', color:'#ffffff'}}>Quante persone al tavolo?</div>
          <div style={{display:'flex', alignItems:'center', gap:20}}>
            <button onClick={() => setNumCoperti(n => Math.max(1, n-1))}
              style={{width:44, height:44, borderRadius:12, background:'#1a1c24', border:'1px solid #252830', color:'#eef0f6', fontSize:'1.5rem', cursor:'pointer'}}>
              −
            </button>
            <span style={{fontSize:'3rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace", minWidth:60, textAlign:'center'}}>
              {numCoperti}
            </span>
            <button onClick={() => setNumCoperti(n => n+1)}
              style={{width:44, height:44, borderRadius:12, background:'#1a1c24', border:'1px solid #252830', color:'#eef0f6', fontSize:'1.5rem', cursor:'pointer'}}>
              +
            </button>
          </div>
          <div style={{fontSize:'0.78rem', color:'#ffffff'}}>
            Coperto: € {((impostazioni.copertoImporto * numCoperti) / 100).toFixed(2)} totale
          </div>
          <div style={{display:'flex', gap:12, width:'100%'}}>
            <button onClick={() => setModalCoperti(null)}
              style={{flex:1, padding:12, borderRadius:12, background:'transparent', border:'1px solid #252830', color:'#eef0f6', cursor:'pointer'}}>
              Annulla
            </button>
            <button onClick={() => confermaCoperti(modalCoperti, numCoperti)}
              style={{flex:1, padding:12, borderRadius:12, background:'#00e5a0', border:'none', color:'#08090c', fontWeight:700, cursor:'pointer'}}>
              Apri tavolo
            </button>
          </div>
        </div>
      </div>
    )
  }

  // MODAL ELIMINA COMANDA
  if (modalElimina !== null) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600 }}>
        <div style={{
          background:'#111318', border:'1px solid #ff4d6a44',
          borderRadius:20, padding:28, width:320,
          display:'flex', flexDirection:'column', gap:16, alignItems:'center'
        }}>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#ff4d6a' }}>🗑️ Elimina Tavolo {modalElimina}</div>
          <div style={{ fontSize:'0.82rem', color:'#ffffff', textAlign:'center' }}>Inserisci il PIN del titolare per eliminare la comanda</div>

          {/* Display PIN */}
          <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width:12, height:12, borderRadius:'50%',
                background: i < pinElimina.length ? (pinErrore ? '#ff4d6a' : '#00e5a0') : '#252830',
                transition:'background 0.2s'
              }} />
            ))}
          </div>

          {pinErrore && <div style={{ fontSize:'0.78rem', color:'#ff4d6a' }}>PIN errato</div>}

          {/* Tastiera */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, width:'100%' }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n}
                onClick={() => { if(pinElimina.length < 4) { const nuovo = pinElimina + n; setPinElimina(nuovo); if(nuovo.length === 4) setTimeout(() => verificaPinEdElimina(nuovo), 100) }}}
                style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>
                {n}
              </button>
            ))}
            <button onClick={() => setModalElimina(null)}
              style={{ padding:'14px', background:'transparent', border:'1px solid #252830', borderRadius:10, color:'#ffffff', fontSize:'0.8rem', cursor:'pointer' }}>
              ✕
            </button>
            <button onClick={() => { if(pinElimina.length < 4) { const nuovo = pinElimina + '0'; setPinElimina(nuovo); if(nuovo.length === 4) setTimeout(() => verificaPinEdElimina(nuovo), 100) }}}
              style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>
              0
            </button>
            <button onClick={() => setPinElimina(p => p.slice(0,-1))}
              style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'0.9rem', cursor:'pointer' }}>
              ⌫
            </button>
          </div>
        </div>
      </div>
    )
  }

  // VISTA GRIGLIA TAVOLI
  return (
    <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans', sans-serif" }}>
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'#111318', borderBottom:'1px solid #1a1c24' }}>
        <button onClick={() => router.replace('/cassa')} style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#ffffff', padding:'8px 16px', cursor:'pointer', fontSize:'0.82rem' }}>
          ← Cassa
        </button>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>🍽️ Tavoli</div>
        <button onClick={carica} style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#ffffff', padding:'8px 16px', cursor:'pointer', fontSize:'0.82rem' }}>
          ↻ Aggiorna
        </button>
      </header>

      <div style={{ padding:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:16 }}>
          {tavoli.map(t => {
            const occupato = t.stato === 'occupato'
            const tempo = t.ultimoOrdine ? tempoTrascorso(t.ultimoOrdine) : null
            const totTavolo = t.righe?.reduce((s, r) => s + r.totaleRiga, 0) || 0
            return (
              <button key={t.numero}
                onClick={() => { cancelLongPress(); apriTavolo(t) }}
                onMouseDown={() => startLongPress(t)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress(t)}
                onTouchEnd={() => { cancelLongPress(); apriTavolo(t) }}
                style={{
                  padding:16, borderRadius:16, cursor:'pointer', textAlign:'left',
                  background: occupato ? 'rgba(255,77,106,0.1)' : 'rgba(0,229,160,0.05)',
                  border: '2px solid ' + (occupato ? '#ff4d6a' : '#00e5a044'),
                  display:'flex', flexDirection:'column', gap:8,
                  transition:'all 0.15s',
                }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'0.65rem', color:'#5a5d6e', letterSpacing:2 }}>TAVOLO</span>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: occupato ? '#ff4d6a' : '#00e5a0', boxShadow: '0 0 8px ' + (occupato ? '#ff4d6a' : '#00e5a0') }} />
                </div>
                <div style={{ fontSize:'2.5rem', fontWeight:700, color: occupato ? '#ff4d6a' : '#00e5a0', lineHeight:1 }}>{t.numero}</div>
                {occupato ? (
                  <>
                    <div style={{ fontSize:'0.78rem', fontWeight:600, color:'#eef0f6', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totTavolo)}</div>
                    <div style={{ fontSize:'0.68rem', color:'#5a5d6e' }}>{t.righe?.length || 0} prodotti</div>
                    {tempo && <div style={{ fontSize:'0.65rem', color:'#ffb830' }}>⏱ {tempo}</div>}
                    {impostazioni.copertoAbilitato && t.coperti > 0 && (
                      <div style={{ fontSize:'0.65rem', color:'#5a5d6e' }}>👤 {t.coperti} coperti</div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize:'0.75rem', color:'#5a5d6e' }}>Libero</div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
