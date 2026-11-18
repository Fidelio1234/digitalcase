import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { useNegozioId } from '@/hooks/useNegozioId'
import { getProdottiConGiacenza, aggiornaGiacenza, getMovimentiMagazzino } from '@/lib/supabase-db'

const fmt = (n) => n?.toLocaleString('it-IT') || '0'

export default function MagazzinoPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const NEGOZIO_ID = useNegozioId()

  const [prodotti, setProdotti] = useState([])
  const [movimenti, setMovimenti] = useState([])
  const [caricando, setCaricando] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('giacenze') // giacenze | movimenti
  const [ricerca, setRicerca] = useState('')

  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    if (user) carica()
  }, [user, loading])

  async function carica() {
    setCaricando(true)
    const [p, m] = await Promise.all([
      getProdottiConGiacenza(NEGOZIO_ID),
      getMovimentiMagazzino(NEGOZIO_ID)
    ])
    setProdotti(p)
    setMovimenti(m)
    setCaricando(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function salvaCarico(prodotto) {
    const qty = parseInt(editVal)
    if (isNaN(qty) || qty <= 0) return
    const nuovaGiacenza = (prodotto.giacenza || 0) + qty
    await aggiornaGiacenza(NEGOZIO_ID, prodotto.id, prodotto.nome, 'carico', qty, nuovaGiacenza)
    showToast(`✓ Caricati ${qty} pz di ${prodotto.nome}`)
    setEditId(null)
    setEditVal('')
    carica()
  }

  async function salvaRettifica(prodotto) {
    const qty = parseInt(editVal)
    if (isNaN(qty) || qty < 0) return
    const diff = qty - (prodotto.giacenza || 0)
    await aggiornaGiacenza(NEGOZIO_ID, prodotto.id, prodotto.nome, 'rettifica', diff, qty)
    showToast(`✓ Giacenza ${prodotto.nome} aggiornata a ${qty}`)
    setEditId(null)
    setEditVal('')
    carica()
  }

  const sottoSoglia = prodotti.filter(p => p.giacenza_minima !== null && p.giacenza <= p.giacenza_minima)

  // Ricerca: senza maiuscole/minuscole e senza accenti
  const normalizza = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const q = normalizza(ricerca)
  const prodottiFiltrati = q ? prodotti.filter(p => normalizza(p.nome).includes(q)) : prodotti
  const movimentiFiltrati = q ? movimenti.filter(m => normalizza(m.prodotto_nome).includes(q)) : movimenti

  if (loading || !user) return null

  return (
    <div style={{ minHeight:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Sans',sans-serif", padding:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => router.back()}
          style={{ background:'transparent', border:'1px solid rgba(var(--dc-forte-rgb), 0.267)', borderRadius:10, color:'var(--dc-forte)', padding:'8px 16px', cursor:'pointer', fontSize:'0.82rem' }}>
          ← Indietro
        </button>
        <div>
          <div style={{ fontSize:'1.1rem', fontWeight:700 }}>📦 Magazzino</div>
          <div style={{ fontSize:'0.72rem', color:'var(--dc-forte)' }}>{prodotti.length} prodotti con giacenza</div>
        </div>
      </div>

      {/* Alert sotto soglia */}
      {sottoSoglia.length > 0 && (
        <div style={{ background:'rgba(var(--dc-rosso-rgb), 0.1)', border:'1px solid var(--dc-rosso)', borderRadius:12, padding:16, marginBottom:20 }}>
          <div style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--dc-rosso)', marginBottom:8 }}>
            ⚠ {sottoSoglia.length} prodott{sottoSoglia.length === 1 ? 'o' : 'i'} sotto soglia minima
          </div>
          {sottoSoglia.map(p => (
            <div key={p.id} style={{ fontSize:'0.78rem', color:'var(--dc-text)', padding:'2px 0' }}>
              • {p.nome} — rimasti <strong style={{color:'var(--dc-rosso)'}}>{p.giacenza}</strong> (min. {p.giacenza_minima})
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['giacenze','movimenti'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.82rem',
              background: tab === t ? 'var(--dc-verde)' : 'var(--dc-surface2)',
              color: tab === t ? 'var(--dc-bg)' : 'var(--dc-text)',
              fontWeight: tab === t ? 700 : 400 }}>
            {t === 'giacenze' ? '📦 Giacenze' : '📋 Movimenti'}
          </button>
        ))}
      </div>

      {/* Cerca prodotto */}
      <style>{'.cercaMagazzino::placeholder { color: var(--dc-forte); opacity: 1; }'}</style>
      <div style={{ position:'relative', marginBottom:16 }}>
        <input type="search" className="cercaMagazzino" value={ricerca} onChange={e => setRicerca(e.target.value)}
          placeholder="🔍 Cerca prodotto"
          style={{ width:'100%', boxSizing:'border-box', background:'var(--dc-surface)', border:'1px solid var(--dc-verde)', borderRadius:10, padding:'12px 14px', color:'var(--dc-text)', fontSize:'0.9rem' }}
        />
      </div>

      {caricando ? (
        <div style={{ textAlign:'center', color:'var(--dc-muted)', padding:40 }}>Caricamento...</div>
      ) : tab === 'giacenze' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {prodotti.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--dc-muted)', padding:40 }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📦</div>
              <div>Nessun prodotto con giacenza impostata</div>
              <div style={{ fontSize:'0.75rem', marginTop:8 }}>Vai in Configurazione → Reparti e imposta la giacenza sui prodotti</div>
            </div>
          ) : prodottiFiltrati.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--dc-muted)', padding:40 }}>Nessun prodotto trovato</div>
          ) : prodottiFiltrati.map(p => {
            const sottoMin = p.giacenza_minima !== null && p.giacenza <= p.giacenza_minima
            return (
              <div key={p.id} style={{ background:'var(--dc-surface)', border:`1px solid ${sottoMin ? 'var(--dc-rosso)' : 'var(--dc-border)'}`, borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:'0.9rem', fontWeight:600, color: sottoMin ? 'var(--dc-rosso)' : 'var(--dc-text)' }}>
                      {sottoMin && '⚠ '}{p.nome}
                    </div>
                    {p.giacenza_minima !== null && (
                      <div style={{ fontSize:'0.72rem', color:'var(--dc-forte)', marginTop:2 }}>
                        Soglia minima: {p.giacenza_minima}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'1.4rem', fontWeight:700, color: sottoMin ? 'var(--dc-rosso)' : 'var(--dc-verde)', fontFamily:"'DM Mono',monospace" }}>
                        {fmt(p.giacenza)}
                      </div>
                      <div style={{ fontSize:'0.65rem', color:'var(--dc-muted)' }}>pezzi</div>
                    </div>
                    {editId === p.id ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <input type="number" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          autoFocus
                          style={{ width:70, background:'var(--dc-surface2)', border:'1px solid var(--dc-verde)', borderRadius:8, padding:'6px 8px', color:'var(--dc-forte)', fontSize:'0.85rem' }}
                        />
                        <button onClick={() => salvaCarico(p)}
                          style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'var(--dc-verde)', color:'var(--dc-bg)', cursor:'pointer', fontSize:'0.75rem', fontWeight:700 }}>
                          +Carico
                        </button>
                        <button onClick={() => salvaRettifica(p)}
                          style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'var(--dc-ambra)', color:'var(--dc-bg)', cursor:'pointer', fontSize:'0.75rem', fontWeight:700 }}>
                          =Set
                        </button>
                        <button onClick={() => { setEditId(null); setEditVal('') }}
                          style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--dc-border)', background:'transparent', color:'var(--dc-muted)', cursor:'pointer', fontSize:'0.75rem' }}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditId(p.id); setEditVal('') }}
                        style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--dc-border)', background:'var(--dc-surface2)', color:'var(--dc-text)', cursor:'pointer', fontSize:'0.78rem' }}>
                        ✏️ Aggiorna
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {movimenti.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--dc-muted)', padding:40 }}>Nessun movimento</div>
          ) : movimentiFiltrati.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--dc-muted)', padding:40 }}>Nessun movimento trovato</div>
          ) : movimentiFiltrati.map(m => (
            <div key={m.id} style={{ background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'0.85rem', fontWeight:600 }}>{m.prodotto_nome}</div>
                <div style={{ fontSize:'0.72rem', color:'var(--dc-forte)', marginTop:2 }}>
                  {new Date(m.created_at).toLocaleDateString('it-IT')} {new Date(m.created_at).toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:'0.72rem', padding:'3px 8px', borderRadius:6,
                  background: m.tipo === 'vendita' ? 'rgba(var(--dc-rosso-rgb), 0.15)' : m.tipo === 'carico' ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'rgba(var(--dc-ambra-rgb), 0.15)',
                  color: m.tipo === 'vendita' ? 'var(--dc-rosso)' : m.tipo === 'carico' ? 'var(--dc-verde)' : 'var(--dc-ambra)' }}>
                  {m.tipo === 'vendita' ? '↓ Vendita' : m.tipo === 'carico' ? '↑ Carico' : '= Rettifica'}
                </span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.85rem', fontWeight:700 }}>
                  {m.tipo === 'vendita' ? '-' : m.tipo === 'carico' ? '+' : ''}{Math.abs(m.quantita)}
                </span>
                <span style={{ fontSize:'0.72rem', color:'var(--dc-muted)' }}>→ {m.giacenza_dopo} rimasti</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:'var(--dc-surface2)', border:'1px solid var(--dc-verde)', borderRadius:10, padding:'10px 20px', color:'var(--dc-verde)', fontSize:'0.85rem', zIndex:9999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
