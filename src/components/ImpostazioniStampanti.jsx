import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'

const GRUPPI_DEFAULT = [
  { id: 'tutto', label: 'Tutto' },
  { id: 'cucina', label: 'Cucina' },
  { id: 'bar', label: 'Bar' },
  { id: 'pizzeria', label: 'Pizzeria' },
]

export default function ImpostazioniStampanti({ reparti, showToast }) {
  const NEGOZIO_ID = useNegozioId()
  const [stampanti, setStampanti] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data } = await supabase
      .from('impostazioni_negozio')
      .select('stampanti')
      .eq('negozio_id', NEGOZIO_ID)
      .single()
    setStampanti(data?.stampanti || [])
    setLoading(false)
  }

  async function salva(nuove) {
    const { error } = await supabase
      .from('impostazioni_negozio')
      .upsert({ negozio_id: NEGOZIO_ID, stampanti: nuove }, { onConflict: 'negozio_id' })
    if (error) { showToast('⚠ Errore salvataggio'); return }
    showToast('✓ Stampanti salvate')
    setStampanti(nuove)
  }

  function aggiungi() {
    const nuove = [...stampanti, { id: Date.now(), nome: 'Stampante 1', ip: '', porta: 9100, gruppi: ['tutto'], attiva: true }]
    salva(nuove)
  }

  function aggiorna(id, field, value) {
    const nuove = stampanti.map(s => s.id === id ? { ...s, [field]: value } : s)
    setStampanti(nuove)
  }

  function rimuovi(id) {
    salva(stampanti.filter(s => s.id !== id))
  }

  async function testa(s) {
    showToast('⏳ Test in corso...')
    const res = await fetch('/api/stampa-comanda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: s.ip, porta: s.porta, tavolo: 'TEST',
        righe: [{ nome: 'Test stampa', quantita: 1, totaleRiga: 100, nota: 'Nota di prova' }],
        tipo: 'comanda'
      })
    })
    const data = await res.json()
    if (data.ok) showToast('✓ Stampante raggiungibile!')
    else showToast('⚠ ' + data.error)
  }

  if (loading) return <div style={{color:'#5a5d6e', padding:16}}>Caricamento...</div>

  const inputStyle = {
    background:'#111318', border:'1px solid #252830', borderRadius:8,
    padding:'8px 12px', color:'#eef0f6', fontSize:'0.82rem',
    fontFamily:"'DM Mono',monospace", width:'100%', boxSizing:'border-box'
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      {stampanti.length === 0 && (
        <div style={{color:'#5a5d6e', fontSize:'0.82rem', padding:'12px 0'}}>
          Nessuna stampante configurata
        </div>
      )}

      {stampanti.map(s => (
        <div key={s.id} style={{background:'#111318', border:'1px solid #252830', borderRadius:14, padding:16, display:'flex', flexDirection:'column', gap:10}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div>
              <label style={{fontSize:'0.65rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:3}}>NOME</label>
              <input type="text" value={s.nome}
                onChange={e => aggiorna(s.id, 'nome', e.target.value)}
                style={inputStyle} placeholder="es. Cucina" />
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, paddingTop:18}}>
              <span style={{fontSize:'0.78rem', color:'#5a5d6e'}}>Attiva</span>
              <div onClick={() => aggiorna(s.id, 'attiva', !s.attiva)}
                style={{width:40, height:22, borderRadius:11, cursor:'pointer', background: s.attiva ? '#00e5a0' : '#252830', position:'relative', transition:'background 0.2s', flexShrink:0}}>
                <div style={{position:'absolute', top:2, left: s.attiva ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 0.2s'}} />
              </div>
            </div>
            <div>
              <label style={{fontSize:'0.65rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:3}}>IP STAMPANTE</label>
              <input type="text" value={s.ip}
                onChange={e => aggiorna(s.id, 'ip', e.target.value)}
                style={inputStyle} placeholder="es. 192.168.1.50" />
            </div>
            <div>
              <label style={{fontSize:'0.65rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:3}}>PORTA</label>
              <input type="number" value={s.porta}
                onChange={e => aggiorna(s.id, 'porta', parseInt(e.target.value))}
                style={inputStyle} placeholder="9100" />
            </div>
          </div>

          {/* Gruppi reparti */}
          <div>
            <label style={{fontSize:'0.65rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:6}}>STAMPA REPARTI</label>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {reparti?.map(r => (
                <button key={r.id} type="button"
                  onClick={() => {
                    const gruppi = s.gruppi || []
                    const nuovi = gruppi.includes(r.id)
                      ? gruppi.filter(g => g !== r.id)
                      : [...gruppi, r.id]
                    aggiorna(s.id, 'gruppi', nuovi)
                  }}
                  style={{
                    padding:'4px 10px', borderRadius:8, border:'none', cursor:'pointer',
                    fontSize:'0.72rem',
                    background: (s.gruppi || []).includes(r.id) ? r.colore + '33' : '#1a1c24',
                    color: (s.gruppi || []).includes(r.id) ? r.colore : '#5a5d6e',
                    border: '1px solid ' + ((s.gruppi || []).includes(r.id) ? r.colore : '#252830'),
                  }}>
                  {r.nome}
                </button>
              ))}
              <button type="button"
                onClick={() => aggiorna(s.id, 'gruppi', reparti?.map(r => r.id) || [])}
                style={{padding:'4px 10px', borderRadius:8, border:'1px solid #252830', cursor:'pointer', fontSize:'0.72rem', background:'transparent', color:'#5a5d6e'}}>
                Tutti
              </button>
              <button type="button"
                onClick={() => aggiorna(s.id, 'gruppi', [])}
                style={{padding:'4px 10px', borderRadius:8, border:'1px solid #252830', cursor:'pointer', fontSize:'0.72rem', background:'transparent', color:'#5a5d6e'}}>
                Nessuno
              </button>
            </div>
          </div>

          <div style={{display:'flex', gap:8}}>
            <button onClick={() => testa(s)}
              style={{flex:1, padding:'8px', borderRadius:10, border:'1px solid #252830', background:'transparent', color:'#eef0f6', cursor:'pointer', fontSize:'0.78rem'}}>
              🖨️ Test stampa
            </button>
            <button onClick={() => salva(stampanti.map(x => x.id === s.id ? s : x))}
              style={{flex:1, padding:'8px', borderRadius:10, border:'none', background:'#00e5a0', color:'#08090c', cursor:'pointer', fontSize:'0.78rem', fontWeight:700}}>
              ✓ Salva
            </button>
            <button onClick={() => rimuovi(s.id)}
              style={{padding:'8px 12px', borderRadius:10, border:'1px solid #ff4d6a44', background:'transparent', color:'#ff4d6a', cursor:'pointer', fontSize:'0.78rem'}}>
              🗑️
            </button>
          </div>
        </div>
      ))}

      <button onClick={aggiungi}
        style={{padding:'10px', borderRadius:12, border:'1px dashed #252830', background:'transparent', color:'#5a5d6e', cursor:'pointer', fontSize:'0.82rem'}}>
        + Aggiungi stampante
      </button>
    </div>
  )
}
