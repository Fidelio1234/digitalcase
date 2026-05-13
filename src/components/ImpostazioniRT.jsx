/**
 * Componente impostazioni RT per il pannello tecnico
 * Da aggiungere in tech.jsx
 * 
 * Gestisce:
 * - IP e porta della cassa
 * - Matricola RT
 * - Mappatura reparti app → reparti cassa
 * - Test connessione
 */

/*import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'

// Aliquote IVA standard Ditron (configurabili sulla cassa)
const IVA_DITRON_DEFAULT = [
  { indice: 1, descrizione: 'IVA 4%', valore: 4 },
  { indice: 2, descrizione: 'IVA 10%', valore: 10 },
  { indice: 3, descrizione: 'IVA 22%', valore: 22 },
  { indice: 4, descrizione: 'Esente (N4)', valore: 0 },
  { indice: 5, descrizione: 'N1 - Escluse art.15', valore: 0 },
  { indice: 6, descrizione: 'N2 - Non soggette', valore: 0 },
  { indice: 7, descrizione: 'N3 - Non imponibili', valore: 0 },
  { indice: 8, descrizione: 'N5 - Regime margine', valore: 0 },
]

export default function ImpostazioniRT({ reparti, onSave, showToast }) {
  const NEGOZIO_ID = useNegozioId()
  const [config, setConfig] = useState({
    marca: 'ditron',
    modalita: 'MF',
    ip: '',
    porta: '7081',
    matricola: '',
    attivo: false,
  })
  const [mappatura, setMappatura] = useState({})
  const [testando, setTestando] = useState(false)
  const [statoConnessione, setStatoConnessione] = useState(null) // null | 'ok' | 'errore'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    caricaConfig()
  }, [])

  async function caricaConfig() {
    const { data } = await supabase
      .from('negozi')
      .select('rt_config')
      .eq('id', NEGOZIO_ID)
      .single()
    
    if (data?.rt_config) {
      setConfig(data.rt_config.config || config)
      setMappatura(data.rt_config.mappatura || {})
    }
    setLoading(false)
  }

  async function salvaConfig() {
    const { data: saveData, error } = await supabase
      .from('negozi')
      .update({ rt_config: { config, mappatura } })
      .eq('id', NEGOZIO_ID)
    
    if (error) { showToast('⚠ Errore: ' + error.message); return }
    showToast('✓ Configurazione RT salvata')
    if (onSave) onSave({ config, mappatura })
  }

  async function testConnessione() {
    if (!config.ip) { showToast('⚠ Inserisci IP cassa'); return }
    setTestando(true)
    setStatoConnessione(null)
    try {
      const res = await fetch('/api/ditron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: config.ip, porta: config.porta, azione: 'ping', dati: {}, marca: config.marca })
      })
      const data = await res.json()
      if (data.ok) {
        setStatoConnessione('ok')
        showToast('✓ Cassa raggiungibile!')
      } else {
        setStatoConnessione('errore')
        showToast('⚠ ' + data.error)
      }
    } catch (e) {
      setStatoConnessione('errore')
      showToast('⚠ Errore connessione: ' + e.message)
    }
    setTestando(false)
  }

  function setMapp(repartoId, field, value) {
    setMappatura(prev => ({
      ...prev,
      [repartoId]: { ...(prev[repartoId] || {}), [field]: value }
    }))
  }

  if (loading) return <div style={{color:'#5a5d6e', padding:16}}>Caricamento...</div>

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>

      {/* Config base *//*}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div>
          <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>MARCA RT</label>
          <select
            value={config.marca}
            onChange={e => setConfig(c => ({...c, marca: e.target.value}))}
            style={{width:'100%', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#eef0f6', fontSize:'0.85rem'}}
          >
            <option value="ditron">Ditron</option>
            <option value="rch">RCH Print!F/RT</option>
            <option value="3i">3i Solution RT</option>
          </select>
        </div>
        {config.marca === '3i' && (
          <div>
            <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>MODALITÀ</label>
            <div style={{display:'flex', gap:8}}>
              {['MF','RT'].map(m => (
                <button key={m} type="button"
                  onClick={() => setConfig(c => ({...c, modalita: m}))}
                  style={{
                    flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                    background: (config.modalita || 'MF') === m ? '#00e5a0' : '#1a1c24',
                    color: (config.modalita || 'MF') === m ? '#08090c' : '#eef0f6',
                    fontSize:'0.82rem', fontWeight: (config.modalita || 'MF') === m ? 700 : 400,
                  }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{display:'flex', alignItems:'center', gap:8, paddingTop:20}}>
          <label style={{fontSize:'0.82rem', color:'#5a5d6e'}}>RT Attivo</label>
          <div
            onClick={() => setConfig(c => ({...c, attivo: !c.attivo}))}
            style={{
              width:44, height:24, borderRadius:12, cursor:'pointer',
              background: config.attivo ? '#00e5a0' : '#252830',
              position:'relative', transition:'background 0.2s'
            }}
          >
            <div style={{
              position:'absolute', top:2, left: config.attivo ? 22 : 2,
              width:20, height:20, borderRadius:'50%', background:'white',
              transition:'left 0.2s'
            }} />
          </div>
        </div>

        <div>
          <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>IP CASSA</label>
          <input
            type="text"
            value={config.ip}
            onChange={e => setConfig(c => ({...c, ip: e.target.value}))}
            placeholder="es. 192.168.1.100"
            style={{width:'100%', boxSizing:'border-box', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#eef0f6', fontSize:'0.85rem', fontFamily:"'DM Mono',monospace"}}
          />
        </div>

        <div>
          <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>PORTA</label>
          <input
            type="text"
            value={config.porta}
            onChange={e => setConfig(c => ({...c, porta: e.target.value}))}
            placeholder="es. 7081"
            style={{width:'100%', boxSizing:'border-box', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#eef0f6', fontSize:'0.85rem', fontFamily:"'DM Mono',monospace"}}
          />
        </div>

        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>MATRICOLA RT</label>
          <input
            type="text"
            value={config.matricola}
            onChange={e => setConfig(c => ({...c, matricola: e.target.value.toUpperCase()}))}
            placeholder="es. 2CIDE018691"
            style={{width:'100%', boxSizing:'border-box', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#ffb830', fontSize:'0.85rem', fontFamily:"'DM Mono',monospace", letterSpacing:2}}
          />
        </div>
      </div>

      {/* Test connessione *//*}
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <button
          onClick={testConnessione}
          disabled={testando || !config.ip}
          style={{
            padding:'8px 20px', borderRadius:10, border:'none', cursor:'pointer',
            background: testando ? '#1a1c24' : '#252830',
            color: testando ? '#5a5d6e' : '#eef0f6',
            fontSize:'0.82rem', fontFamily:"'DM Mono',monospace"
          }}
        >
          {testando ? '⏳ Test in corso...' : '🔌 Test connessione'}
        </button>
        {statoConnessione === 'ok' && (
          <span style={{color:'#00e5a0', fontSize:'0.82rem'}}>✓ Cassa connessa</span>
        )}
        {statoConnessione === 'errore' && (
          <span style={{color:'#ff4d6a', fontSize:'0.82rem'}}>✗ Non raggiungibile</span>
        )}
      </div>

      {/* Mappatura reparti *//*}
      {reparti?.length > 0 && (
        <div>
          <div style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, marginBottom:8}}>
            MAPPATURA REPARTI APP → CASSA
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {reparti.map(r => (
              <div key={r.id} style={{
                display:'grid', gridTemplateColumns:'1fr 80px 100px',
                gap:8, alignItems:'center',
                padding:'8px 12px', background:'#111318',
                borderRadius:8, border:`1px solid ${r.colore}33`
              }}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{width:8, height:8, borderRadius:'50%', background:r.colore, flexShrink:0}} />
                  <span style={{fontSize:'0.82rem'}}>{r.nome}</span>
                  <span style={{fontSize:'0.7rem', color:'#5a5d6e'}}>IVA {r.iva}%{r.natura_iva ? ' · ' + r.natura_iva : ''}</span>
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>N° REP. RT</label>
                  <input
                    type="number"
                    min="1" max="16"
                    value={mappatura[r.id]?.numeroRt || ''}
                    onChange={e => setMapp(r.id, 'numeroRt', parseInt(e.target.value))}
                    placeholder="1"
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 8px', color:'#ffb830', fontSize:'0.82rem', textAlign:'center', fontFamily:"'DM Mono',monospace"}}
                  />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>IVA CASSA</label>
                  <select
                    value={mappatura[r.id]?.ivaIndice || ''}
                    onChange={e => setMapp(r.id, 'ivaIndice', parseInt(e.target.value))}
                    style={{width:'100%', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 6px', color:'#eef0f6', fontSize:'0.75rem'}}
                  >
                    <option value="">Scegli</option>
                    {IVA_DITRON_DEFAULT.map(iv => (
                      <option key={iv.indice} value={iv.indice}>{iv.descrizione}</option>
                    ))}
                  </select>
                </div>
        {config.marca === '3i' && (
          <div>
            <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>MODALITÀ</label>
            <div style={{display:'flex', gap:8}}>
              {['MF','RT'].map(m => (
                <button key={m} type="button"
                  onClick={() => setConfig(c => ({...c, modalita: m}))}
                  style={{
                    flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                    background: (config.modalita || 'MF') === m ? '#00e5a0' : '#1a1c24',
                    color: (config.modalita || 'MF') === m ? '#08090c' : '#eef0f6',
                    fontSize:'0.82rem', fontWeight: (config.modalita || 'MF') === m ? 700 : 400,
                  }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salva *//*}
      <button
        onClick={salvaConfig}
        style={{
          padding:'10px 24px', borderRadius:12, border:'none', cursor:'pointer',
          background:'#00e5a0', color:'#08090c',
          fontSize:'0.85rem', fontWeight:700, letterSpacing:0.5
        }}
      >
        ✓ Salva configurazione RT
      </button>
    </div>
  )
}


*/





