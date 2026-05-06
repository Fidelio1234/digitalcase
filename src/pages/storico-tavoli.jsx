import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { useNegozioId } from '@/hooks/useNegozioId'
import { supabase } from '@/lib/supabase'

const fmt = c => (c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })

export default function StoricoTavoliPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const NEGOZIO_ID = useNegozioId()

  const [records, setRecords] = useState([])
  const [caricando, setCaricando] = useState(true)
  const [filtroData, setFiltroData] = useState(new Date().toISOString().split('T')[0])
  const [filtroTavolo, setFiltroTavolo] = useState('')
  const [dettaglio, setDettaglio] = useState(null)

  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    if (user) carica()
  }, [user, loading, filtroData, filtroTavolo])

  async function carica() {
    setCaricando(true)
    let query = supabase
      .from('storico_tavoli')
      .select('*')
      .eq('negozio_id', NEGOZIO_ID)
      .order('chiuso_alle', { ascending: false })
      .limit(200)

    if (filtroData) {
      query = query
        .gte('chiuso_alle', filtroData + 'T00:00:00')
        .lte('chiuso_alle', filtroData + 'T23:59:59')
    }

    if (filtroTavolo) {
      query = query.eq('numero_tavolo', parseInt(filtroTavolo))
    }

    const { data } = await query
    setRecords(data || [])
    setCaricando(false)
  }

  if (loading || !user) return null

  return (
    <div style={{ minHeight:'100vh', background:'#08090c', color:'#eef0f6', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
      
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => router.back()}
          style={{ background:'transparent', border:'1px solid #ffffff44', borderRadius:10, color:'#00ffb3', padding:'8px 16px', cursor:'pointer', fontSize:'0.92rem' }}>
          ← Indietro
        </button>
        <div>
          <div style={{ fontSize:'1.1rem', fontWeight:700 }}>📋 Storico Tavoli</div>
          <div style={{ fontSize:'0.92rem', color:'#00ffb3' }}>{records.length} record trovati</div>
        </div>
      </div>

      {/* Filtri */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:150 }}>
          <label style={{ fontSize:'0.85rem', color:'#00ffb3', letterSpacing:1, display:'block', marginBottom:4 }}>DATA</label>
          <input type="date" value={filtroData}
            onChange={e => setFiltroData(e.target.value)}
            style={{ width:'100%', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#ffffff', fontSize:'0.85rem', boxSizing:'border-box' }}
          />
        </div>
        <div style={{ width:120 }}>
          <label style={{ fontSize:'0.85rem', color:'#00ffb3', letterSpacing:1, display:'block', marginBottom:4 }}>TAVOLO N°</label>
          <input type="number" value={filtroTavolo}
            onChange={e => setFiltroTavolo(e.target.value)}
            placeholder="Tutti"
            style={{ width:'100%', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#ffb830', fontSize:'0.95rem', boxSizing:'border-box' }}
          />
        </div>
        <div style={{ display:'flex', alignItems:'flex-end' }}>
          <button onClick={() => { setFiltroData(''); setFiltroTavolo('') }}
            style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #252830', background:'transparent', color:'#ffb830', cursor:'pointer', fontSize:'0.82rem' }}>
            Reset
          </button>
        </div>
      </div>

      {/* Lista */}
      {caricando ? (
        <div style={{ textAlign:'center', color:'#5a5d6e', padding:40 }}>Caricamento...</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign:'center', color:'#5a5d6e', padding:40 }}>
          <div style={{ fontSize:'2rem', marginBottom:8 }}>📋</div>
          <div>Nessun tavolo trovato</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {records.map(r => (
            <div key={r.id}
              onClick={() => setDettaglio(dettaglio?.id === r.id ? null : r)}
              style={{ background:'#111318', border:'1px solid #252830', borderRadius:12, padding:16, cursor:'pointer', transition:'border-color 0.2s',
                borderColor: dettaglio?.id === r.id ? '#00e5a0' : '#252830' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                  <div style={{ background:'#1a1c24', borderRadius:8, padding:'6px 12px', fontSize:'0.85rem', fontWeight:700, color:'#00e5a0' }}>
                    Tavolo {r.numero_tavolo}
                  </div>
                  <div>
                    <div style={{ fontSize:'0.92rem', fontWeight:600 }}>
                      {new Date(r.chiuso_alle).toLocaleDateString('it-IT')} — {new Date(r.chiuso_alle).toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}
                    </div>
                    <div style={{ fontSize:'0.92rem', color:'#ffb830', marginTop:2 }}>
                      {r.coperti > 0 ? `👤 ${r.coperti} coperti · ` : ''}{r.righe?.length || 0} prodotti
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:'1rem', fontWeight:700, color:'#00e5a0', fontFamily:"'DM Mono',monospace" }}>
                  € {fmt(r.totale)}
                </div>
              </div>

              {/* Dettaglio prodotti */}
              {dettaglio?.id === r.id && (
                <div style={{ marginTop:12, borderTop:'1px solid #252830', paddingTop:12 }}>
                  {r.righe?.map((riga, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'0.82rem' }}>
                      <span style={{ color:'#eef0f6' }}>
                        {riga.quantita > 1 ? `${riga.quantita}x ` : ''}{riga.nome}
                        {riga.nota ? <span style={{ color:'#5a5d6e' }}> — {riga.nota}</span> : ''}
                      </span>
                      <span style={{ color:'#5a5d6e', fontFamily:"'DM Mono',monospace" }}>€ {fmt(riga.totaleRiga)}</span>
                    </div>
                  ))}
                  {r.aperto_alle && (
                    <div style={{ marginTop:8, fontSize:'0.72rem', color:'#5a5d6e' }}>
                      Aperto alle {new Date(r.aperto_alle).toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
