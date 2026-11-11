import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '@/context/AuthContext'
import { getTavoliDb, salvaTavoloDb, getRepartiDb, getImpostazioniDb } from '@/lib/supabase-db'
import { stampaComanda } from '@/lib/stampante'
import { useNegozioId } from '@/hooks/useNegozioId'
import { supabase } from '@/lib/supabase'

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
  const inviandoRef = useRef(false)
  const [tavoli, setTavoli] = useState([])
  const [reparti, setReparti] = useState([])
  const [impostazioni, setImpostazioni] = useState({ copertoAbilitato: false, copertoImporto: 200, numeroTavoli: 10 })
  const [vista, setVista] = useState('griglia')
  const [tavoloAttivo, setTavoloAttivo] = useState(null)
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [righeComanda, setRigheComanda] = useState([])
  const [notaModal, setNotaModal] = useState(null)
  const [notaTesto, setNotaTesto] = useState('')
  const [notaTipo, setNotaTipo] = useState('rimozione') // rimozione | aggiunta
  const [aggiunte, setAggiunte] = useState([]) // voci selezionate dalla lista "aggiunte rapide" (per negozio)
  const [modalCoperti, setModalCoperti] = useState(null)
  const [numCoperti, setNumCoperti] = useState(2)
  const [invioOk, setInvioOk] = useState(false)
  const [timer, setTimer] = useState(0)
  const [showErrore, setShowErrore] = useState(false)
