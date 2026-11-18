
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { useNegozioId } from '@/hooks/useNegozioId'
import { getRepartiDb, getAsportiDb, nuovoAsportoDb, salvaAsportoDb, chiudiAsportoDb, eliminaAsportoDb, incrementaContatoraAsportoDb } from '@/lib/supabase-db'
import { getImpostazioniDb } from '@/lib/supabase-db'

const ICONE = {
  coffee:'☕', cake:'🍰', food:'🍽️', drink:'🥤', beer:'🍺',
  wine:'🍷', pizza:'🍕', sandwich:'🥪', ice_cream:'🍦', candy:'🍬',
  bread:'🥐', fruit:'🍎', salad:'🥗', fish:'🐟', meat:'🥩',
  shopping:'🛍️', gift:'🎁', star:'⭐', tag:'🏷️', box:'📦',
}

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function fmtOra(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function Timer({ apertoAlle }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(apertoAlle).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [apertoAlle])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  const color = elapsed > 1800 ? 'var(--dc-rosso)' : elapsed > 900 ? 'var(--dc-ambra)' : 'var(--dc-verde)'
  return <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.75rem', color }}>{m}:{String(s).padStart(2,'0')}</span>
}

export default function AsportoPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const NEGOZIO_ID = useNegozioId()

  const [asporti, setAsporti] = useState([])
  const [reparti, setReparti] = useState([])
  const [asportoAttivo, setAsportoAttivo] = useState(null)
  const [righeComanda, setRigheComanda] = useState([])
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [inputCents, setInputCents] = useState(0)
  const [showNuovoAsporto, setShowNuovoAsporto] = useState(false)
  const [nomeCliente, setNomeCliente] = useState('')
  const [showElimina, setShowElimina] = useState(null)
  const [toast, setToast] = useState('')
  const [impostazioni, setImpostazioni] = useState({})
  const longPressTimer = useRef(null)
  const [notaModal, setNotaModal] = useState(null)
  const [notaTesto, setNotaTesto] = useState('')
  const [notaTipo, setNotaTipo] = useState('rimozione')
  const [aggiunte, setAggiunte] = useState([]) // voci scelte dalle "aggiunte rapide"

  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    if (user) {
      carica()
      getImpostazioniDb(NEGOZIO_ID).then(setImpostazioni)
    }
  }, [user, loading])

  async function carica() {
    const [a, r] = await Promise.all([
      getAsportiDb(NEGOZIO_ID),
      getRepartiDb(NEGOZIO_ID)
    ])
    setAsporti(a)
    setReparti(r.filter(r => r.abilitato))
    if (r.length > 0) setRepartoAttivo(r[0].id)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function creaNuovoAsporto() {
    if (!nomeCliente.trim()) return
    const numero = await incrementaContatoraAsportoDb(NEGOZIO_ID)
    const asporto = await nuovoAsportoDb(NEGOZIO_ID, nomeCliente.trim(), numero)
    if (asporto) {
      setAsporti(prev => [...prev, asporto])
      setAsportoAttivo(asporto.id)
      setRigheComanda([])
      setNomeCliente('')
      setShowNuovoAsporto(false)
    }
  }

  function selezionaAsporto(id) {
    if (asportoAttivo === id) return
    if (asportoAttivo && righeComanda.length > 0) {
      salvaAsportoDb(NEGOZIO_ID, asportoAttivo, righeComanda)
    }
    const a = asporti.find(x => x.id === id)
    setAsportoAttivo(id)
    setRigheComanda(a?.righe || [])
    setInputCents(0)
  }

  function aggiungiProdotto(reparto, sr) {
    if (!asportoAttivo) { showToast('⚠ Seleziona o crea un asporto'); return }
    const importo = sr?.prezzoFisso || inputCents
    if (importo <= 0) { showToast('⚠ Inserisci un importo'); return }
    const nome = sr?.nome || reparto.nome
    const iva = sr?.ivaOverride ?? reparto.iva ?? 10

    setRigheComanda(prev => {
      const idx = prev.findIndex(r => r.nome === nome && r.importo === importo)
      if (idx >= 0) {
        const aggiornato = [...prev]
        aggiornato[idx] = { ...aggiornato[idx], quantita: aggiornato[idx].quantita + 1, totaleRiga: (aggiornato[idx].quantita + 1) * importo }
        return aggiornato
      }
      return [...prev, { id: Date.now(), nome, importo, iva, colore: reparto.colore, icona: reparto.icona, repartoId: reparto.id, quantita: 1, totaleRiga: importo }]
    })
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

      // Se la riga rappresenta piu' di un'unita', la nota riguarda solo UNA unita':
      // la stacchiamo in una riga separata con la nota, le altre restano invariate.
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

  async function salvaComanda() {
    if (!asportoAttivo) return
    await salvaAsportoDb(NEGOZIO_ID, asportoAttivo, righeComanda)
    showToast('✓ Comanda salvata')
    carica()
  }

  async function chiudiAsporto() {
    if (!asportoAttivo) return
    await salvaAsportoDb(NEGOZIO_ID, asportoAttivo, righeComanda)
    // Passa alla cassa
    const asporto = asporti.find(a => a.id === asportoAttivo)
    sessionStorage.setItem('asporto_da_chiudere', JSON.stringify({
      id: asportoAttivo,
      nome: asporto?.nome_cliente,
      numero: asporto?.numero,
      righe: righeComanda,
    }))
    router.push('/cassa')
  }

  function preconto() {
    if (!asportoAttivo || righeComanda.length === 0) return
    const asporto = asporti.find(a => a.id === asportoAttivo)
    const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>body{font-family:monospace;padding:20px;max-width:300px}h2{text-align:center}
    .riga{display:flex;justify-content:space-between;margin:4px 0}
    .totale{border-top:2px solid #000;margin-top:8px;padding-top:8px;font-weight:bold;font-size:1.2em}
    .note{text-align:center;margin-top:16px;font-size:0.85em;border-top:1px dashed #000;padding-top:8px}
    </style></head><body>
    <h2>PRECONTO ASPORTO</h2>
    <h3 style="text-align:center">#${asporto?.numero} — ${asporto?.nome_cliente}</h3>
    <p style="text-align:center;font-size:0.8em">${new Date().toLocaleString('it-IT')}</p>
    <hr/>
    ${righeComanda.map(r => `<div class="riga"><span>${r.quantita > 1 ? r.quantita+'x ' : ''}${r.nome}</span><span>€ ${fmt(r.totaleRiga)}</span></div>`).join('')}
    <div class="riga totale"><span>TOTALE</span><span>€ ${fmt(totale)}</span></div>
    <div class="note">RITIRARE LO SCONTRINO ALLA CASSA</div>
    <script>window.print()</script>
    </body></html>`)
    win.document.close()
  }

  async function confermaElimina() {
    if (!showElimina) return
    await eliminaAsportoDb(NEGOZIO_ID, showElimina)
    setAsporti(prev => prev.filter(a => a.id !== showElimina))
    if (asportoAttivo === showElimina) {
      setAsportoAttivo(null)
      setRigheComanda([])
    }
    setShowElimina(null)
    showToast('✓ Asporto eliminato')
  }

  const asportoCorrente = asporti.find(a => a.id === asportoAttivo)
  const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)

  if (loading || !user) return null



  // Numerino sul reparto: unita della comanda in corso con prodotti di quel reparto.
  function contaOrdiniPerReparto(repartoId) {
    // unita della comanda in corso (live, come in Tavoli)
    return righeComanda.filter(r => r.repartoId === repartoId).reduce((t, r) => t + (r.quantita || 0), 0)
  }

  // Numerino sul prodotto: unita della comanda in corso per quel prodotto.
  function contaOrdiniPerProdotto(nomeProdotto) {
    return righeComanda.filter(r => r.nome === nomeProdotto).reduce((t, r) => t + (r.quantita || 0), 0)
  }


  return (
    <div style={{ height:'100vh', overflow:'hidden', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--dc-surface2)' }}>
        <button onClick={() => { if (asportoAttivo) salvaAsportoDb(NEGOZIO_ID, asportoAttivo, righeComanda); router.replace('/cassa') }}
          style={{ background:'transparent', border:'1px solid var(--dc-border)', borderRadius:10, color:'var(--dc-menta)', padding:'12px 19px', cursor:'pointer', fontSize:'1rem' }}>
          ← Cassa
        </button>
        <div style={{ flex:1 ,textAlign:'center'}}>
          <div style={{ fontSize:'1.5rem', fontWeight:700, }}>🛵 Asporto</div>
          <div style={{ fontSize:'1.5rem', color:'var(--dc-ambra)' }}>{asporti.length === 1 ? '1 ordine aperto' : `${asporti.length} ordini aperti`}</div>
        </div>
        <button onClick={() => setShowNuovoAsporto(true)}
          style={{ background:'var(--dc-verde)', border:'none', borderRadius:10, color:'var(--dc-bg)', padding:'10px 20px', cursor:'pointer', fontSize:'0.82rem', fontWeight:700 }}>
          + Nuovo cliente
        </button>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

        {/* Lista asporti sx */}
        <div style={{ width:220, borderRight:'1px solid var(--dc-surface2)', overflowY:'auto', padding:8, minHeight:0 }}>
          {asporti.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--dc-ambra)', padding:20, fontSize:'0.8rem' }}>
              <div style={{ fontSize:'2rem' }}>🛵</div>
              Nessun asporto aperto
            </div>
          )}
          {asporti.map(a => (
            <div key={a.id}
              onClick={() => selezionaAsporto(a.id)}
              onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowElimina(a.id), 1500) }}
              onMouseUp={() => clearTimeout(longPressTimer.current)}
              onMouseLeave={() => clearTimeout(longPressTimer.current)}
              onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowElimina(a.id), 1500) }}
              onTouchEnd={() => clearTimeout(longPressTimer.current)}
              style={{
                padding:'10px 12px', borderRadius:10, marginBottom:6, cursor:'pointer',
                background: asportoAttivo === a.id ? '#1a2a1a' : 'var(--dc-surface)',
                border: `1px solid ${asportoAttivo === a.id ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
              }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--dc-ambra)' }}>#{a.numero}</span>
                <Timer apertoAlle={a.aperto_alle} />
              </div>
              <div style={{ fontWeight:700, fontSize:'1.2rem', marginTop:2 }}>{a.nome_cliente}</div>
              <div style={{ fontSize:'0.9rem', color:'var(--dc-ambra)', marginTop:2 }}>
              {fmtOra(a.aperto_alle)} · {(a.righe || []).length === 1 ? '1 prodotto' : `${(a.righe || []).length} prodotti`}
              </div>
            </div>
          ))}
        </div>

        {/* Centro - comanda */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

          {/* Header asporto attivo */}
          {asportoCorrente ? (
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--dc-surface2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:700 }}>#{asportoCorrente.numero} — {asportoCorrente.nome_cliente}</div>
                <div style={{ fontSize:'0.92rem', color:'var(--dc-ambra)' }}>Chiamato alle {fmtOra(asportoCorrente.aperto_alle)}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={preconto}
                  style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--dc-border)', background:'transparent', color:'var(--dc-ambra)', cursor:'pointer', fontSize:'0.98rem' }}>
                  🖨️ Preconto
                </button>
                <button onClick={salvaComanda}
                  style={{ padding:'8px 12px', borderRadius:8, border:'none', background:'#1a2a1a', color:'var(--dc-verde)', cursor:'pointer', fontSize:'0.98rem' }}>
                  💾 Salva
                </button>
                <button onClick={chiudiAsporto}
                  style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'var(--dc-verde)', color:'var(--dc-bg)', cursor:'pointer', fontSize:'0.92rem', fontWeight:700 }}>
                  Cassa →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding:20, textAlign:'center', color:'var(--dc-ambra)', fontSize:'0.95rem' }}>
              Seleziona un asporto o creane uno nuovo
            </div>
          )}

          {/* Lista righe */}
          <div style={{ flex:1, overflowY:'auto', padding:12, minHeight:0 }}>
            {righeComanda.length === 0 && asportoCorrente && (
              <div style={{ textAlign:'center', color:'var(--dc-ambra)', padding:40, fontSize:'0.85rem' }}>
                <div style={{ fontSize:'2rem' }}>🛵</div>
                Aggiungi prodotti dall'ordine
              </div>
            )}
            {righeComanda.map((r, i) => (
              <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'var(--dc-surface)', borderRadius:10, marginBottom:6, border:'1px solid var(--dc-border)' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:r.colore+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>
                    {ICONE[r.icona]||'📦'}
                  </div>
                  <div>
                    <div style={{ fontSize:'0.85rem', fontWeight:600 }}>{r.nome} {r.quantita > 1 && <span style={{ color:'var(--dc-verde)' }}>×{r.quantita}</span>}</div>
                    {r.nota && (
                      <div style={{fontSize:'0.85rem', color: r.nota.startsWith('+') ? 'var(--dc-giallo)' : 'var(--dc-rosso-vivo)', marginTop:2}}>
                        📝 {r.nota}{r.nota.startsWith('+') && r.importoBase ? ` +€${((r.importo - r.importoBase)/100).toFixed(2).replace('.',',')}` : ''}
                      </div>
                    )}
                    <div style={{ fontSize:'0.72rem', color:'var(--dc-muted)' }}>€ {fmt(r.importo)} cad.</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.9rem' }}>€ {fmt(r.totaleRiga)}</span>
                  <button onClick={() => setRigheComanda(prev => {
                    const idx = prev.findIndex(x => x.id === r.id)
                    if (prev[idx].quantita > 1) {
                      const aggiornato = [...prev]
                      aggiornato[idx] = { ...aggiornato[idx], quantita: aggiornato[idx].quantita - 1, totaleRiga: (aggiornato[idx].quantita - 1) * aggiornato[idx].importo }
                      return aggiornato
                    }
                    return prev.filter(x => x.id !== r.id)
                  })}
                    style={{ background:'transparent', border:'none', color:'var(--dc-rosso)', cursor:'pointer', fontSize:'1rem' }}>×</button>
                  <button onClick={() => { setNotaModal(r.id); setNotaTesto(r.nota?.replace(/^[+-]/, '') || ''); setNotaTipo(r.nota?.startsWith('+') ? 'aggiunta' : 'rimozione'); setAggiunte([]) }}
                    style={{ background:'transparent', border:'none', cursor:'pointer', color: r.nota ? 'var(--dc-ambra)' : 'var(--dc-muted)', fontSize:'0.9rem', padding:'2px' }}>✏️</button>
                </div>
              </div>
            ))}
          </div>

          {/* Totale */}
          {righeComanda.length > 0 && (
            <div style={{ padding:'10px 16px', borderTop:'1px solid var(--dc-surface2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color:'var(--dc-muted)', fontSize:'0.85rem' }}>TOTALE</span>
              <span style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--dc-verde)', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totale)}</span>
            </div>
          )}

          {/* Griglia prodotti */}
          {repartoAttivo && (
            <div style={{ borderTop:'1px solid var(--dc-surface2)', padding:12, overflowY:'auto', maxHeight:220 }}>
              {(() => {
                const rep = reparti.find(r => r.id === repartoAttivo)
                const prodotti = rep?.sottoreparti?.filter(s => s.abilitato) || []
                return (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:8 }}>
                    {prodotti.map(sr => {
                      const conteggio = contaOrdiniPerProdotto(sr.nome)
                      return (
                        <button key={sr.id} onClick={() => aggiungiProdotto(rep, sr)}
                          style={{ padding:'10px 8px', borderRadius:10, border:`1px solid ${rep.colore}66`, background:'var(--dc-surface)', cursor:'pointer', textAlign:'center', position:'relative', ...(sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine) ? { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundOrigin: 'border-box', minHeight: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textShadow: 'none' } : {}) }}>
                          {conteggio > 0 && (
                            <div style={{
                              position:'absolute', top:-8, right:-8,
                              background: rep.colore, color:'var(--dc-bg)',
                              borderRadius:'50%', width:22, height:22,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:'0.72rem', fontWeight:700,
                              fontFamily:"'DM Mono',monospace",
                              boxShadow:`0 0 8px ${rep.colore}88`,
                              zIndex:1,
                            }}>
                              {conteggio}
                            </div>
                          )}
                          {(sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) && <div style={{ width:'100%', aspectRatio:'1 / 1', flexShrink:0, borderRadius:8, marginBottom:4, backgroundImage:'url("' + sr.immagine + '")', backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat' }} />}
<div style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--dc-text)', ...((sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) ? { fontSize:'0.95rem', fontWeight:700 } : {}) }}>{sr.nome}</div>
                          <div style={{ fontSize:'0.75rem', color:rep.colore, marginTop:4, ...((sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) ? { fontSize:'1.05rem', fontWeight:700 } : {}) }}>€ {fmt(sr.prezzoFisso)}</div>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Reparti dx */}
        <div style={{ width:160, borderLeft:'1px solid var(--dc-surface2)', overflowY:'auto', padding:8, minHeight:0 }}>
          <div style={{ fontSize:'1.25rem', color:'var(--dc-ambra)', letterSpacing:2, padding:'4px 8px', marginBottom:4 }}>REPARTI</div>
          {reparti.map(r => {
            const conteggio = contaOrdiniPerReparto(r.id)
            return (
              <button key={r.id} onClick={() => setRepartoAttivo(r.id)}
                style={{
                  width:'100%', padding:'10px 8px', marginBottom:4, borderRadius:8, cursor:'pointer', textAlign:'left',
                  border:`1px solid ${repartoAttivo === r.id ? r.colore : 'transparent'}`,
                  background: repartoAttivo === r.id ? r.colore+'15' : 'transparent',
                  color:'var(--dc-text)', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:6,
                  position:'relative',
                }}>
                {conteggio > 0 && (
                  <div style={{
                    position:'absolute', top:-6, right:-6,
                    background: r.colore, color:'var(--dc-bg)',
                    borderRadius:'50%', width:20, height:20,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.68rem', fontWeight:700,
                    fontFamily:"'DM Mono',monospace",
                    boxShadow:`0 0 8px ${r.colore}88`,
                  }}>
                    {conteggio}
                  </div>
                )}
                <span>{ICONE[r.icona]||'📦'}</span>
                <span>{r.nome}</span>
              </button>
            )
          })}
        </div>







      </div>

      {/* MODAL NUOVO ASPORTO */}
      {/* MODAL NOTA */}
      {notaModal !== null && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--dc-surface)',border:'1px solid var(--dc-border)',borderRadius:20,padding:24,width:360,maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:'0.9rem',fontWeight:700,color:'var(--dc-text)'}}>
              ✏️ Variante per: {righeComanda.find(r => r.id === notaModal)?.nome}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => { if (notaTipo !== 'rimozione') setAggiunte([]); setNotaTipo('rimozione') }}
                style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${notaTipo==='rimozione' ? 'var(--dc-rosso)' : 'var(--dc-border)'}`,
                  background: notaTipo==='rimozione' ? 'rgba(var(--dc-rosso-rgb), 0.15)' : 'transparent',
                  color: notaTipo==='rimozione' ? 'var(--dc-rosso)' : 'var(--dc-muted)', cursor:'pointer', fontWeight:700}}>
                − Rimozione
              </button>
              <button onClick={() => { if (notaTipo !== 'aggiunta') setAggiunte([]); setNotaTipo('aggiunta') }}
                style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${notaTipo==='aggiunta' ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
                  background: notaTipo==='aggiunta' ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'transparent',
                  color: notaTipo==='aggiunta' ? 'var(--dc-verde)' : 'var(--dc-muted)', cursor:'pointer', fontWeight:700}}>
                + Aggiunta
              </button>
            </div>
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
              const tiers = Object.entries(gruppiMap).map(([costo, st]) => ({ costo: parseInt(costo), items: [...st] })).sort((a,b) => a.costo - b.costo)
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
                      💰 Totale: +€{(aggiunte.reduce((t,a) => t + a.costo, 0)/100).toFixed(2).replace('.',',')} — {aggiunte.map(a => a.nome).join(', ')}
                    </div>
                  )}
                </div>
              )
            })()}
            <textarea autoFocus value={notaTesto} onChange={e => setNotaTesto(e.target.value)}
              placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella...' : 'es. con funghi...'}
              rows={3}
              style={{background:'var(--dc-surface2)',border:'1px solid var(--dc-border)',borderRadius:10,padding:12,color:'var(--dc-text)',fontSize:'0.9rem',resize:'none',fontFamily:"'DM Sans',sans-serif"}}
            />
            <div style={{display:'flex',gap:10}}>
              <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([]) }}
                style={{flex:1,padding:12,borderRadius:10,background:'transparent',border:'1px solid var(--dc-border)',color:'var(--dc-text)',cursor:'pointer'}}>
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
                  salvaNota(notaModal, testoFinale, notaTipo, aggiunte.reduce((t,a) => t + a.costo, 0))
                } else {
                  salvaNota(notaModal, notaTesto, notaTipo, 50)
                }
                setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([])
              }}
                style={{flex:1,padding:12,borderRadius:10,background:'var(--dc-verde)',border:'none',color:'var(--dc-bg)',fontWeight:700,cursor:'pointer'}}>
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
      {showNuovoAsporto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--dc-surface)', border:'2px solid var(--dc-verde)', borderRadius:16, padding:28, width:340 }}>
            <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--dc-verde)', marginBottom:16 }}>🛵 Nuovo Asporto</div>
            <input
              type="text"
              value={nomeCliente}
              onChange={e => setNomeCliente(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creaNuovoAsporto()}
              placeholder="Cognome e Nome cliente..."
              autoFocus
              style={{ width:'100%', background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', borderRadius:10, padding:'12px', color:'var(--dc-text)', fontSize:'1rem', boxSizing:'border-box', outline:'none', marginBottom:16 }}
            />
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => { setShowNuovoAsporto(false); setNomeCliente('') }}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid var(--dc-border)', background:'transparent', color:'var(--dc-text)', cursor:'pointer' }}>
                Annulla
              </button>
              <button onClick={creaNuovoAsporto}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:'var(--dc-verde)', color:'var(--dc-bg)', cursor:'pointer', fontWeight:700 }}>
                ✓ Crea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINA */}
      {showElimina && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--dc-surface)', border:'2px solid var(--dc-rosso)', borderRadius:16, padding:28, width:320 }}>
            <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--dc-rosso)', marginBottom:8 }}>🗑️ Elimina asporto?</div>
            <div style={{ fontSize:'0.85rem', color:'var(--dc-ambra)', marginBottom:20 }}>L'ordine verrà eliminato definitivamente.</div>
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setShowElimina(null)}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid var(--dc-border)', background:'transparent', color:'var(--dc-text)', cursor:'pointer' }}>
                Annulla
              </button>
              <button onClick={confermaElimina}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:'var(--dc-rosso)', color:'white', cursor:'pointer', fontWeight:700 }}>
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

{toast && (
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)', background:'var(--dc-surface2)', border:'1px solid var(--dc-verde)', borderRadius:10, padding:'50px 60px', color:'var(--dc-verde)', fontSize:'1.5rem', zIndex:9999 }}>
          {toast}
        </div>
      )}


    </div>
  )
}
