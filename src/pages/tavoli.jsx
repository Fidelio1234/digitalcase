import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getTavoliDb, salvaTavoloDb, chiudiTavoloDb, getImpostazioniDb, getRepartiDb, salvaStoricoTavolo } from '@/lib/supabase-db'
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
  const [tavoloAttivo, setTavoloAttivo] = useState(null)
  const [vista, setVista] = useState('griglia')
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [righeComanda, setRigheComanda] = useState([])
  const [inputCents, setInputCents] = useState(0)
  const [timer, setTimer] = useState(0)
  const [modalCoperti, setModalCoperti] = useState(null)
  const [numCoperti, setNumCoperti] = useState(2)
  const [modalElimina, setModalElimina] = useState(null)
  const [pinElimina, setPinElimina] = useState('')
  const [pinErrore, setPinErrore] = useState(false)
  const [notaModal, setNotaModal] = useState(null)
  const [notaTesto, setNotaTesto] = useState('')
  const [notaTipo, setNotaTipo] = useState('rimozione')
  const [aggiunte, setAggiunte] = useState([]) // voci selezionate dalla lista "aggiunte rapide" (per negozio)
  const longPressTimer = useRef(null)

  // ── carica definita con useCallback per stabilità nelle dipendenze ──────
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
    if (r.length > 0) setRepartoAttivo(prev => prev || r[0].id)
  }, [NEGOZIO_ID])

  // ── caricamento iniziale ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    carica()
  }, [user, loading, carica])

  // ── timer ogni 30s per aggiornare tempi visualizzati ────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTimer(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // ── polling ogni 3 secondi — solo nella vista griglia ───────────────────
  useEffect(() => {
    if (vista !== 'griglia') return
    const interval = setInterval(carica, 3000)
    return () => clearInterval(interval)
  }, [vista, carica])

  // ── funzioni ─────────────────────────────────────────────────────────────


  useEffect(() => {
    if (!NEGOZIO_ID) return
    if (vista !== 'griglia') return
    const interval = setInterval(() => {
      getTavoliDb(NEGOZIO_ID).then(t => {
        setTavoli(prev => {
          const tavMap = Object.fromEntries(t.map(x => [x.numero, x]))
          return prev.map(p => tavMap[p.numero] || p)
        })
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [vista, NEGOZIO_ID])



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

  function salvaNota(id, nota, tipo = 'rimozione', costoAggiunta = 50) {
    setRigheComanda(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx === -1) return prev
      const r = prev[idx]
      const importoBase = r.importoBase ?? r.importo

      function applicaNota(riga) {
        if (tipo === 'aggiunta' && nota) {
          return {
            ...riga,
            nota: `+${nota}`,
            importoBase,
            importo: importoBase + costoAggiunta,
            totaleRiga: (importoBase + costoAggiunta) * riga.quantita,
          }
        }
        return {
          ...riga,
          nota: nota ? `-${nota}` : '',
          importoBase,
          importo: importoBase,
          totaleRiga: importoBase * riga.quantita,
        }
      }

      // Se la riga rappresenta più di un'unità, la nota riguarda solo UNA unità:
      // stacchiamo quella unità in una riga separata con la nota, le restanti
      // restano nella riga originale, invariate.
      if ((r.quantita || 1) > 1) {
        const nuove = [...prev]
        nuove[idx] = { ...r, quantita: r.quantita - 1, totaleRiga: importoBase * (r.quantita - 1) }
        const rigaStaccata = applicaNota({ ...r, id: Date.now() + Math.random(), quantita: 1 })
        nuove.splice(idx + 1, 0, rigaStaccata)
        return nuove
      }

      const nuove = [...prev]
      nuove[idx] = applicaNota(r)
      return nuove
    })
  }

  function eliminaRiga(id) {
    setRigheComanda(prev => prev.filter(r => r.id !== id))
  }

  const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)

  async function inviaComanda() {
    const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
    const ora = new Date().toISOString()

    const righeVecchie = tavolo.righe || []
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

    const aggiornato = {
      ...tavolo,
      numero: tavoloAttivo,
      stato: 'occupato',
      righe: righeComanda,
      ultimoOrdine: ora,
      apertoAlle: tavolo.apertoAlle || ora,
    }
    await salvaTavoloDb(NEGOZIO_ID, aggiornato)

    if (righeNuove.length > 0) {
      await stampaComanda(tavoloAttivo, righeNuove, 'comanda', reparti, NEGOZIO_ID)
    }

    await carica()
    setVista('griglia')
    setTavoloAttivo(null)
  }

  async function stampaPreconto() {
    await stampaComanda(tavoloAttivo, righeComanda, 'preconto', reparti, NEGOZIO_ID)
  }

  async function chiudiTavolo() {
    const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
    if (!tavolo) return
    const righeFinali = [...righeComanda]
    sessionStorage.setItem('tavolo_da_chiudere', JSON.stringify({
      numero: tavoloAttivo,
      righe: righeFinali,
    }))
    router.push('/cassa')
  }

  const repAttivo = reparti.find(r => r.id === repartoAttivo)
  const tavoloCorrente = tavoli.find(t => t.numero === tavoloAttivo)

  // ── VISTA COMANDA ────────────────────────────────────────────────────────
  if (vista === 'comanda') {
    return (
      <div style={{ display:'flex', height:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans', sans-serif" }}>

        {/* SINISTRA — tastiera */}
        <div style={{ width:240, background:'#111318', borderRight:'1px solid #1a1c24', display:'flex', flexDirection:'column', padding:16, gap:8, flexShrink:0 }}>
          <button onClick={() => setVista('griglia')} style={{ background:'transparent', border:'1px solid #252830', borderRadius:10, color:'#00e5a0', padding:'8px', cursor:'pointer', fontSize:'1.2rem', marginBottom:8 }}>
            ← Tavoli
          </button>
          <div style={{ textAlign:'center', padding:'12px', background:'#1a1c24', borderRadius:12, marginBottom:8 }}>
            <div style={{ fontSize:'0.9rem', color:'yellow', letterSpacing:2 }}>TAVOLO</div>
            <div style={{ fontSize:'2rem', fontWeight:700, color:'white' }}>{tavoloAttivo}</div>
            {impostazioni.copertoAbilitato && tavoloCorrente?.coperti > 0 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:8 }}>
                <span style={{ fontSize:'0.7rem', color:'#ffffff' }}>👤 {tavoloCorrente.coperti} coperti</span>
              </div>
            )}
          </div>

          <div style={{ background:'#1a1c24', borderRadius:12, padding:'12px 16px', textAlign:'center', marginBottom:4 }}>
            <div style={{ fontSize:'0.85rem', color:'yellow', letterSpacing:2 }}>IMPORTO</div>
            <div style={{ fontSize:'1.8rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace" }}>
              € {fmt(inputCents)}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {[7,8,9,4,5,6,1,2,3].map(n => (
              <button key={n} onClick={() => pressDigit(n)} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>{n}</button>
            ))}
            <button onClick={pressClear} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #ff4d6a44', borderRadius:10, color:'#ff4d6a', fontSize:'0.8rem', cursor:'pointer' }}>C</button>
            <button onClick={() => pressDigit(0)} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>0</button>
            <button onClick={() => setInputCents(prev => parseInt(String(prev) + '00'))} style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'0.9rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>00</button>
          </div>

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
                      <div style={{ fontSize:'1rem' }}>{r.nome}{r.quantita > 1 ? <span style={{ color:'red', marginLeft:6 }}>×{r.quantita}</span> : ''}</div>
                      <div style={{ fontSize:'0.7rem', color:'#ffffff' }}>€ {fmt(r.importo)} cad.</div>
                    </div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.85rem', fontWeight:600 }}>€ {fmt(r.totaleRiga)}</div>
                    {r.nota && (
                      <div style={{fontSize:'0.85rem', color: r.nota.startsWith('+') ? 'yellow' : 'red'}}>
                        📝 {r.nota}{r.nota.startsWith('+') && r.importoBase ? ` +€${((r.importo - r.importoBase)/100).toFixed(2).replace('.',',')}` : ''}
                      </div>
                    )}
                    {r.id !== 'coperto' && (
                      <>
                        <button onClick={() => { setNotaModal(r.id); setNotaTesto(r.nota?.replace(/^[+-]/,'') || ''); setNotaTipo(r.nota?.startsWith('+') ? 'aggiunta' : 'rimozione'); setAggiunte([]) }}
                          style={{ background:'transparent', border:'none', cursor:'pointer', color: r.nota ? '#ffb830' : '#5a5d6e', fontSize:'0.9rem', padding:'2px' }}>✏️</button>
                        <button onClick={() => eliminaRiga(r.id)} style={{ background:'transparent', border:'none', color:'#ff4d6a', cursor:'pointer', fontSize:'1rem' }}>✕</button>
                      </>
                    )}
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', fontWeight:700, fontSize:'0.9rem' }}>
                  <span style={{ color:'#ffffff' }}>TOTALE</span>
                  <span style={{ color:'#00e5a0', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totale)}</span>
                </div>
              </>
            )}
          </div>

          <div style={{ flex:'0 0 50%', overflow:'auto', padding:16 }}>
            {repAttivo && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:8 }}>
                {repAttivo.sottoreparti?.filter(s => s.abilitato).map(sr => {
                  const qtaInComanda = righeComanda
                    .filter(r => r.nome === sr.nome && r.importo === sr.prezzoFisso)
                    .reduce((s, r) => s + r.quantita, 0)
                  return (
                    <button key={sr.id}
                      onClick={() => aggiungiProdotto(repAttivo, sr)}
                      style={{ padding:'12px 8px', background:'#111318', border:'1px solid ' + repAttivo.colore + '44', borderRadius:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, position:'relative' }}>
                      {qtaInComanda > 0 && (
                        <div style={{
                          position:'absolute', top:-8, right:-8,
                          background: repAttivo.colore,
                          color:'#08090c',
                          borderRadius:'50%',
                          width:22, height:22,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:'0.72rem', fontWeight:700,
                          fontFamily:"'DM Mono',monospace",
                          boxShadow:`0 0 8px ${repAttivo.colore}88`,
                          zIndex:1,
                        }}>
                          {qtaInComanda}
                        </div>
                      )}
                      <div style={{ fontSize:'0.78rem', color:'#eef0f6', fontWeight:500 }}>{sr.nome}</div>
                      <div style={{ fontSize:'0.85rem', fontWeight:700, color:repAttivo.colore, fontFamily:"'DM Mono',monospace" }}>€ {fmt(sr.prezzoFisso)}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>




        </div>






        {/* DESTRA — reparti */}
        <div style={{ width:180, background:'#111318', borderLeft:'1px solid #1a1c24', overflow:'auto', padding:12, flexShrink:0 }}>
          <div style={{ fontSize:'0.9rem', color:'#00e5a0', letterSpacing:2, marginBottom:12 }}>REPARTI</div>
          {reparti.map(r => {
            const qtaReparto = righeComanda
              .filter(riga => riga.repartoId === r.id)
              .reduce((s, riga) => s + riga.quantita, 0)
            return (
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
                {qtaReparto > 0 && (
                  <span style={{
                    marginLeft:'auto',
                    background: r.colore,
                    color:'#08090c',
                    borderRadius:'50%',
                    width:20, height:20,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.68rem', fontWeight:700,
                    fontFamily:"'DM Mono',monospace",
                    flexShrink:0,
                  }}>
                    {qtaReparto}
                  </span>
                )}
              </button>
            )
          })}
        </div>



        {/* MODAL NOTA - inline nella vista comanda */}
        {notaModal !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:20 }}>
        <div style={{ background:'#111318', border:'1px solid #252830', borderRadius:20, padding:24, width:'100%', maxWidth:360, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ fontSize:'0.9rem', fontWeight:700, color:'#eef0f6' }}>✏️ Variante per: {righeComanda.find(r => r.id === notaModal)?.nome}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setNotaTipo('rimozione')}
              style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='rimozione' ? '#ff4d6a' : '#252830'}`,
                background: notaTipo==='rimozione' ? 'rgba(255,77,106,0.15)' : 'transparent',
                color: notaTipo==='rimozione' ? '#ff4d6a' : '#5a5d6e', cursor:'pointer', fontWeight:700 }}>
              − Rimozione
            </button>
                <button onClick={() => setNotaTipo('aggiunta')}
                  style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='aggiunta' ? '#00e5a0' : '#252830'}`,
                    background: notaTipo==='aggiunta' ? 'rgba(0,229,160,0.15)' : 'transparent',
                    color: notaTipo==='aggiunta' ? '#00e5a0' : '#5a5d6e', cursor:'pointer', fontWeight:700 }}>
                  + Aggiunta
                </button>
              </div>
              {notaTipo === 'aggiunta' && impostazioni.aggiunteRapide?.length > 0 && (() => {
                const gruppiMap = {}
                for (const a of impostazioni.aggiunteRapide) {
                  if (!gruppiMap[a.costo]) gruppiMap[a.costo] = new Set()
                  gruppiMap[a.costo].add(a.nome)
                }
                const tiers = Object.entries(gruppiMap).map(([costo, s]) => ({ costo: parseInt(costo), items: [...s] })).sort((a,b) => a.costo - b.costo)
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ fontSize:'0.8rem', color:'#00ffb3', letterSpacing:1 }}>AGGIUNTE RAPIDE</div>
                    {tiers.map(({ costo, items }) => (
                      <div key={costo}>
                        <div style={{ fontSize:'0.82rem', color:'#ffb830', marginBottom:4 }}>€ {(costo/100).toFixed(2).replace('.',',')}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                          {items.map(item => {
                            const selected = aggiunte.some(a => a.nome === item && a.costo === costo)
                            return (
                              <button key={`${costo}-${item}`}
                                onClick={() => setAggiunte(prev => {
                                  const esiste = prev.find(a => a.nome === item)
                                  if (esiste) return prev.filter(a => a.nome !== item)
                                  return [...prev, { nome: item, costo }]
                                })}
                                style={{
                                  padding:'6px 12px', borderRadius:8, fontSize:'0.9rem', cursor:'pointer',
                                  border: `1px solid ${selected ? '#00e5a0' : '#252830'}`,
                                  background: selected ? 'rgba(0,229,160,0.15)' : '#1a1c24',
                                  color: selected ? '#00e5a0' : '#eef0f6',
                                  fontWeight: selected ? 700 : 400,
                                }}>
                                {item}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {aggiunte.length > 0 && (
                      <div style={{ fontSize:'0.75rem', color:'#00e5a0', background:'rgba(0,229,160,0.1)', borderRadius:8, padding:'6px 10px' }}>
                        💰 Totale: +€{(aggiunte.reduce((s,a) => s + a.costo, 0)/100).toFixed(2).replace('.',',')} — {aggiunte.map(a => a.nome).join(', ')}
                      </div>
                    )}
                  </div>
                )
              })()}
              <textarea autoFocus value={notaTesto} onChange={e => setNotaTesto(e.target.value.toUpperCase())}
                placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella...' : 'es. con funghi...'}
                rows={3}
                style={{ background:'#1a1c24', border:'1px solid #252830', borderRadius:10, padding:12, color:'#eef0f6', fontSize:'0.9rem', resize:'none', fontFamily:"'DM Sans',sans-serif" }}
              />
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([]) }}
                  style={{ flex:1, padding:12, borderRadius:10, background:'transparent', border:'1px solid #252830', color:'#eef0f6', cursor:'pointer' }}>
                  Annulla
                </button>
                <button onClick={() => {
                    if (notaTipo === 'aggiunta' && aggiunte.length > 0) {
                      const nomi = aggiunte.map(a => a.nome).join(', ')
                      const testoFinale = notaTesto ? `${nomi} — ${notaTesto}` : nomi
                      salvaNota(notaModal, testoFinale, notaTipo, aggiunte.reduce((s,a) => s + a.costo, 0))
                    } else {
                      salvaNota(notaModal, notaTesto, notaTipo, impostazioni.costoAggiunta ?? 50)
                    }
                    setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([])
                  }}
                  style={{ flex:1, padding:12, borderRadius:10, background:'#00e5a0', border:'none', color:'#08090c', fontWeight:700, cursor:'pointer' }}>
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── MODAL COPERTI ────────────────────────────────────────────────────────
  if (modalCoperti !== null) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
        <div style={{ background:'#111318', border:'1px solid #252830', borderRadius:20, padding:32, width:320, display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>
          <div style={{fontSize:'1rem', fontWeight:700}}>🍽️ Tavolo {modalCoperti}</div>
          <div style={{fontSize:'0.82rem', color:'#ffffff'}}>Quante persone al tavolo?</div>
          <div style={{display:'flex', alignItems:'center', gap:20}}>
            <button onClick={() => setNumCoperti(n => Math.max(1, n-1))}
              style={{width:44, height:44, borderRadius:12, background:'#1a1c24', border:'1px solid #252830', color:'#eef0f6', fontSize:'1.5rem', cursor:'pointer'}}>−</button>
            <span style={{fontSize:'3rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace", minWidth:60, textAlign:'center'}}>{numCoperti}</span>
            <button onClick={() => setNumCoperti(n => n+1)}
              style={{width:44, height:44, borderRadius:12, background:'#1a1c24', border:'1px solid #252830', color:'#eef0f6', fontSize:'1.5rem', cursor:'pointer'}}>+</button>
          </div>
          <div style={{fontSize:'0.78rem', color:'#ffffff'}}>
            Coperto: € {((impostazioni.copertoImporto * numCoperti) / 100).toFixed(2)} totale
          </div>
          <div style={{display:'flex', gap:12, width:'100%'}}>
            <button onClick={() => setModalCoperti(null)}
              style={{flex:1, padding:12, borderRadius:12, background:'transparent', border:'1px solid #252830', color:'#eef0f6', cursor:'pointer'}}>Annulla</button>
            <button onClick={() => confermaCoperti(modalCoperti, numCoperti)}
              style={{flex:1, padding:12, borderRadius:12, background:'#00e5a0', border:'none', color:'#08090c', fontWeight:700, cursor:'pointer'}}>Apri tavolo</button>
          </div>
        </div>
      </div>
    )
  }

  // ── MODAL NOTA ───────────────────────────────────────────────────────────
  if (notaModal !== null) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:20 }}>
        <div style={{ background:'#111318', border:'1px solid #252830', borderRadius:20, padding:24, width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ fontSize:'0.9rem', fontWeight:700, color:'#eef0f6' }}>✏️ Variante per: {righeComanda.find(r => r.id === notaModal)?.nome}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setNotaTipo('rimozione')}
              style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='rimozione' ? '#ff4d6a' : '#252830'}`,
                background: notaTipo==='rimozione' ? 'rgba(255,77,106,0.15)' : 'transparent',
                color: notaTipo==='rimozione' ? '#ff4d6a' : '#5a5d6e', cursor:'pointer', fontWeight:700 }}>
              − Rimozione
            </button>
            <button onClick={() => setNotaTipo('aggiunta')}
              style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='aggiunta' ? '#00e5a0' : '#252830'}`,
                background: notaTipo==='aggiunta' ? 'rgba(0,229,160,0.15)' : 'transparent',
                color: notaTipo==='aggiunta' ? '#00e5a0' : '#5a5d6e', cursor:'pointer', fontWeight:700 }}>
              + Aggiunta
            </button>
          </div>
            {notaTipo === 'aggiunta' && impostazioni.aggiunteRapide?.length > 0 && (() => {
              const gruppiMap = {}
              for (const a of impostazioni.aggiunteRapide) {
                if (!gruppiMap[a.costo]) gruppiMap[a.costo] = new Set()
                gruppiMap[a.costo].add(a.nome)
              }
              const tiers = Object.entries(gruppiMap).map(([costo, s]) => ({ costo: parseInt(costo), items: [...s] })).sort((a,b) => a.costo - b.costo)
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:'0.8rem', color:'#00ffb3', letterSpacing:1 }}>AGGIUNTE RAPIDE</div>
                  {tiers.map(({ costo, items }) => (
                    <div key={costo}>
                      <div style={{ fontSize:'0.82rem', color:'#ffb830', marginBottom:4 }}>€ {(costo/100).toFixed(2).replace('.',',')}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {items.map(item => {
                        const selected = aggiunte.some(a => a.nome === item && a.costo === costo)
                        return (
                          <button key={`${costo}-${item}`}
                            onClick={() => setAggiunte(prev => {
                              const esiste = prev.find(a => a.nome === item)
                              if (esiste) return prev.filter(a => a.nome !== item)
                              return [...prev, { nome: item, costo }]
                            })}
                            style={{
                              padding:'6px 12px', borderRadius:8, fontSize:'0.9rem', cursor:'pointer',
                              border: `1px solid ${selected ? '#00e5a0' : '#252830'}`,
                              background: selected ? 'rgba(0,229,160,0.15)' : '#1a1c24',
                              color: selected ? '#00e5a0' : '#eef0f6',
                              fontWeight: selected ? 700 : 400,
                            }}>
                            {item}
                          </button>
                        )
                        })}
                      </div>
                    </div>
                  ))}
                  {aggiunte.length > 0 && (
                    <div style={{ fontSize:'0.75rem', color:'#00e5a0', background:'rgba(0,229,160,0.1)', borderRadius:8, padding:'6px 10px' }}>
                      💰 Totale: +€{(aggiunte.reduce((s,a) => s + a.costo, 0)/100).toFixed(2).replace('.',',')} — {aggiunte.map(a => a.nome).join(', ')}
                    </div>
                  )}
                </div>
              )
            })()}
          <textarea autoFocus value={notaTesto} onChange={e => setNotaTesto(e.target.value)}
            placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella...' : 'es. con funghi...'}
            rows={3}
            style={{ background:'#1a1c24', border:'1px solid #252830', borderRadius:10, padding:12, color:'#eef0f6', fontSize:'0.9rem', resize:'none', fontFamily:"'DM Sans',sans-serif" }}
          />
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([]) }}
              style={{ flex:1, padding:12, borderRadius:10, background:'transparent', border:'1px solid #252830', color:'#eef0f6', cursor:'pointer' }}>Annulla</button>
            <button onClick={() => {
                if (notaTipo === 'aggiunta' && aggiunte.length > 0) {
                  const nomi = aggiunte.map(a => a.nome).join(', ')
                  const testoFinale = notaTesto ? `${nomi} — ${notaTesto}` : nomi
                  salvaNota(notaModal, testoFinale, notaTipo, aggiunte.reduce((s,a) => s + a.costo, 0))
                } else {
                  salvaNota(notaModal, notaTesto, notaTipo, impostazioni.costoAggiunta ?? 50)
                }
                setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([])
              }}
              style={{ flex:1, padding:12, borderRadius:10, background:'#00e5a0', border:'none', color:'#08090c', fontWeight:700, cursor:'pointer' }}>Salva</button>
          </div>
        </div>
      </div>
    )
  }

  // ── MODAL ELIMINA ────────────────────────────────────────────────────────
  if (modalElimina !== null) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(8,9,12,0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600 }}>
        <div style={{ background:'#111318', border:'1px solid #ff4d6a44', borderRadius:20, padding:28, width:320, display:'flex', flexDirection:'column', gap:16, alignItems:'center' }}>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#ff4d6a' }}>🗑️ Elimina Tavolo {modalElimina}</div>
          <div style={{ fontSize:'0.82rem', color:'#ffffff', textAlign:'center' }}>Inserisci il PIN del titolare per eliminare la comanda</div>
          <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
            {[0,1,2,3,4,5,6,7].map(i => (
              <div key={i} style={{
                width:12, height:12, borderRadius:'50%',
                background: i < pinElimina.length ? (pinErrore ? '#ff4d6a' : '#00e5a0') : '#252830',
                transition:'background 0.2s'
              }} />
            ))}
          </div>
          {pinErrore && <div style={{ fontSize:'0.78rem', color:'#ff4d6a' }}>PIN errato</div>}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, width:'100%' }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n}
                onClick={() => { if(pinElimina.length < 8) { const nuovo = pinElimina + n; setPinElimina(nuovo); if(nuovo.length === 8) setTimeout(() => verificaPinEdElimina(nuovo), 100) }}}
                style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>
                {n}
              </button>
            ))}
            <button onClick={() => setModalElimina(null)}
              style={{ padding:'14px', background:'transparent', border:'1px solid #252830', borderRadius:10, color:'#ffffff', fontSize:'0.8rem', cursor:'pointer' }}>✕</button>
            <button onClick={() => { if(pinElimina.length < 8) { const nuovo = pinElimina + '0'; setPinElimina(nuovo); if(nuovo.length === 8) setTimeout(() => verificaPinEdElimina(nuovo), 100) }}}
              style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>0</button>
            <button onClick={() => setPinElimina(p => p.slice(0,-1))}
              style={{ padding:'14px', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, color:'#eef0f6', fontSize:'0.9rem', cursor:'pointer' }}>⌫</button>
          </div>
        </div>
      </div>
    )
  }

  // ── VISTA GRIGLIA TAVOLI ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans', sans-serif" }}>
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'#111318', borderBottom:'1px solid #1a1c24' }}>
        <button onClick={() => router.replace('/cassa')} style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#00ffb3', padding:'8px 16px', cursor:'pointer', fontSize:'0.92rem' }}>
          ← Cassa
        </button>
        <button onClick={() => router.replace('/storico-tavoli')} style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'yellow', padding:'8px 16px', cursor:'pointer', fontSize:'0.92rem' }}>
          📋 Storico
        </button>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>🍽️ Tavoli</div>
        <button onClick={carica} style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#ffb830', padding:'8px 16px', cursor:'pointer', fontSize:'0.82rem' }}>
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
                  <span style={{ fontSize:'0.95rem', color:'#00ffb3', letterSpacing:2 }}>TAVOLO</span>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: occupato ? '#ff4d6a' : '#00e5a0', boxShadow: '0 0 8px ' + (occupato ? '#ff4d6a' : '#00e5a0') }} />
                </div>
                <div style={{ fontSize:'2.5rem', fontWeight:700, color: occupato ? '#ff4d6a' : '#00e5a0', lineHeight:1 }}>{t.numero}</div>
                {occupato ? (
                  <>
                    <div style={{ fontSize:'0.98rem', fontWeight:600, color:'#eef0f6', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totTavolo)}</div>
                    <div style={{ fontSize:'0.88rem', color:'#00ffb3' }}>{t.righe?.length || 0} prodotti</div>
                    {tempo && <div style={{ fontSize:'0.95rem', color:'#ffb830' }}>Occupato ⏱ {tempo}</div>}
                    {impostazioni.copertoAbilitato && t.coperti > 0 && (
                      <div style={{ fontSize:'0.95rem', color:'#00ffb3' }}>👤 {t.coperti} coperti</div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize:'1.3rem', color:'#00ffb3' }}>Libero</div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}