import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'

const IVA_DITRON_DEFAULT = [
  { indice: 1, descrizione: 'IVA 4%', valore: 4 },
  { indice: 2, descrizione: 'IVA 10%', valore: 10 },
  { indice: 3, descrizione: 'IVA 22%', valore: 22 },
  { indice: 4, descrizione: 'Esente (N4)', valore: 0 },
  { indice: 5, descrizione: 'N1 - Escluse art.15', valore: 0 },
  { indice: 6, descrizione: 'N2 - Non soggette', valore: 0 },
  { indice: 7, descrizione: 'N3 - Non imponibili', valore: 0 },
  { indice: 8, descrizione: 'N5 - Regime margine', valore: 0 },
]

export default function ImpostazioniRT({ reparti, onSave, showToast }) {
  const NEGOZIO_ID = useNegozioId()
  const [config, setConfig] = useState({
    marca: 'ditron',
    modalita: 'MF',
    ip: '',
    porta: '7081',
    matricola: '',
    attivo: false,
    serviceIp: '',
  })
  const [mappatura, setMappatura] = useState({})
  const [testando, setTestando] = useState(false)
  const [statoConnessione, setStatoConnessione] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { caricaConfig() }, [])

  async function caricaConfig() {
    const { data } = await supabase
      .from('negozi')
      .select('rt_config')
      .eq('id', NEGOZIO_ID)
      .single()
    if (data?.rt_config) {
      setConfig({ ...config, ...(data.rt_config.config || {}) })
      setMappatura(data.rt_config.mappatura || {})
    }
    setLoading(false)
  }

  async function salvaConfig() {
    const { error } = await supabase
      .from('negozi')
      .update({ rt_config: { config, mappatura } })
      .eq('id', NEGOZIO_ID)
    if (error) { showToast('⚠ Errore: ' + error.message); return }
    showToast('✓ Configurazione RT salvata')
    if (onSave) onSave({ config, mappatura })
  }

  async function testConnessione() {
    if (!config.ip) { showToast('⚠ Inserisci IP cassa'); return }
    setTestando(true)
    setStatoConnessione(null)
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      let res
      if (isLocalhost) {
        res = await fetch('/api/ditron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: config.ip, porta: config.porta, azione: 'ping', dati: {}, marca: config.marca })
        })
      } else {
        const host = config.serviceIp || 'localhost'
        res = await fetch(`http://${host}:3002`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'rt', marca: config.marca, ip: config.ip, porta: config.porta, azione: 'ping', dati: {} })
        })
      }
      const data = await res.json()
      if (data.ok) { setStatoConnessione('ok'); showToast('✓ Cassa raggiungibile!') }
      else { setStatoConnessione('errore'); showToast('⚠ ' + data.error) }
    } catch (e) {
      setStatoConnessione('errore')
      showToast('⚠ Errore connessione: ' + e.message)
    }
    setTestando(false)
  }

  function setMapp(repartoId, field, value) {
    setMappatura(prev => ({ ...prev, [repartoId]: { ...(prev[repartoId] || {}), [field]: value } }))
  }

  if (loading) return <div style={{color:'#5a5d6e', padding:16}}>Caricamento...</div>

  const inputStyle = { width:'100%', boxSizing:'border-box', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#eef0f6', fontSize:'0.85rem', fontFamily:"'DM Mono',monospace" }
  const labelStyle = { fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4 }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div>
          <label style={labelStyle}>MARCA RT</label>
          <select value={config.marca} onChange={e => setConfig(c => ({...c, marca: e.target.value}))}
            style={{width:'100%', background:'#111318', border:'1px solid #252830', borderRadius:8, padding:'8px 12px', color:'#eef0f6', fontSize:'0.85rem'}}>
            <option value="ditron">Ditron</option>
            <option value="rch">RCH Print!F/RT</option>
            <option value="3i">3i Solution RT</option>
          </select>
        </div>

        {config.marca === '3i' && (
          <div>
            <label style={labelStyle}>MODALITÀ</label>
            <div style={{display:'flex', gap:8}}>
              {['MF','RT'].map(m => (
                <button key={m} type="button" onClick={() => setConfig(c => ({...c, modalita: m}))}
                  style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer', background: (config.modalita||'MF') === m ? '#00e5a0' : '#1a1c24', color: (config.modalita||'MF') === m ? '#08090c' : '#eef0f6', fontSize:'0.82rem', fontWeight: (config.modalita||'MF') === m ? 700 : 400 }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{display:'flex', alignItems:'center', gap:8, paddingTop:20}}>
          <label style={{fontSize:'0.82rem', color:'#5a5d6e'}}>RT Attivo</label>
          <div onClick={() => setConfig(c => ({...c, attivo: !c.attivo}))}
            style={{ width:44, height:24, borderRadius:12, cursor:'pointer', background: config.attivo ? '#00e5a0' : '#252830', position:'relative', transition:'background 0.2s' }}>
            <div style={{ position:'absolute', top:2, left: config.attivo ? 22 : 2, width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s' }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>IP CASSA</label>
          <input type="text" value={config.ip} onChange={e => setConfig(c => ({...c, ip: e.target.value}))}
            placeholder="es. 192.168.1.100" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>PORTA</label>
          <input type="text" value={config.porta} onChange={e => setConfig(c => ({...c, porta: e.target.value}))}
            placeholder="es. 1723" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>IP SERVICE (PC CASSA)</label>
          <input type="text" value={config.serviceIp || ''} onChange={e => setConfig(c => ({...c, serviceIp: e.target.value}))}
            placeholder="es. 172.20.10.2" style={{...inputStyle, color:'#00e5a0'}} />
        </div>

        <div style={{gridColumn:'1/-1'}}>
          <label style={labelStyle}>MATRICOLA RT</label>
          <input type="text" value={config.matricola} onChange={e => setConfig(c => ({...c, matricola: e.target.value.toUpperCase()}))}
            placeholder="es. 3CICE117056" style={{...inputStyle, color:'#ffb830', letterSpacing:2}} />
        </div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <button onClick={testConnessione} disabled={testando || !config.ip}
          style={{ padding:'8px 20px', borderRadius:10, border:'none', cursor:'pointer', background: testando ? '#1a1c24' : '#252830', color: testando ? '#5a5d6e' : '#eef0f6', fontSize:'0.82rem', fontFamily:"'DM Mono',monospace" }}>
          {testando ? '⏳ Test in corso...' : '🔌 Test connessione'}
        </button>
        {statoConnessione === 'ok' && <span style={{color:'#00e5a0', fontSize:'0.82rem'}}>✓ Cassa connessa</span>}
        {statoConnessione === 'errore' && <span style={{color:'#ff4d6a', fontSize:'0.82rem'}}>✗ Non raggiungibile</span>}
      </div>

      {reparti?.length > 0 && (
        <div>
          <div style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, marginBottom:8}}>MAPPATURA REPARTI APP → CASSA</div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {reparti.map(r => (
              <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px', gap:8, alignItems:'center', padding:'8px 12px', background:'#111318', borderRadius:8, border:`1px solid ${r.colore}33` }}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{width:8, height:8, borderRadius:'50%', background:r.colore, flexShrink:0}} />
                  <span style={{fontSize:'0.82rem'}}>{r.nome}</span>
                  <span style={{fontSize:'0.7rem', color:'#5a5d6e'}}>IVA {r.iva}%{r.natura_iva ? ' · ' + r.natura_iva : ''}</span>
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>N° REP. RT</label>
                  <input type="number" min="1" max="16" value={mappatura[r.id]?.numeroRt || ''} onChange={e => setMapp(r.id, 'numeroRt', parseInt(e.target.value))} placeholder="1"
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 8px', color:'#ffb830', fontSize:'0.82rem', textAlign:'center', fontFamily:"'DM Mono',monospace"}} />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>IVA CASSA</label>
                  <select value={mappatura[r.id]?.ivaIndice || ''} onChange={e => setMapp(r.id, 'ivaIndice', parseInt(e.target.value))}
                    style={{width:'100%', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 6px', color:'#eef0f6', fontSize:'0.75rem'}}>
                    <option value="">Scegli</option>
                    {IVA_DITRON_DEFAULT.map(iv => (
                      <option key={iv.indice} value={iv.indice}>{iv.descrizione}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={salvaConfig}
        style={{ padding:'10px 24px', borderRadius:12, border:'none', cursor:'pointer', background:'#00e5a0', color:'#08090c', fontSize:'0.85rem', fontWeight:700, letterSpacing:0.5 }}>
        ✓ Salva configurazione RT
      </button>
    </div>
  )
}