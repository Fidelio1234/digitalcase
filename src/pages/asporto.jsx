
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
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
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
  const color = elapsed > 1800 ? '#ff4d6a' : elapsed > 900 ? '#ffb830' : '#00e5a0'
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
    setRigheComanda(prev => prev.map(r => {
      if (r.id !== id) return r
      const importoBase = r.importoBase ?? r.importo
      const totaleBase = importoBase * r.quantita
      if (tipo === 'aggiunta' && nota) {
        return { ...r, nota: `+${nota}`, importoBase, importo: importoBase + costoAggiunta, totaleRiga: totaleBase + (costoAggiunta * r.quantita) }
      } else {
        return { ...r, nota: nota ? `-${nota}` : '', importoBase, importo: importoBase, totaleRiga: totaleBase }
      }
    }))
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

  return (
    <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid #1a1c24' }}>
        <button onClick={() => { if (asportoAttivo) salvaAsportoDb(NEGOZIO_ID, asportoAttivo, righeComanda); router.replace('/cassa') }}
          style={{ background:'transparent', border:'1px solid #252830', borderRadius:10, color:'#00ffb3', padding:'12px 19px', cursor:'pointer', fontSize:'1.2rem' }}>
          ← Cassa
        </button>
        <div style={{ flex:1 ,textAlign:'center'}}>
          <div style={{ fontSize:'1.5rem', fontWeight:700, }}>🛵 Asporto</div>
          <div style={{ fontSize:'1.5rem', color:'#ffb830' }}>{asporti.length} ordini aperti</div>
        </div>
        <button onClick={() => setShowNuovoAsporto(true)}
          style={{ background:'#00e5a0', border:'none', borderRadius:10, color:'#08090c', padding:'10px 20px', cursor:'pointer', fontSize:'0.82rem', fontWeight:700 }}>
          + Nuovo cliente
        </button>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Lista asporti sx */}
        <div style={{ width:220, borderRight:'1px solid #1a1c24', overflowY:'auto', padding:8 }}>
          {asporti.length === 0 && (
            <div style={{ textAlign:'center', color:'#ffb830', padding:20, fontSize:'0.8rem' }}>
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
                background: asportoAttivo === a.id ? '#1a2a1a' : '#111318',
                border: `1px solid ${asportoAttivo === a.id ? '#00e5a0' : '#252830'}`,
              }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'0.72rem', color:'#ffb830' }}>#{a.numero}</span>
                <Timer apertoAlle={a.aperto_alle} />
              </div>
              <div style={{ fontWeight:700, fontSize:'1.2rem', marginTop:2 }}>{a.nome_cliente}</div>
              <div style={{ fontSize:'0.9rem', color:'#ffb830', marginTop:2 }}>
                {fmtOra(a.aperto_alle)} · {(a.righe || []).length} prodotti
              </div>
            </div>
          ))}
        </div>

        {/* Centro - comanda */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header asporto attivo */}
          {asportoCorrente ? (
            <div style={{ padding:'10px 16px', borderBottom:'1px solid #1a1c24', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:700 }}>#{asportoCorrente.numero} — {asportoCorrente.nome_cliente}</div>
                <div style={{ fontSize:'0.92rem', color:'#ffb830' }}>Chiamato alle {fmtOra(asportoCorrente.aperto_alle)}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={preconto}
                  style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #252830', background:'transparent', color:'#ffb830', cursor:'pointer', fontSize:'0.98rem' }}>
                  🖨️ Preconto
                </button>
                <button onClick={salvaComanda}
                  style={{ padding:'8px 12px', borderRadius:8, border:'none', background:'#1a2a1a', color:'#00e5a0', cursor:'pointer', fontSize:'0.98rem' }}>
                  💾 Salva
                </button>
                <button onClick={chiudiAsporto}
                  style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#00e5a0', color:'#08090c', cursor:'pointer', fontSize:'0.92rem', fontWeight:700 }}>
                  Cassa →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding:20, textAlign:'center', color:'#ffb830', fontSize:'0.95rem' }}>
              Seleziona un asporto o creane uno nuovo
            </div>
          )}

          {/* Lista righe */}
          <div style={{ flex:1, overflowY:'auto', padding:12 }}>
            {righeComanda.length === 0 && asportoCorrente && (
              <div style={{ textAlign:'center', color:'#ffb830', padding:40, fontSize:'0.85rem' }}>
                <div style={{ fontSize:'2rem' }}>🛵</div>
                Aggiungi prodotti dall'ordine
              </div>
            )}
            {righeComanda.map((r, i) => (
              <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'#111318', borderRadius:10, marginBottom:6, border:'1px solid #252830' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:r.colore+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>
                    {ICONE[r.icona]||'📦'}
                  </div>
                  <div>
                    <div style={{ fontSize:'0.85rem', fontWeight:600 }}>{r.nome} {r.quantita > 1 && <span style={{ color:'#00e5a0' }}>×{r.quantita}</span>}</div>
                    {r.nota && <div style={{fontSize:'0.72rem', color:'#ffb830', marginTop:2}}>📝 {r.nota}</div>}
                    <div style={{ fontSize:'0.72rem', color:'#5a5d6e' }}>€ {fmt(r.importo)} cad.</div>
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
                    style={{ background:'transparent', border:'none', color:'#ff4d6a', cursor:'pointer', fontSize:'1rem' }}>×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Totale */}
          {righeComanda.length > 0 && (
            <div style={{ padding:'10px 16px', borderTop:'1px solid #1a1c24', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color:'#5a5d6e', fontSize:'0.85rem' }}>TOTALE</span>
              <span style={{ fontSize:'1.1rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totale)}</span>
            </div>
          )}

          {/* Griglia prodotti */}
          {repartoAttivo && (
            <div style={{ borderTop:'1px solid #1a1c24', padding:12, overflowY:'auto', maxHeight:220 }}>
              {(() => {
                const rep = reparti.find(r => r.id === repartoAttivo)
                const prodotti = rep?.sottoreparti?.filter(s => s.abilitato) || []
                return (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:8 }}>
                    {prodotti.map(sr => (
                      <button key={sr.id} onClick={() => aggiungiProdotto(rep, sr)}
                        style={{ padding:'10px 8px', borderRadius:10, border:`1px solid ${rep.colore}66`, background:'#111318', cursor:'pointer', textAlign:'center' }}>
                        <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#eef0f6' }}>{sr.nome}</div>
                        <div style={{ fontSize:'0.75rem', color:rep.colore, marginTop:4 }}>€ {fmt(sr.prezzoFisso)}</div>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Reparti dx */}
        <div style={{ width:160, borderLeft:'1px solid #1a1c24', overflowY:'auto', padding:8 }}>
          <div style={{ fontSize:'1.25rem', color:'#ffb830', letterSpacing:2, padding:'4px 8px', marginBottom:4 }}>REPARTI</div>
          {reparti.map(r => (
            <button key={r.id} onClick={() => setRepartoAttivo(r.id)}
              style={{
                width:'100%', padding:'10px 8px', marginBottom:4, borderRadius:8, cursor:'pointer', textAlign:'left',
                border:`1px solid ${repartoAttivo === r.id ? r.colore : 'transparent'}`,
                background: repartoAttivo === r.id ? r.colore+'15' : 'transparent',
                color:'#eef0f6', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:6
              }}>
              <span>{ICONE[r.icona]||'📦'}</span>
              <span>{r.nome}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MODAL NUOVO ASPORTO */}
      {/* MODAL NOTA */}
      {notaModal !== null && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'1px solid #252830',borderRadius:20,padding:24,width:360,display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:'0.9rem',fontWeight:700,color:'#eef0f6'}}>
              ✏️ Variante per: {righeComanda.find(r => r.id === notaModal)?.nome}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => setNotaTipo('rimozione')}
                style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${notaTipo==='rimozione' ? '#ff4d6a' : '#252830'}`,
                  background: notaTipo==='rimozione' ? 'rgba(255,77,106,0.15)' : 'transparent',
                  color: notaTipo==='rimozione' ? '#ff4d6a' : '#5a5d6e', cursor:'pointer', fontWeight:700}}>
                − Rimozione
              </button>
              <button onClick={() => setNotaTipo('aggiunta')}
                style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${notaTipo==='aggiunta' ? '#00e5a0' : '#252830'}`,
                  background: notaTipo==='aggiunta' ? 'rgba(0,229,160,0.15)' : 'transparent',
                  color: notaTipo==='aggiunta' ? '#00e5a0' : '#5a5d6e', cursor:'pointer', fontWeight:700}}>
                + Aggiunta
              </button>
            </div>
            <textarea autoFocus value={notaTesto} onChange={e => setNotaTesto(e.target.value)}
              placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella...' : 'es. con funghi...'}
              rows={3}
              style={{background:'#1a1c24',border:'1px solid #252830',borderRadius:10,padding:12,color:'#eef0f6',fontSize:'0.9rem',resize:'none',fontFamily:"'DM Sans',sans-serif"}}
            />
            <div style={{display:'flex',gap:10}}>
              <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione') }}
                style={{flex:1,padding:12,borderRadius:10,background:'transparent',border:'1px solid #252830',color:'#eef0f6',cursor:'pointer'}}>
                Annulla
              </button>
              <button onClick={() => { salvaNota(notaModal, notaTesto, notaTipo, 50); setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione') }}
                style={{flex:1,padding:12,borderRadius:10,background:'#00e5a0',border:'none',color:'#08090c',fontWeight:700,cursor:'pointer'}}>
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
      {showNuovoAsporto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#111318', border:'2px solid #00e5a0', borderRadius:16, padding:28, width:340 }}>
            <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#00e5a0', marginBottom:16 }}>🛵 Nuovo Asporto</div>
            <input
              type="text"
              value={nomeCliente}
              onChange={e => setNomeCliente(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creaNuovoAsporto()}
              placeholder="Cognome e Nome cliente..."
              autoFocus
              style={{ width:'100%', background:'#1a1c24', border:'1px solid #252830', borderRadius:10, padding:'12px', color:'#eef0f6', fontSize:'1rem', boxSizing:'border-box', outline:'none', marginBottom:16 }}
            />
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => { setShowNuovoAsporto(false); setNomeCliente('') }}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid #252830', background:'transparent', color:'#eef0f6', cursor:'pointer' }}>
                Annulla
              </button>
              <button onClick={creaNuovoAsporto}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:'#00e5a0', color:'#08090c', cursor:'pointer', fontWeight:700 }}>
                ✓ Crea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINA */}
      {showElimina && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#111318', border:'2px solid #ff4d6a', borderRadius:16, padding:28, width:320 }}>
            <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#ff4d6a', marginBottom:8 }}>🗑️ Elimina asporto?</div>
            <div style={{ fontSize:'0.85rem', color:'#ffb830', marginBottom:20 }}>L'ordine verrà eliminato definitivamente.</div>
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setShowElimina(null)}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid #252830', background:'transparent', color:'#eef0f6', cursor:'pointer' }}>
                Annulla
              </button>
              <button onClick={confermaElimina}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:'#ff4d6a', color:'white', cursor:'pointer', fontWeight:700 }}>
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:'#1a1c24', border:'1px solid #00e5a0', borderRadius:10, padding:'10px 20px', color:'#00e5a0', fontSize:'0.85rem', zIndex:9999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
