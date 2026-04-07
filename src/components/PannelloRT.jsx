/**
 * PannelloRT.jsx — Pannello operativo RT per storico/cassa
 * 
 * Funzioni:
 * 1. Stampa scontrino su RT
 * 2. Chiusura fiscale Z
 * 3. Lettura X parziale
 * 4. Annullo scontrino
 * 5. Ristampa scontrini da DGFE
 */

import { useState } from 'react'

export default function PannelloRT({ rtConfig, mappatura, scontrino, onClose }) {
  const [loading, setLoading] = useState(false)
  const [risultato, setRisultato] = useState(null)
  const [pannelloAperto, setPannelloAperto] = useState(false)

  // Dati annullo
  const [annulloData, setAnnulloData] = useState({ nazz: '', ndoc: '', data: '' })

  // Dati ristampa
  const [ristampaData, setRistampaData] = useState({
    dataInizio: new Date().toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,''),
    dataFine: new Date().toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,''),
    dalNumero: 0,
    alNumero: 0,
  })

  console.log('PannelloRT rtConfig:', rtConfig)
  if (!rtConfig?.ip) return null

  async function chiamaRT(azione, dati) {
    setLoading(true)
    setRisultato(null)
    try {
      const res = await fetch('/api/ditron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: rtConfig.ip, porta: rtConfig.porta, azione, dati })
      })
      const data = await res.json()
      setRisultato(data)
      return data
    } catch (e) {
      setRisultato({ ok: false, error: e.message })
    } finally {
      setLoading(false)
    }
  }

  async function stampaScontrino() {
    if (!scontrino) return
    
    // Arricchisce le righe con i numeri reparto RT dalla mappatura
    const righeConRt = scontrino.righe.map(riga => ({
      ...riga,
      numeroRepartoRt: mappatura[riga.repartoId]?.numeroRt || 1,
      ivaIndice: mappatura[riga.repartoId]?.ivaIndice || 1,
    }))

    await chiamaRT('scontrino', {
      righe: righeConRt,
      metodo: scontrino.metodo,
      totale: scontrino.totale,
      resto: scontrino.resto,
      contatto: scontrino.contatto,
    })
  }

  async function chiusuraFiscale(tipo = 1) {
    if (!confirm(`Eseguire la chiusura fiscale Z ${tipo === 1 ? 'estesa' : tipo === 2 ? 'breve' : 'media'}?\n\nQuesta operazione azzera i totalizzatori giornalieri.`)) return
    await chiamaRT('chiusura_fiscale', { tipo })
  }

  async function letturaX(tipo = 2) {
    await chiamaRT('lettura_x', { tipo })
  }

  async function annulloScontrino() {
    if (!annulloData.nazz || !annulloData.ndoc || !annulloData.data) {
      alert('Compila tutti i dati per l\'annullo')
      return
    }
    if (!confirm('Confermi l\'annullo dello scontrino?\nL\'operazione verrà comunicata all\'Agenzia delle Entrate.')) return
    await chiamaRT('annullo', {
      matricola: rtConfig.matricola,
      numeroAzzeramento: annulloData.nazz,
      numeroDocumento: annulloData.ndoc,
      data: annulloData.data,
    })
  }

  async function ristampaDGFE() {
    await chiamaRT('ristampa', ristampaData)
  }

  const btnStyle = (color = '#252830') => ({
    padding:'10px 16px', borderRadius:10, border:`1px solid ${color}33`,
    cursor: loading ? 'not-allowed' : 'pointer',
    background: color === '#252830' ? '#1a1c24' : color + '22',
    color: color === '#252830' ? '#eef0f6' : color,
    fontSize:'0.82rem', fontFamily:"'DM Mono',monospace",
    opacity: loading ? 0.6 : 1,
    display:'flex', alignItems:'center', gap:8,
  })

  return (
    <div style={{
      position:'fixed', bottom:20, right:20, zIndex:400,
      background:'#111318', border:'1px solid #252830',
      borderRadius:16, overflow:'hidden',
      boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
      width: pannelloAperto ? 360 : 'auto',
    }}>
      
      {/* Header */}
      <div
        onClick={() => setPannelloAperto(!pannelloAperto)}
        style={{
          padding:'12px 16px', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10,
          background:'#1a1c24', borderBottom: pannelloAperto ? '1px solid #252830' : 'none'
        }}
      >
        <div style={{
          width:8, height:8, borderRadius:'50%',
          background: rtConfig.attivo ? '#00e5a0' : '#5a5d6e',
          boxShadow: rtConfig.attivo ? '0 0 8px #00e5a0' : 'none'
        }} />
        <span style={{fontSize:'0.8rem', fontFamily:"'DM Mono',monospace", color:'#eef0f6'}}>
          RT {rtConfig.marca?.toUpperCase()} {rtConfig.ip}
        </span>
        <span style={{marginLeft:'auto', color:'#5a5d6e', fontSize:'0.8rem'}}>
          {pannelloAperto ? '▼' : '▲'}
        </span>
      </div>

      {pannelloAperto && (
        <div style={{padding:16, display:'flex', flexDirection:'column', gap:12}}>

          {/* Stampa scontrino corrente */}
          {scontrino && (
            <div>
              <div style={{fontSize:'0.7rem', color:'#5a5d6e', letterSpacing:1, marginBottom:8}}>SCONTRINO CORRENTE</div>
              <button style={btnStyle('#00e5a0')} onClick={stampaScontrino} disabled={loading}>
                🖨️ Stampa su RT
              </button>
            </div>
          )}

          {/* Chiusure */}
          <div>
            <div style={{fontSize:'0.7rem', color:'#5a5d6e', letterSpacing:1, marginBottom:8}}>CHIUSURE</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <button style={btnStyle('#ffb830')} onClick={() => chiusuraFiscale(1)} disabled={loading}>
                🔒 Chiusura fiscale Z (estesa)
              </button>
              <button style={btnStyle('#ffb830')} onClick={() => chiusuraFiscale(2)} disabled={loading}>
                🔒 Chiusura fiscale Z (breve)
              </button>
              <button style={btnStyle()} onClick={() => letturaX(2)} disabled={loading}>
                📊 Lettura X (parziale)
              </button>
            </div>
          </div>

          {/* Annullo scontrino */}
          <div>
            <div style={{fontSize:'0.7rem', color:'#5a5d6e', letterSpacing:1, marginBottom:8}}>ANNULLO SCONTRINO RT</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6}}>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>N° CHIUSURA</label>
                  <input type="number" value={annulloData.nazz}
                    onChange={e => setAnnulloData(d => ({...d, nazz: e.target.value}))}
                    placeholder="0001"
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 6px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center'}}
                  />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>N° DOC</label>
                  <input type="number" value={annulloData.ndoc}
                    onChange={e => setAnnulloData(d => ({...d, ndoc: e.target.value}))}
                    placeholder="0001"
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 6px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center'}}
                  />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>DATA (DDMMYY)</label>
                  <input type="text" value={annulloData.data}
                    onChange={e => setAnnulloData(d => ({...d, data: e.target.value}))}
                    placeholder="010126"
                    maxLength={6}
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 6px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center', fontFamily:"'DM Mono',monospace"}}
                  />
                </div>
              </div>
              <button style={btnStyle('#ff4d6a')} onClick={annulloScontrino} disabled={loading}>
                🗑️ Annulla scontrino RT
              </button>
            </div>
          </div>

          {/* Ristampa DGFE */}
          <div>
            <div style={{fontSize:'0.7rem', color:'#5a5d6e', letterSpacing:1, marginBottom:8}}>RISTAMPA DA DGFE</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>DA DATA (DDMMYY)</label>
                  <input type="text" value={ristampaData.dataInizio}
                    onChange={e => setRistampaData(d => ({...d, dataInizio: e.target.value}))}
                    maxLength={6}
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 8px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center', fontFamily:"'DM Mono',monospace"}}
                  />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>A DATA (DDMMYY)</label>
                  <input type="text" value={ristampaData.dataFine}
                    onChange={e => setRistampaData(d => ({...d, dataFine: e.target.value}))}
                    maxLength={6}
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 8px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center', fontFamily:"'DM Mono',monospace"}}
                  />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>DA N° SCONTRINO</label>
                  <input type="number" value={ristampaData.dalNumero}
                    onChange={e => setRistampaData(d => ({...d, dalNumero: parseInt(e.target.value)}))}
                    placeholder="0 = tutti"
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 8px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center'}}
                  />
                </div>
                <div>
                  <label style={{fontSize:'0.65rem', color:'#5a5d6e', display:'block', marginBottom:2}}>A N° SCONTRINO</label>
                  <input type="number" value={ristampaData.alNumero}
                    onChange={e => setRistampaData(d => ({...d, alNumero: parseInt(e.target.value)}))}
                    placeholder="0 = tutti"
                    style={{width:'100%', boxSizing:'border-box', background:'#1a1c24', border:'1px solid #252830', borderRadius:6, padding:'4px 8px', color:'#eef0f6', fontSize:'0.75rem', textAlign:'center'}}
                  />
                </div>
              </div>
              <button style={btnStyle()} onClick={ristampaDGFE} disabled={loading}>
                🖨️ Ristampa scontrini
              </button>
            </div>
          </div>

          {/* Risultato */}
          {loading && (
            <div style={{textAlign:'center', color:'#5a5d6e', fontSize:'0.8rem', fontFamily:"'DM Mono',monospace"}}>
              ⏳ Comunicazione con la cassa...
            </div>
          )}
          {risultato && (
            <div style={{
              padding:'10px 12px', borderRadius:8,
              background: risultato.ok ? 'rgba(0,229,160,0.1)' : 'rgba(255,77,106,0.1)',
              border: `1px solid ${risultato.ok ? '#00e5a040' : '#ff4d6a40'}`,
              fontSize:'0.75rem', fontFamily:"'DM Mono',monospace",
              color: risultato.ok ? '#00e5a0' : '#ff4d6a',
              maxHeight:80, overflowY:'auto'
            }}>
              {risultato.ok ? '✓ ' : '✗ '}{risultato.risposta || risultato.error || 'OK'}
            </div>
          )}

        </div>
      )}
    </div>
  )
  
}