const [erroreMsg, setErroreMsg] = useState('')

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

  useEffect(() => {
    if (loading) return
    if (!user) {
      sessionStorage.setItem('login_redirect', '/ordini')
      router.replace('/login')
      return
    }
    carica()
  }, [user, loading, carica])



  // ── Licenza palmare: il telefono deve essere stato attivato con un codice ──
  const [palmare, setPalmare] = useState('verifica') // 'verifica' | 'ok' | 'bloccato'
  const [codicePalmare, setCodicePalmare] = useState('')
  const [nomePalmare, setNomePalmare] = useState('')
  const [erroreAttivazione, setErroreAttivazione] = useState('')
  const [attivando, setAttivando] = useState(false)

  // true = può lavorare. Blocca SOLO sulla risposta esplicita 403:
  // un errore di rete o del server non ferma il servizio.
  const palmareOk = useCallback(async () => {
    try {
      const res = await fetch('/api/palmare-verifica', {
        method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(8000),
      })
      if (res.status === 403) { setPalmare('bloccato'); return false }
      setPalmare('ok')
      return true
    } catch {
      setPalmare(p => (p === 'verifica' ? 'ok' : p))
      return true
    }
  }, [])

  useEffect(() => {
    if (loading || !user) return
    palmareOk()
    const t = setInterval(palmareOk, 60000)
    return () => clearInterval(t)
  }, [user, loading, palmareOk])

  async function attivaPalmare() {
    if (attivando) return
    setAttivando(true)
    setErroreAttivazione('')
    try {
      const res = await fetch('/api/palmare-attiva', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice: codicePalmare, nome: nomePalmare }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setPalmare('ok'); setCodicePalmare('') }
      else setErroreAttivazione(data.error || 'Errore')
    } catch {
      setErroreAttivazione('Errore di rete')
    }
    setAttivando(false)
  }



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
    // Non resettare le righe se il tavolo è già quello attivo
    if (tavoloAttivo !== tavolo.numero) {
      setRigheComanda([])
    }
    setTavoloAttivo(tavolo.numero)
    setVista('comanda')
  }

  function confermaCoperti(numero, coperti) {
    const updated = tavoli.map(t => t.numero === numero ? {...t, coperti} : t)
    setTavoli(updated)
    setModalCoperti(null)
    setTavoloAttivo(numero)
    const righe = []
    if (coperti > 0) {
      righe.push({
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
    setNotaModal(null)
    setNotaTesto('')
    setNotaTipo('rimozione')
    setAggiunte([])
  }







  const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)
  const repAttivo = reparti.find(r => r.id === repartoAttivo)

  const [riepilogoTavolo, setRiepilogoTavolo] = useState(null)
  const longPressTimer = useRef(null)
  const tavoloCorrente = tavoli.find(t => t.numero === tavoloAttivo)













  async function inviaComanda() {
    if (inviandoRef.current || righeComanda.length === 0) return
    inviandoRef.current = true
    try {
      if (!(await palmareOk())) return
      await inviaComandaInterna()
    } finally {
      // Tengo il blocco qualche secondo: un secondo tocco ravvicinato
      // rimanderebbe le stesse righe.
      setTimeout(() => { inviandoRef.current = false }, 3000)
    }
  }
  
   async function inviaComandaInterna() {
  const ora = new Date().toISOString()

  try {
    const righeVecchie = tavoloCorrente?.righe || []

    const righeUnite = righeVecchie.map(r => ({ ...r }))
    for (const nuova of righeComanda) {
      const esistente = righeUnite.find(v =>
        v.nome === nuova.nome && v.importo === nuova.importo && v.nota === nuova.nota
      )
      if (esistente) {
        esistente.quantita += nuova.quantita
        esistente.totaleRiga = esistente.importo * esistente.quantita
      } else {
        righeUnite.push({ ...nuova })
      }
    }

    await salvaTavoloDb(NEGOZIO_ID, {
      numero: tavoloAttivo,
      stato: 'occupato',
      coperti: tavoloCorrente?.coperti || 0,
      righe: righeUnite,
      ultimoOrdine: ora,
      apertoAlle: tavoloCorrente?.apertoAlle || ora,
    })

    if (righeComanda.length > 0) {
      await stampaComanda(tavoloAttivo, righeComanda, 'comanda', reparti, NEGOZIO_ID)
    }

    setInvioOk(true)
    setTimeout(() => {
      setInvioOk(false)
      setRigheComanda([])
      setVista('griglia')
      setTavoloAttivo(null)
      carica()
    }, 2000)

  } catch (e) {
    console.error('Errore invio comanda:', e)
    setErroreMsg(e.message || 'Errore di connessione')
    setShowErrore(true)
  }
}










if (user && palmare === 'verifica') {
  return <div style={{ minHeight:'100vh', background:'#05070d' }} />
}

if (user && palmare === 'bloccato') {
  const campo = { width:'100%', boxSizing:'border-box', background:'var(--dc-border)', border:'none', borderRadius:10, color:'var(--dc-text)', padding:'12px', fontSize:'1rem', marginBottom:10 }
  return (
    <>
      <Head><link rel="manifest" href="/manifest.json" /><link rel="apple-touch-icon" href="/icon-tavoli-192.png" /></Head>
      <div style={{ minHeight:'100vh', background:'#05070d', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ width:'100%', maxWidth:360, background:'#13151c', borderRadius:16, padding:24, color:'var(--dc-text)', textAlign:'center' }}>
          <div style={{ fontSize:'2rem', marginBottom:8 }}>📱</div>
          <div style={{ fontWeight:700, fontSize:'1.1rem', marginBottom:6 }}>Attiva questo palmare</div>
          <div style={{ fontSize:'0.8rem', color:'#8a8d9e', marginBottom:16 }}>
            Chiedi il codice di attivazione all'assistenza e inseriscilo qui.
          </div>
          <input value={nomePalmare} onChange={e => setNomePalmare(e.target.value)} maxLength={40}
            placeholder="Nome del palmare (facoltativo)" style={campo} />
          <input value={codicePalmare}
            onChange={e => setCodicePalmare(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="CODICE" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            style={{ ...campo, textAlign:'center', letterSpacing:'0.25em', fontFamily:'monospace', fontWeight:700 }} />
          {erroreAttivazione && (
            <div style={{ color:'#ff6b6b', fontSize:'0.8rem', marginBottom:10 }}>{erroreAttivazione}</div>
          )}
          <button onClick={attivaPalmare} disabled={attivando || codicePalmare.length !== 8}
            style={{ width:'100%', padding:'13px', border:'none', borderRadius:12, background:'var(--dc-verde)', color:'var(--dc-bg)', fontWeight:700, fontSize:'0.95rem', cursor:'pointer', opacity: (attivando || codicePalmare.length !== 8) ? 0.5 : 1 }}>
            {attivando ? 'Attivazione…' : 'Attiva'}
          </button>
        </div>
      </div>
    </>
  )
}



if (notaModal !== null) {
  const riga = righeComanda.find(r => r.id === notaModal)
  return (
    <>
    <Head><link rel="manifest" href="/manifest.json" /><link rel="apple-touch-icon" href="/icon-tavoli-192.png" /></Head>
    <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:20 }}>






        <div style={{ background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:20, padding:24, width:'100%', maxWidth:360, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--dc-text)' }}>✏️ Variante per: {riga?.nome}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { if (notaTipo !== 'rimozione') setAggiunte([]); setNotaTipo('rimozione') }}
              style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='rimozione' ? 'var(--dc-rosso)' : 'var(--dc-border)'}`,
                background: notaTipo==='rimozione' ? 'rgba(var(--dc-rosso-rgb), 0.15)' : 'transparent',
                color: notaTipo==='rimozione' ? 'var(--dc-rosso)' : 'var(--dc-muted)', cursor:'pointer', fontWeight:700, fontSize:'0.85rem' }}>
              − Rimozione
            </button>
            <button onClick={() => { if (notaTipo !== 'aggiunta') setAggiunte([]); setNotaTipo('aggiunta') }}
              style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='aggiunta' ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
                background: notaTipo==='aggiunta' ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'transparent',
                color: notaTipo==='aggiunta' ? 'var(--dc-verde)' : 'var(--dc-muted)', cursor:'pointer', fontWeight:700, fontSize:'0.85rem' }}>
              + Aggiunta
            </button>
          </div>
          {notaTipo === 'aggiunta' && aggiunte.length === 0 && (
            <div style={{ fontSize:'0.75rem', color:'var(--dc-verde)', background:'rgba(var(--dc-verde-rgb), 0.1)', borderRadius:8, padding:'6px 10px' }}>
              💰 Verrà aggiunto +€{((impostazioni.costoAggiunta ?? 50)/100).toFixed(2).replace('.',',')} al totale
            </div>
          )}
          {notaTipo === 'rimozione' && impostazioni.aggiunteRapide?.length > 0 && (() => {
            const nomiRim = [...new Set(impostazioni.aggiunteRapide.map(a => a.nome))]
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:'0.8rem', color:'var(--dc-rosso)', letterSpacing:1 }}>RIMOZIONI RAPIDE</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {nomiRim.map(item => {
                    const selected = aggiunte.some(a => a.nome === item)
                    return (
                      <button key={item}
                        onClick={() => setAggiunte(prev => prev.some(a => a.nome === item) ? prev.filter(a => a.nome !== item) : [...prev, { nome: item, costo: 0 }])}
                        style={{
                          padding:'6px 12px', borderRadius:8, fontSize:'0.9rem', cursor:'pointer',
                          border: `1px solid ${selected ? 'var(--dc-rosso)' : 'var(--dc-border)'}`,
                          background: selected ? 'rgba(var(--dc-rosso-rgb), 0.15)' : 'var(--dc-surface2)',
                          color: selected ? 'var(--dc-rosso)' : 'var(--dc-text)',
                          fontWeight: selected ? 700 : 400,
                        }}>
                        {item}
                      </button>
                    )
                  })}
                </div>
                {aggiunte.length > 0 && (
                  <div style={{ fontSize:'0.75rem', color:'var(--dc-rosso)', background:'rgba(var(--dc-rosso-rgb), 0.1)', borderRadius:8, padding:'6px 10px' }}>
                    Senza: {aggiunte.map(a => a.nome).join(', ')}
                  </div>
                )}
              </div>
            )
          })()}
          {notaTipo === 'aggiunta' && impostazioni.aggiunteRapide?.length > 0 && (() => {
            const gruppiMap = {}
            for (const a of impostazioni.aggiunteRapide) {
              if (!gruppiMap[a.costo]) gruppiMap[a.costo] = new Set()
              gruppiMap[a.costo].add(a.nome)
            }
            const tiers = Object.entries(gruppiMap).map(([costo, s]) => ({ costo: parseInt(costo), items: [...s] })).sort((a,b) => a.costo - b.costo)
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:'0.8rem', color:'var(--dc-menta)', letterSpacing:1 }}>AGGIUNTE RAPIDE</div>
                {tiers.map(({ costo, items }) => (
                  <div key={costo}>
                    <div style={{ fontSize:'0.82rem', color:'var(--dc-ambra)', marginBottom:4 }}>€ {(costo/100).toFixed(2).replace('.',',')}</div>
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
                              border: `1px solid ${selected ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
                              background: selected ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'var(--dc-surface2)',
                              color: selected ? 'var(--dc-verde)' : 'var(--dc-text)',
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
                  <div style={{ fontSize:'0.75rem', color:'var(--dc-verde)', background:'rgba(var(--dc-verde-rgb), 0.1)', borderRadius:8, padding:'6px 10px' }}>
                    💰 Totale: +€{(aggiunte.reduce((s,a) => s + a.costo, 0)/100).toFixed(2).replace('.',',')} — {aggiunte.map(a => a.nome).join(', ')}
                  </div>
                )}
              </div>
            )
          })()}
          <textarea
            autoFocus
            value={notaTesto}
            onChange={e => setNotaTesto(e.target.value.toUpperCase())}
            placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella, ben cotto...' : 'es. con funghi, doppia porzione...'}
            rows={3}
            style={{ background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', borderRadius:10, padding:12, color:'var(--dc-text)', fontSize:'0.9rem', resize:'none', fontFamily:"'DM Sans',sans-serif" }}
          />
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([]) }}
              style={{ flex:1, padding:12, borderRadius:10, background:'transparent', border:'1px solid var(--dc-border)', color:'var(--dc-text)', cursor:'pointer', fontSize:'0.85rem' }}>
              Annulla
            </button>
            <button onClick={() => {
                if (notaTipo === 'rimozione' && aggiunte.length > 0) {
                  const nomiRim = aggiunte.map(a => `SENZA ${a.nome}`).join(', ')
                  const testoRim = notaTesto ? `${nomiRim} — ${notaTesto}` : nomiRim
                  salvaNota(notaModal, testoRim, notaTipo, 0)
                } else if (notaTipo === 'aggiunta' && aggiunte.length > 0) {
                  const nomi = aggiunte.map(a => a.nome).join(', ')
                  const testoFinale = notaTesto ? `${nomi} — ${notaTesto}` : nomi
                  salvaNota(notaModal, testoFinale, notaTipo, aggiunte.reduce((s,a) => s + a.costo, 0))
                } else {
                  salvaNota(notaModal, notaTesto, notaTipo, impostazioni.costoAggiunta ?? 50)
                }
              }}
              style={{ flex:1, padding:12, borderRadius:10, background:'var(--dc-verde)', border:'none', color:'var(--dc-bg)', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
              Salva
              </button>
          </div>
        </div>
      </div>
      </>
    )
  }


  if (modalCoperti !== null) {
    return (
      <>
      <Head><link rel="manifest" href="/manifest.json" /><link rel="apple-touch-icon" href="/icon-tavoli-192.png" /></Head>
      <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:20 }}>





        <div style={{ background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:20, padding:32, width:'100%', maxWidth:320, display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>
          <div style={{ fontSize:'1.2rem', fontWeight:700, color:'var(--dc-ambra)' }}>🍽️ Tavolo {modalCoperti}</div>
          <div style={{ fontSize:'1rem', color:'var(--dc-ambra)' }}>Quante persone al tavolo?</div>
          <div style={{ display:'flex', alignItems:'center', gap:24 }}>
            <button onClick={() => setNumCoperti(n => Math.max(1, n-1))}
              style={{ width:52, height:52, borderRadius:14, background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', color:'var(--dc-text)', fontSize:'1.8rem', cursor:'pointer' }}>−</button>
            <span style={{ fontSize:'3.5rem', fontWeight:700, color:'var(--dc-verde)', fontFamily:"'DM Mono',monospace", minWidth:60, textAlign:'center' }}>{numCoperti}</span>
            <button onClick={() => setNumCoperti(n => n+1)}
              style={{ width:52, height:52, borderRadius:14, background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', color:'var(--dc-text)', fontSize:'1.8rem', cursor:'pointer' }}>+</button>
          </div>
          <div style={{ display:'flex', gap:12, width:'100%' }}>
            <button onClick={() => setModalCoperti(null)}
              style={{ flex:1, padding:14, borderRadius:12, background:'transparent', border:'1px solid var(--dc-border)', color:'var(--dc-text)', cursor:'pointer' }}>Annulla</button>
            <button onClick={() => confermaCoperti(modalCoperti, numCoperti)}
              style={{ flex:1, padding:14, borderRadius:12, background:'var(--dc-verde)', border:'none', color:'var(--dc-bg)', fontWeight:700, cursor:'pointer' }}>Apri tavolo</button>
         </div>
        </div>
      </div>
      </>
    )
  }

  if (vista === 'comanda') {
    return (
      <>
      <Head><link rel="manifest" href="/manifest.json" /><link rel="apple-touch-icon" href="/icon-tavoli-192.png" /></Head>
      <div style={{ minHeight:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column' }}>



        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--dc-surface)', borderBottom:'1px solid var(--dc-surface2)', position:'sticky', top:0, zIndex:100 }}>
          <button onClick={() => { setVista('griglia'); carica() }}
            style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'var(--dc-menta)', padding:'8px 14px', cursor:'pointer', fontSize:'0.92rem' }}>
            ← Tavoli
          </button>
          <div style={{ fontWeight:700 }}>🍽️ Tavolo {tavoloAttivo}</div>
          <button onClick={inviaComanda} disabled={righeComanda.length === 0}
            style={{ padding:'8px 16px', borderRadius:10, border:'none', background: righeComanda.length === 0 ? 'var(--dc-surface2)' : 'var(--dc-verde)', color: righeComanda.length === 0 ? 'var(--dc-muted)' : 'var(--dc-bg)', fontWeight:700, cursor: righeComanda.length === 0 ? 'not-allowed' : 'pointer', fontSize:'0.82rem' }}>
            {invioOk ? '✓ Inviato!' : '✓ Invia comanda'}
          </button>
        </div>

        <div style={{ display:'flex', gap:8, padding:'10px 16px', overflowX:'auto', background:'var(--dc-surface)', borderBottom:'1px solid var(--dc-surface2)' }}>
          {reparti.map(r => {
            const qtaReparto = righeComanda
              .filter(riga => riga.repartoId === r.id)
              .reduce((s, riga) => s + riga.quantita, 0)
            return (
              <button key={r.id} onClick={() => setRepartoAttivo(r.id)}
                style={{ flexShrink:0, padding:'6px 14px', borderRadius:20, border:'1px solid ' + (repartoAttivo === r.id ? r.colore : '#252830'), background: repartoAttivo === r.id ? r.colore + '22' : 'transparent', color: repartoAttivo === r.id ? r.colore : '#ffb830', fontSize:'0.78rem', cursor:'pointer', whiteSpace:'nowrap', position:'relative' }}>
                {qtaReparto > 0 && (
                  <div style={{
                    position:'absolute', top:-6, right:-6,
                    background: r.colore,
                    color:'var(--dc-bg)',
                    borderRadius:'50%',
                    width:18, height:18,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.62rem', fontWeight:700,
                    fontFamily:"'DM Mono',monospace",
                    boxShadow:`0 0 6px ${r.colore}88`,
                    zIndex:1,
                  }}>
                    {qtaReparto}
                  </div>
                )}
                {ICONE[r.icona]||'📦'} {r.nome}
              </button>
            )
          })}
        </div>




        {repAttivo && (
          <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px,1fr))', gap:8 }}>
            {repAttivo.sottoreparti?.filter(s => s.abilitato).map(sr => {
              const qtaInComanda = righeComanda
                .filter(r => r.nome === sr.nome)
                .reduce((s, r) => s + r.quantita, 0)
              return (
                <button key={sr.id} onClick={() => aggiungiProdotto(repAttivo, sr)}
                  style={{ padding:'12px 8px', background:'#111318', border:'1px solid ' + repAttivo.colore + '44', borderRadius:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, position:'relative', ...(sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine) ? { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundOrigin: 'border-box', minHeight: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textShadow: 'none' } : {}) }}>
                  {qtaInComanda > 0 && (
                    <div style={{
                      position:'absolute', top:-8, right:-8,
                      background: repAttivo.colore,
                      color:'var(--dc-bg)',
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
                  {(sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) && <div style={{ width:'100%', aspectRatio:'1 / 1', flexShrink:0, borderRadius:8, marginBottom:4, backgroundImage:'url("' + sr.immagine + '")', backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat' }} />}
<div style={{ fontSize:'0.78rem', color:'var(--dc-text)', fontWeight:500, textAlign:'center', lineHeight:1.2, ...((sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) ? { fontSize:'0.95rem', fontWeight:700 } : {}) }}>{sr.nome}</div>
                </button>
              )
            })}
          </div>
        )}







        {righeComanda.length > 0 && (
          <div style={{ marginTop:'auto', background:'var(--dc-surface)', borderTop:'1px solid var(--dc-surface2)', padding:'12px 16px', maxHeight:'40vh', overflowY:'auto' }}>
            <div style={{ fontSize:'0.65rem', color:'var(--dc-muted)', letterSpacing:2, marginBottom:8 }}>COMANDA</div>
            {righeComanda.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid rgba(var(--dc-surface2-rgb), 0.25)' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.85rem', display:'flex', alignItems:'center', gap:6 }}>
                    {r.nome}
                    {r.quantita > 1 && <span style={{ color:'#ffffff', fontSize:'0.85rem', fontWeight:600 }}>×{r.quantita}</span>}
                    {r.id !== 'coperto' && (
                      <button onClick={() => { setNotaModal(r.id); setNotaTesto(r.nota?.replace(/^[+-]/, '') || ''); setNotaTipo(r.nota?.startsWith('+') ? 'aggiunta' : 'rimozione'); setAggiunte([]) }}
                        style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:'0.8rem', color: r.nota ? 'var(--dc-ambra)' : 'var(--dc-muted)', padding:'0 4px' }}
                        title="Aggiungi nota">
                        ✏️
                      </button>
                    )}

                  </div>
                  {r.nota && <div style={{ fontSize:'0.7rem', color:'var(--dc-ambra)', marginTop:2 }}>📝 {r.nota}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => aggiornaQuantita(r.id, -1)}
                    style={{ width:24, height:24, borderRadius:6, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', cursor:'pointer', fontSize:'0.9rem' }}>−</button>
                  <button onClick={() => aggiornaQuantita(r.id, 1)}
                    style={{ width:24, height:24, borderRadius:6, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', cursor:'pointer', fontSize:'0.9rem' }}>+</button>
                  {r.id !== 'coperto' && <button onClick={() => eliminaRiga(r.id)}
                    style={{ background:'transparent', border:'none', color:'#ffffff', cursor:'pointer', fontSize:'1rem' }}>✕</button>}
                </div>
              </div>
            ))}
          </div>
          
        )}
        {/* MODAL SUCCESSO */}
{invioOk && (
  <div style={{
    position:'fixed', inset:0, zIndex:9999,
    background:'rgba(var(--dc-bg-rgb), 0.85)',
    display:'flex', alignItems:'center', justifyContent:'center',
  }}>
    <div style={{
      background:'var(--dc-surface)', border:'2px solid var(--dc-verde)',
      borderRadius:24, padding:'40px 56px',
      display:'flex', flexDirection:'column', alignItems:'center', gap:16,
      boxShadow:'0 0 64px rgba(var(--dc-verde-rgb), 0.3)',
      animation:'popIn 0.3s ease',
    }}>
      <div style={{
        width:64, height:64, borderRadius:'50%',
        background:'rgba(var(--dc-verde-rgb), 0.15)', border:'2px solid var(--dc-verde)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--dc-verde)" strokeWidth="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--dc-verde)' }}>Comanda inviata!</div>
    </div>
    <style>{`@keyframes popIn { from { transform:scale(0.7); opacity:0 } to { transform:scale(1); opacity:1 } }`}</style>
  </div>
)}

{/* MODAL ERRORE */}
{showErrore && (
  <div style={{
    position:'fixed', inset:0, zIndex:9999,
    background:'rgba(var(--dc-bg-rgb), 0.9)',
    display:'flex', alignItems:'center', justifyContent:'center',
  }} onClick={() => setShowErrore(false)}>
    <div style={{
      background:'var(--dc-surface)', border:'2px solid var(--dc-rosso)',
      borderRadius:24, padding:'32px 40px',
      display:'flex', flexDirection:'column', alignItems:'center', gap:16,
      maxWidth:320,
    }} onClick={e => e.stopPropagation()}>
      <div style={{
        width:64, height:64, borderRadius:'50%',
        background:'rgba(var(--dc-rosso-rgb), 0.15)', border:'2px solid var(--dc-rosso)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--dc-rosso)" strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
      <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--dc-rosso)', textAlign:'center' }}>
        Errore invio comanda
      </div>
      <div style={{ fontSize:'0.78rem', color:'var(--dc-muted)', textAlign:'center' }}>
        {erroreMsg}
      </div>
      <button onClick={() => setShowErrore(false)}
        style={{ padding:'10px 24px', borderRadius:10, background:'var(--dc-rosso)', border:'none', color:'white', fontWeight:700, cursor:'pointer' }}>
        Riprova
      </button>
    </div>
  </div>
)}
    </div>
      </>
       )
    }
    return (
      <>
      <Head><link rel="manifest" href="/manifest.json" /><link rel="apple-touch-icon" href="/icon-tavoli-192.png" /></Head>
      <div style={{ minHeight:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Sans',sans-serif" }}>
  
        <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--dc-surface)', borderBottom:'1px solid var(--dc-surface2)', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>🍽️ Tavoli</div>
        <div style={{ fontSize:'0.75rem', color:'var(--dc-ambra)' }}>{user?.name}</div>
        <button onClick={carica}
          style={{ background:'transparent', border:'1px solid var(--dc-border)', borderRadius:10, color:'var(--dc-ambra)', padding:'8px 14px', cursor:'pointer', fontSize:'0.82rem' }}>
          ↻ Aggiorna
        </button>
      </header>

      <div style={{ padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px,1fr))', gap:12 }}>
        {tavoli.map(t => {
          const occupato = t.stato === 'occupato'
          const tempo = t.ultimoOrdine ? tempoTrascorso(t.ultimoOrdine) : null
          return (
            <button key={t.numero}
              onClick={() => apriTavolo(t)}
              onMouseDown={() => { if (occupato) longPressTimer.current = setTimeout(() => setRiepilogoTavolo(t), 1000) }}
              onMouseUp={() => clearTimeout(longPressTimer.current)}
              onMouseLeave={() => clearTimeout(longPressTimer.current)}
              onTouchStart={() => { if (occupato) longPressTimer.current = setTimeout(() => setRiepilogoTavolo(t), 1000) }}
              onTouchEnd={() => clearTimeout(longPressTimer.current)}
              style={{
                padding:16, borderRadius:16, cursor:'pointer', textAlign:'left',
                background: occupato ? 'rgba(var(--dc-rosso-rgb), 0.1)' : 'rgba(var(--dc-verde-rgb), 0.05)',
                border:'2px solid ' + (occupato ? 'var(--dc-rosso)' : 'rgba(var(--dc-verde-rgb), 0.27)'),
                display:'flex', flexDirection:'column', gap:6,
              }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.7rem', color:'var(--dc-ambra)', letterSpacing:2 }}>N° TAVOLO</span>
                <div style={{ width:8, height:8, borderRadius:'50%', background: occupato ? 'var(--dc-rosso)' : 'var(--dc-verde)', boxShadow:'0 0 6px ' + (occupato ? 'var(--dc-rosso)' : 'var(--dc-verde)') }} />
              </div>
              <div style={{ fontSize:'2.2rem', fontWeight:700, color: occupato ? 'var(--dc-rosso)' : 'var(--dc-verde)', lineHeight:1 }}>{t.numero}</div>
              {occupato ? (
                tempo && <div style={{ fontSize:'0.92rem', color:'var(--dc-ambra)' }}>Occupato ⏱ {tempo}</div>
              ) : (
                <div style={{ fontSize:'1rem', color:'var(--dc-ambra)' }}>Libero</div>
              )}
            </button>
          )
        })}
      </div>
    </div>

    {/* MODAL RIEPILOGO TAVOLO — long press */}
    {riepilogoTavolo && (
      <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={() => setRiepilogoTavolo(null)}>
        <div style={{ background:'var(--dc-surface)', border:'6px solid white', borderRadius:20, padding:24, width:'100%', maxWidth:360, maxHeight:'80vh', overflowY:'auto' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--dc-text)' }}>🍽️ Tavolo {riepilogoTavolo.numero}</div>
            <button onClick={() => setRiepilogoTavolo(null)}
              style={{ background:'transparent', border:'none', color:'red', fontSize:'1.3rem', cursor:'pointer' }}>✕</button>
          </div>
          {(riepilogoTavolo.righe || []).length === 0 ? (
            <div style={{ color:'var(--dc-muted)', textAlign:'center', padding:'20px 0' }}>Nessun prodotto ordinato</div>
          ) : (
            (riepilogoTavolo.righe || []).map((r, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--dc-surface2)' }}>
                <div>
                  <div style={{ fontSize:'1rem', color:'yellow' }}>{r.nome}</div>
                  {r.nota && <div style={{ fontSize:'0.75rem', color:'var(--dc-ambra)' }}>📝 {r.nota}</div>}
                </div>
                <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--dc-verde)', minWidth:30, textAlign:'right' }}>×{r.quantita}</div>
              </div>
            ))
          )}
        </div>
      </div>
    )}
      </>
    )
  }