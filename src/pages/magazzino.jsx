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

  if (loading || !user) return null

  return (
    <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans',sans-serif", padding:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => router.back()}
          style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#ffffff', padding:'8px 16px', cursor:'pointer', fontSize:'0.82rem' }}>
          ← Indietro
        </button>
        <div>
          <div style={{ fontSize:'1.1rem', fontWeight:700 }}>📦 Magazzino</div>
          <div style={{ fontSize:'0.72rem', color:'#5a5d6e' }}>{prodotti.length} prodotti con giacenza</div>
        </div>
      </div>

      {/* Alert sotto soglia */}
      {sottoSoglia.length > 0 && (
        <div style={{ background:'rgba(255,77,106,0.1)', border:'1px solid #ff4d6a', borderRadius:12, padding:16, marginBottom:20 }}>
          <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#ff4d6a', marginBottom:8 }}>
            ⚠ {sottoSoglia.length} prodott{sottoSoglia.length === 1 ? 'o' : 'i'} sotto soglia minima
          </div>
          {sottoSoglia.map(p => (
            <div key={p.id} style={{ fontSize:'0.78rem', color:'#eef0f6', padding:'2px 0' }}>
              • {p.nome} — rimasti <strong style={{color:'#ff4d6a'}}>{p.giacenza}</strong> (min. {p.giacenza_minima})
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['giacenze','movimenti'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.82rem',
              background: tab === t ? '#00e5a0' : '#1a1c24',
              color: tab === t ? '#08090c' : '#eef0f6',
              fontWeight: tab === t ? 700 : 400 }}>
            {t === 'giacenze' ? '📦 Giacenze' : '📋 Movimenti'}
          </button>
        ))}
      </div>

      {caricando ? (
        <div style={{ textAlign:'center', color:'#5a5d6e', padding:40 }}>Caricamento...</div>
      ) : tab === 'giacenze' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {prodotti.length === 0 ? (
            <div style={{ textAlign:'center', color:'#5a5d6e', padding:40 }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📦</div>
              <div>Nessun prodotto con giacenza impostata</div>
              <div style={{ fontSize:'0.75rem', marginTop:8 }}>Vai in Configurazione → Reparti e imposta la giacenza sui prodotti</div>
            </div>
          ) : prodotti.map(p => {
            const sottoMin = p.giacenza_minima !== null && p.giacenza <= p.giacenza_minima
            return (
              <div key={p.id} style={{ background:'#111318', border:`1px solid ${sottoMin ? '#ff4d6a' : '#252830'}`, borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:'0.9rem', fontWeight:600, color: sottoMin ? '#ff4d6a' : '#eef0f6' }}>
                      {sottoMin && '⚠ '}{p.nome}
                    </div>
                    {p.giacenza_minima !== null && (
                      <div style={{ fontSize:'0.72rem', color:'#5a5d6e', marginTop:2 }}>
                        Soglia minima: {p.giacenza_minima}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'1.4rem', fontWeight:700, color: sottoMin ? '#ff4d6a' : '#00e5a0', fontFamily:"'DM Mono',monospace" }}>
                        {fmt(p.giacenza)}
                      </div>
                      <div style={{ fontSize:'0.65rem', color:'#5a5d6e' }}>pezzi</div>
                    </div>
                    {editId === p.id ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <input type="number" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          autoFocus
                          style={{ width:70, background:'#1a1c24', border:'1px solid #00e5a0', borderRadius:8, padding:'6px 8px', color:'#fff', fontSize:'0.85rem' }}
                        />
                        <button onClick={() => salvaCarico(p)}
                          style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'#00e5a0', color:'#08090c', cursor:'pointer', fontSize:'0.75rem', fontWeight:700 }}>
                          +Carico
                        </button>
                        <button onClick={() => salvaRettifica(p)}
                          style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'#ffb830', color:'#08090c', cursor:'pointer', fontSize:'0.75rem', fontWeight:700 }}>
                          =Set
                        </button>
                        <button onClick={() => { setEditId(null); setEditVal('') }}
                          style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #252830', background:'transparent', color:'#5a5d6e', cursor:'pointer', fontSize:'0.75rem' }}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditId(p.id); setEditVal('') }}
                        style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #252830', background:'#1a1c24', color:'#eef0f6', cursor:'pointer', fontSize:'0.78rem' }}>
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
            <div style={{ textAlign:'center', color:'#5a5d6e', padding:40 }}>Nessun movimento</div>
          ) : movimenti.map(m => (
            <div key={m.id} style={{ background:'#111318', border:'1px solid #252830', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'0.85rem', fontWeight:600 }}>{m.prodotto_nome}</div>
                <div style={{ fontSize:'0.72rem', color:'#5a5d6e', marginTop:2 }}>
                  {new Date(m.created_at).toLocaleDateString('it-IT')} {new Date(m.created_at).toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:'0.72rem', padding:'3px 8px', borderRadius:6,
                  background: m.tipo === 'vendita' ? 'rgba(255,77,106,0.15)' : m.tipo === 'carico' ? 'rgba(0,229,160,0.15)' : 'rgba(255,184,48,0.15)',
                  color: m.tipo === 'vendita' ? '#ff4d6a' : m.tipo === 'carico' ? '#00e5a0' : '#ffb830' }}>
                  {m.tipo === 'vendita' ? '↓ Vendita' : m.tipo === 'carico' ? '↑ Carico' : '= Rettifica'}
                </span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.85rem', fontWeight:700 }}>
                  {m.tipo === 'vendita' ? '-' : m.tipo === 'carico' ? '+' : ''}{Math.abs(m.quantita)}
                </span>
                <span style={{ fontSize:'0.72rem', color:'#5a5d6e' }}>→ {m.giacenza_dopo} rimasti</span>
              </div>
            </div>
          ))}
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
