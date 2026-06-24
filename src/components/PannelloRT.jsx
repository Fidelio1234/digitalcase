
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { NEGOZIO_ID } from '@/lib/config'

// Helper: chiama il registratore via service locale (produzione) o API (sviluppo)
async function callRT(marca, body) {
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocalhost) {
    const endpoint = marca === 'rch' ? '/api/rch' : '/api/ditron'
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.json()
  } else {
    console.log('callRT produzione - chiamata a localhost:3002')
    const res = await fetch('http://localhost:3002', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'rt', marca, ...body }) })
    return res.json()
  }
}

export default function PannelloRT({ rtConfig, mappatura, scontrino, onClose, onStampa }) {
  const [loading, setLoading] = useState(false)
  const [conferma, setConferma] = useState(null)
  const [risultato, setRisultato] = useState(null)
  const [pannelloAperto, setPannelloAperto] = useState(false)
  const [annulloData, setAnnulloData] = useState({ nazz: '', ndoc: '', data: '' })
  const [ristampaData, setRistampaData] = useState({
    dataInizio: new Date().toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,''),
    dataFine: new Date().toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,''),
    dalNumero: 0,
    alNumero: 0,
  })

  if (!rtConfig?.ip) return null

  async function chiamaRT(azione, dati) {
    setLoading(true)
    setRisultato(null)
    try {
      let data

      if (rtConfig.marca === 'rch') {
        let comandi = []
        if (azione === 'chiusura_fiscale') {
          comandi = ['=C3', '=C10']
        } else if (azione === 'lettura_x') {
          comandi = ['=C2', '=C10']
        } else if (azione === 'ristampa') {
          // RCH: stampa DGFE integrale in Z (range specifico non supportato)
          comandi = ['=C3', '=C450/$1']
        } else if (azione === 'annullo') {
          // RCH RT: =k/&ddmmyy/[nazzeramento/]ndocumento
          comandi = [`=k/&${dati.data}/[${dati.numeroAzzeramento}/]${dati.numeroDocumento}`]
        } else if (azione === 'scontrino' && dati?.righe) {
          const mapp = rtConfig.mappatura || {}
          for (const riga of dati.righe) {
            const ivaIndice = mapp[riga.repartoId]?.ivaIndice || 1
            const importoCents = Math.round(riga.importo)
            const descr = (riga.nome || '').replace(/[()\/]/g, ' ').substring(0, 36)
            if (riga.quantita > 1) comandi.push(`=R${ivaIndice}/$${importoCents}/*${riga.quantita}/(${descr})`)
            else comandi.push(`=R${ivaIndice}/$${importoCents}/(${descr})`)
          }
          if (dati.metodo === 'carta') comandi.push('=T4')
          else comandi.push('=T1')
        }
        data = await callRT('rch', { ip: rtConfig.ip, porta: rtConfig.porta || 80, comandi })
      } else {
        // Ditron/3i — costruisci comando prima di inviare
        let cmd = null

        if (azione === 'annullo') {
          if (rtConfig.marca === '3i') {
            // 3i: prima verifica stato con 50F, poi annulla con 52F
            // formato: "zzzz-ssss"52F dove zzzz=num azzeramento, ssss=num scontrino
            const nazz = String(dati.numeroAzzeramento).padStart(4, '0')
            const ndoc = String(dati.numeroDocumento).padStart(4, '0')
            cmd = `"${nazz}-${ndoc}"52F`
          } else {
            cmd = `docannullo mat='${dati.matricola}', nazz=${dati.numeroAzzeramento}, ndoc=${dati.numeroDocumento}, data=${dati.data}`
          }
        } else if (azione === 'ristampa') {
          if (rtConfig.marca === '3i') {
            // formato 15F: "aammgg00001 00030"15F — 16 caratteri: data(6) + n_da(5) + n_a(5)
            // Converte DDMMYY -> YYMMDD
            const fmtData3i = (d) => {
              if (!d || d.length !== 6) return '000000'
              return d.slice(4,6) + d.slice(2,4) + d.slice(0,2) // DDMMYY -> YYMMDD
            }
            const data = fmtData3i(dati.dataInizio)
            const n1 = String(dati.dalNumero || 0).padStart(5, '0')
            const n2 = String(dati.alNumero || 65535).padStart(5, '0')
            cmd = `"${data}${n1}${n2}"15F`
          } else {
            // Ditron: ristampa DGFE per range date
            cmd = `dgfe tipo=160, datada=${dati.dataInizio}, dataa=${dati.dataFine}, nda=${dati.dalNumero}, na=${dati.alNumero}`
          }
        }
      
        data = await callRT(rtConfig.marca || 'ditron', {
          ip: rtConfig.ip, porta: rtConfig.porta,
          azione: cmd ? 'raw' : azione,
          dati: cmd ? { cmd } : dati,
          marca: rtConfig.marca, modalita: rtConfig.modalita || 'MF'
        })
      }

      setRisultato(data)
      return data
    } catch (e) {
      const result = { ok: false, error: e.message }
      setRisultato(result)
      return result
    } finally {
      setLoading(false)
    }
  }

  async function stampaScontrino() {
    if (!scontrino) return
    const righeConRt = scontrino.righe.map(riga => ({
      ...riga,
      numeroRepartoRt: mappatura[riga.repartoId]?.numeroRt || 1,
      ivaIndice: mappatura[riga.repartoId]?.ivaIndice || 1,
    }))
    const res = await chiamaRT('scontrino', {
      righe: righeConRt,
      metodo: scontrino.metodo,
      totale: scontrino.totale,
      resto: scontrino.resto,
      contatto: scontrino.contatto,
    })
    if (res?.ok && onStampa) {
      setPannelloAperto(false)
      onStampa()
    }
  }

  function chiusuraFiscale(tipo) {
    const tipoLabel = tipo === 1 ? 'semplice' : tipo === 2 ? 'con report reparti+IVA' : 'media'
    setConferma({
      titolo: 'Chiusura Fiscale Z',
      messaggio: 'Eseguire la chiusura fiscale Z ' + tipoLabel + '? Questa operazione azzera i totalizzatori giornalieri.',
      colore: '#ffb830',
      onConferma: async () => {
        const res = await chiamaRT('chiusura_fiscale', { tipo })
        await salvaChiusura(res?.ok ? 'inviata' : 'non_inviata')
      }
    })
  }

  async function salvaChiusura(stato) {
    const ora = new Date().toISOString()
    const oggi = ora.split('T')[0]
    const { data: ultimaChiusura } = await supabase
      .from('chiusure').select('timestamp_chiusura')
      .eq('negozio_id', NEGOZIO_ID)
      .order('timestamp_chiusura', { ascending: false })
      .limit(1).maybeSingle()
    const dataFrom = ultimaChiusura?.timestamp_chiusura || (oggi + 'T00:00:00')
    const { data: scontrini } = await supabase
      .from('scontrini').select('totale, metodo')
      .eq('negozio_id', NEGOZIO_ID)
      .gt('timestamp_emissione', dataFrom)
      .lte('timestamp_emissione', ora)
    const totaleGiornaliero = scontrini?.reduce((a, s) => a + s.totale, 0) || 0
    const totaleCarte = scontrini?.filter(s => s.metodo === 'carta').reduce((a, s) => a + s.totale, 0) || 0
    const totaleContanti = scontrini?.filter(s => s.metodo === 'contanti').reduce((a, s) => a + s.totale, 0) || 0
    const numeroScontrini = scontrini?.length || 0
    const { data: cont } = await supabase
      .from('contatori').select('chiusure')
      .eq('negozio_id', NEGOZIO_ID).eq('data', oggi).single()
    const numChiusura = (cont?.chiusure || 0) + 1
    await supabase.from('chiusure').insert({
      negozio_id: NEGOZIO_ID, numero_chiusura: numChiusura, stato,
      timestamp_chiusura: ora, numero_scontrini: numeroScontrini,
      totale_giornaliero: totaleGiornaliero, totale_carte: totaleCarte,
      totale_contanti: totaleContanti, totale_iva: {},
    })
    await supabase.from('contatori').upsert({
      negozio_id: NEGOZIO_ID, data: oggi,
      chiusure: numChiusura, scontrini: cont?.scontrini || 0,
    })
  }

  async function letturaX(tipo) {
    await chiamaRT('lettura_x', { tipo })
  }

  function annulloScontrino() {
    if (!annulloData.nazz || !annulloData.ndoc || !annulloData.data) {
      setConferma({
        titolo: 'Dati mancanti',
        messaggio: 'Compila N° Chiusura, N° Documento e Data prima di procedere.',
        colore: '#ffb830', onConferma: null
      })
      return
    }
    setConferma({
      titolo: 'Annullo Scontrino RT',
      messaggio: 'Confermi annullo scontrino n° ' + annulloData.ndoc + ' chiusura ' + annulloData.nazz + '? Operazione comunicata AdE.',
      colore: '#ff4d6a',
      onConferma: () => chiamaRT('annullo', {
        matricola: rtConfig.matricola,
        numeroAzzeramento: annulloData.nazz,
        numeroDocumento: annulloData.ndoc,
        data: annulloData.data,
      })
    })
  }

  async function ristampaDGFE() {
    await chiamaRT('ristampa', ristampaData)
  }

  const btnStyle = (color) => {
    const c = color || '#252830'
    return {
      padding:'10px 16px', borderRadius:10,
      border:'1px solid ' + c + '44',
      cursor: loading ? 'not-allowed' : 'pointer',
      background: c === '#252830' ? '#1a1c24' : c + '22',
      color: c === '#252830' ? '#eef0f6' : c,
      fontSize:'0.82rem', fontFamily:"'DM Mono',monospace",
      opacity: loading ? 0.6 : 1,
      display:'flex', alignItems:'center', gap:8,
    }
  }

  const inputStyle = {
    width:'100%', boxSizing:'border-box',
    background:'#1a1c24', border:'1px solid #252830',
    borderRadius:6, padding:'4px 8px',
    color:'#00ff00', fontSize:'1.1rem', textAlign:'center',
    fontFamily:"'DM Mono',monospace"
  }

  return (
    <div style={{ position:'fixed', top:8, left:220, zIndex:400 }}>
      <div onClick={() => setPannelloAperto(!pannelloAperto)} style={{
        padding:'8px 14px', cursor:'pointer',
        display:'flex', alignItems:'center', gap:8,
        background:'#1a1c24', borderRadius:10, border:'1px solid #252830',
      }}>
        <div style={{
          width:8, height:8, borderRadius:'50%',
          background: rtConfig.attivo ? '#00e5a0' : '#5a5d6e',
          boxShadow: rtConfig.attivo ? '0 0 8px #00e5a0' : 'none'
        }} />
        <span style={{fontSize:'0.78rem', fontFamily:"'DM Mono',monospace", color:'yellow'}}>
          MENU RT {rtConfig.marca?.toUpperCase()}
        </span>
        <span style={{color:'#5a5d6e', fontSize:'0.75rem'}}>{pannelloAperto ? '▼' : '▲'}</span>
      </div>

      {pannelloAperto && (
        <div style={{
          position:'fixed', inset:0, zIndex:500,
          background:'rgba(8,9,12,0.85)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={() => setPannelloAperto(false)}>
          <div style={{
            background:'#111318', border:'1px solid #252830',
            borderRadius:20, padding:24,
            width:520, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto',
            boxShadow:'0 24px 64px rgba(0,0,0,0.7)',
            display:'flex', flexDirection:'column', gap:14,
          }} onClick={e => e.stopPropagation()}>

            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{color:'yellow', fontSize:'2rem'}}>MENU RT - {rtConfig.marca?.toUpperCase()}</div>
              <button onClick={() => setPannelloAperto(false)}
                style={{background:'transparent', border:'none', color:'red', cursor:'pointer', fontSize:'1.2rem'}}>X</button>
            </div>

            {scontrino && (
              <div>
                <div style={{fontSize:'0.7rem', color:'#ffffff', letterSpacing:1, marginBottom:8}}>SCONTRINO CORRENTE</div>
                <button style={btnStyle('#00e5a0')} onClick={stampaScontrino} disabled={loading}>Stampa su RT</button>
              </div>
            )}

            <div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                <div style={{width:'100%', color:'#ffb830'}}>CHIUSURE FISCALI</div>
                <button style={btnStyle('#ffb830')} onClick={() => chiusuraFiscale(1)} disabled={loading}>Chiusura fiscale Z (semplice)</button>
<button style={btnStyle('#ffb830')} onClick={() => chiusuraFiscale(2)} disabled={loading}>Chiusura fiscale Z (con report reparti+IVA)</button>
                <br/>
                <div style={{width:'100%', color:'#ffb830'}}>LETTURA PARZIALE</div>
                <button style={btnStyle('#ffb830')} onClick={() => letturaX(2)} disabled={loading}>Lettura X (parziale)</button>
              </div>
            </div>
            <br/>

            <div>
              <div style={{width:'100%', color:'#ff4d6a'}}>ANNULLO SCONTRINO RT</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6}}>
                <div>
                  <label style={{fontSize:'12px', color:'#ff4d6a'}}>N° CHIUSURA</label>
                  <input type="number" value={annulloData.nazz}
                    onChange={e => setAnnulloData(d => ({...d, nazz: e.target.value}))}
                    placeholder="0001" style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'#ff4d6a'}}>N° DOCUMENTO</label>
                  <input type="number" value={annulloData.ndoc}
                    onChange={e => setAnnulloData(d => ({...d, ndoc: e.target.value}))}
                    placeholder="0001" style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'#ff4d6a'}}>DATA (DDMMYY)</label>
                  <input type="text" value={annulloData.data}
                    onChange={e => setAnnulloData(d => ({...d, data: e.target.value}))}
                    placeholder="010126" maxLength={6} style={inputStyle} />
                </div>
              </div>
              <button style={btnStyle('#ff4d6a')} onClick={annulloScontrino} disabled={loading}>Annulla scontrino RT</button>
            </div>
            <br/>

            <div>
              <div style={{width:'100%', color:'#00ff00'}}>RISTAMPA DA DGFE</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6}}>
                <div>
                  <label style={{fontSize:'12px', color:'#00ff00'}}>DA DATA (DDMMYY)</label>
                  <input type="text" value={ristampaData.dataInizio}
                    onChange={e => setRistampaData(d => ({...d, dataInizio: e.target.value}))}
                    maxLength={6} style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'#00ff00'}}>A DATA (DDMMYY)</label>
                  <input type="text" value={ristampaData.dataFine}
                    onChange={e => setRistampaData(d => ({...d, dataFine: e.target.value}))}
                    maxLength={6} style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'#00ff00'}}>DA N° SCONTRINO</label>
                  <input type="number" value={ristampaData.dalNumero}
                    onChange={e => setRistampaData(d => ({...d, dalNumero: parseInt(e.target.value)}))}
                    placeholder="0 = tutti" style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'#00ff00'}}>A N° SCONTRINO</label>
                  <input type="number" value={ristampaData.alNumero}
                    onChange={e => setRistampaData(d => ({...d, alNumero: parseInt(e.target.value)}))}
                    placeholder="0 = tutti" style={inputStyle} />
                </div>
              </div>
              <button style={btnStyle('#00ff00')} onClick={ristampaDGFE} disabled={loading}>Ristampa scontrini</button>
            </div>

            {loading && (
              <div style={{textAlign:'center', color:'#5a5d6e', fontSize:'0.8rem'}}>⏳ Comunicazione con la cassa...</div>
            )}
            {risultato && (
              <div style={{
                padding:'10px 12px', borderRadius:8,
                background: risultato.ok ? 'rgba(0,229,160,0.1)' : 'rgba(255,77,106,0.1)',
                border: '1px solid ' + (risultato.ok ? '#00e5a040' : '#ff4d6a40'),
                fontSize:'0.75rem', fontFamily:"'DM Mono',monospace",
                color: risultato.ok ? '#00e5a0' : '#ff4d6a',
              }}>
                {risultato.ok ? '✓ ' : '✗ '}{risultato.risposta || risultato.error || 'OK'}
              </div>
            )}
          </div>
        </div>
      )}

      {conferma && (
        <div style={{
          position:'fixed', inset:0, zIndex:600,
          background:'rgba(8,9,12,0.92)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{
            background:'#111318', border:'1px solid ' + conferma.colore + '44',
            borderRadius:20, padding:28, width:380, maxWidth:'90vw',
            display:'flex', flexDirection:'column', gap:16,
          }}>
            <div style={{fontSize:'1rem', fontWeight:700, color:'#eef0f6'}}>{conferma.titolo}</div>
            <div style={{fontSize:'0.82rem', color:'#aeb0bc', lineHeight:1.6}}>{conferma.messaggio}</div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={() => setConferma(null)} style={{
                flex:1, padding:'10px', borderRadius:10,
                border:'1px solid #252830', background:'transparent',
                color:'#eef0f6', cursor:'pointer', fontSize:'0.85rem'
              }}>Annulla</button>
              {conferma.onConferma && (
                <button onClick={() => { setConferma(null); conferma.onConferma() }} style={{
                  flex:1, padding:'10px', borderRadius:10,
                  border:'none', background:conferma.colore,
                  color:'#08090c', cursor:'pointer', fontSize:'0.85rem', fontWeight:700
                }}>Conferma</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}