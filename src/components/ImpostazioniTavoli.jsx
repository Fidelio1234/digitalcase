import { useState, useEffect } from 'react'
import { getImpostazioniDb, salvaImpostazioniDb } from '@/lib/supabase-db'

export default function ImpostazioniTavoli({ negozioId, showToast }) {
  const [imp, setImp] = useState({ copertoAbilitato: false, copertoImporto: 200, numeroTavoli: 10, tavoliAbilitati: true, magazzinoAbilitato: false, cortesiaAbilitato: false, asportoAbilitato: false, costoAggiunta: 50, fidelityAbilitato: false, fidelityCentesimiPerPunto: 100, fidelitySogliaPunti: 100, fidelityValoreOmaggio: 500 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getImpostazioniDb(negozioId).then(i => { setImp(i); setLoading(false) })
  }, [])

  async function salva() {
    const ok = await salvaImpostazioniDb(negozioId, imp)
    if (ok) showToast('✓ Impostazioni tavoli salvate')
    else showToast('⚠ Errore salvataggio')
  }

  if (loading) return <div style={{color:'#5a5d6e', padding:16}}>Caricamento...</div>

  const inputStyle = {
    background:'#111318', border:'1px solid #252830', borderRadius:8,
    padding:'8px 12px', color:'#eef0f6', fontSize:'0.85rem',
    fontFamily:"'DM Mono',monospace", width:'100%', boxSizing:'border-box'
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>

      {/* Toggle modulo magazzino */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6'}}>Modulo Magazzino</div>
          <div style={{fontSize:'0.72rem', color:'#00e5a0', marginTop:2}}>Abilita la gestione delle giacenze in cassa</div>
        </div>
        <div onClick={() => setImp(i => ({...i, magazzinoAbilitato: !i.magazzinoAbilitato}))}
          style={{width:44, height:24, borderRadius:12, cursor:'pointer',
            background: imp.magazzinoAbilitato ? '#00e5a0' : '#252830',
            position:'relative', transition:'background 0.2s', flexShrink:0}}>
          <div style={{position:'absolute', top:2, left: imp.magazzinoAbilitato ? 22 : 2,
            width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s'}} />
        </div>
      </div>

      {/* Toggle scontrino cortesia */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6'}}>Scontrino Cortesia</div>
          <div style={{fontSize:'0.72rem', color:'#00e5a0', marginTop:2}}>Abilita stampa scontrino non fiscale per la cucina</div>
        </div>
        <div onClick={() => setImp(i => ({...i, cortesiaAbilitato: !i.cortesiaAbilitato}))}
          style={{width:44, height:24, borderRadius:12, cursor:'pointer',
            background: imp.cortesiaAbilitato ? '#00e5a0' : '#252830',
            position:'relative', transition:'background 0.2s', flexShrink:0}}>
          <div style={{position:'absolute', top:2, left: imp.cortesiaAbilitato ? 22 : 2,
            width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s'}} />
        </div>
      </div>

      {/* Toggle modulo asporto */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6'}}>Modulo Asporto</div>
          <div style={{fontSize:'0.72rem', color:'#5a5d6e', marginTop:2}}>Abilita gestione ordini da asporto</div>
        </div>
        <div onClick={() => setImp(i => ({...i, asportoAbilitato: !i.asportoAbilitato}))}
          style={{width:44, height:24, borderRadius:12, cursor:'pointer',
            background: imp.asportoAbilitato ? '#00e5a0' : '#252830',
            position:'relative', transition:'background 0.2s', flexShrink:0}}>
          <div style={{position:'absolute', top:2, left: imp.asportoAbilitato ? 22 : 2,
            width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s'}} />
        </div>
      </div>

      {/* Costo aggiunta ingrediente */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6'}}>Costo aggiunta ingrediente</div>
          <div style={{fontSize:'0.72rem', color:'#5a5d6e', marginTop:2}}>Importo aggiunto per ogni variante + (es. +funghi)</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{color:'#5a5d6e', fontSize:'0.8rem'}}>€</span>
          <input type="number" min="0" step="10"
            value={(imp.costoAggiunta ?? 50) / 100}
            onChange={e => setImp(i => ({...i, costoAggiunta: Math.round(parseFloat(e.target.value || 0) * 100)}))}
            style={{width:70, background:'#1a1c24', border:'1px solid #252830', borderRadius:8, padding:'6px 8px', color:'#eef0f6', fontSize:'0.85rem', textAlign:'right'}}
          />
        </div>
      </div>

      {/* Toggle modulo tavoli */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6'}}>Modulo Tavoli</div>
          <div style={{fontSize:'0.72rem', color:'#00e5a0', marginTop:2}}>Abilita la gestione dei tavoli in cassa</div>
        </div>
        <div onClick={() => setImp(i => ({...i, tavoliAbilitati: !i.tavoliAbilitati}))}
          style={{width:44, height:24, borderRadius:12, cursor:'pointer',
            background: imp.tavoliAbilitati ? '#00e5a0' : '#252830',
            position:'relative', transition:'background 0.2s', flexShrink:0}}>
          <div style={{position:'absolute', top:2, left: imp.tavoliAbilitati ? 22 : 2,
            width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s'}} />
        </div>
      </div>

      {/* Numero tavoli */}
      <div>
        <label style={{fontSize:'0.72rem', color:'#00e5a0', letterSpacing:1, display:'block', marginBottom:4}}>NUMERO TAVOLI</label>
        <input type="number" min="1" max="100"
          value={imp.numeroTavoli}
          onChange={e => setImp(i => ({...i, numeroTavoli: parseInt(e.target.value)}))}
          style={inputStyle}
        />
      </div>

      {/* Coperto */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#111318', borderRadius:12, border:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600}}>Coperto</div>
          <div style={{fontSize:'0.72rem', color:'#00e5a0', marginTop:2}}>Aggiunge il coperto allo scontrino</div>
        </div>
        <div
          onClick={() => setImp(i => ({...i, copertoAbilitato: !i.copertoAbilitato}))}
          style={{
            width:44, height:24, borderRadius:12, cursor:'pointer',
            background: imp.copertoAbilitato ? '#00e5a0' : '#252830',
            position:'relative', transition:'background 0.2s', flexShrink:0
          }}
        >
          <div style={{
            position:'absolute', top:2,
            left: imp.copertoAbilitato ? 22 : 2,
            width:20, height:20, borderRadius:'50%',
            background:'white', transition:'left 0.2s'
          }} />
        </div>
      </div>

      {/* Importo coperto */}
      {imp.copertoAbilitato && (
        <div>
          <label style={{fontSize:'0.72rem', color:'#5a5d6e', letterSpacing:1, display:'block', marginBottom:4}}>IMPORTO COPERTO (€)</label>
          <input type="text"
            defaultValue={(imp.copertoImporto / 100).toFixed(2)}
            onBlur={e => {
              const val = e.target.value.replace(',', '.')
              const cents = Math.round(parseFloat(val || 0) * 100)
              setImp(i => ({...i, copertoImporto: isNaN(cents) ? 0 : cents}))
            }}
            style={inputStyle}
            placeholder="es. 1.50"
          />
          <div style={{fontSize:'0.7rem', color:'#5a5d6e', marginTop:4}}>
            € {(imp.copertoImporto / 100).toFixed(2)} per persona
          </div>
        </div>
      )}

     {/* Toggle modulo fidelity */}
     <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #252830'}}>
        <div>
          <div style={{fontSize:'0.85rem', fontWeight:600, color:'#eef0f6'}}>Modulo Fidelity</div>
          <div style={{fontSize:'0.72rem', color:'#00e5a0', marginTop:2}}>Abilita la tessera fedeltà con punti e QR code</div>
        </div>
        <div onClick={() => setImp(i => ({...i, fidelityAbilitato: !i.fidelityAbilitato}))}
          style={{width:44, height:24, borderRadius:12, cursor:'pointer',
            background: imp.fidelityAbilitato ? '#00e5a0' : '#252830',
            position:'relative', transition:'background 0.2s', flexShrink:0}}>
          <div style={{position:'absolute', top:2, left: imp.fidelityAbilitato ? 22 : 2,
            width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s'}} />
        </div>
      </div>

      {/* Configurazione punti fidelity */}
      {imp.fidelityAbilitato && (
        <div style={{display:'flex', flexDirection:'column', gap:14, padding:'12px 16px', background:'#111318', borderRadius:12, border:'1px solid #252830'}}>
          <div>
            <label style={{fontSize:'0.72rem', color:'#00e5a0', letterSpacing:1, display:'block', marginBottom:4}}>1 PUNTO OGNI QUANTI EURO SPESI</label>
            <input type="text"
              defaultValue={(imp.fidelityCentesimiPerPunto / 100).toFixed(2)}
              onBlur={e => {
                const val = e.target.value.replace(',', '.')
                const cents = Math.round(parseFloat(val || 0) * 100)
                setImp(i => ({...i, fidelityCentesimiPerPunto: isNaN(cents) || cents <= 0 ? 100 : cents}))
              }}
              style={inputStyle}
              placeholder="es. 0.50 = 1 punto ogni 50 centesimi"
            />
            <div style={{fontSize:'0.7rem', color:'#5a5d6e', marginTop:4}}>
              Esempio: con € {(imp.fidelityCentesimiPerPunto / 100).toFixed(2)}, una spesa di 10€ accredita {Math.floor(1000 / imp.fidelityCentesimiPerPunto)} punti
            </div>
          </div>

          <div>
            <label style={{fontSize:'0.72rem', color:'#00e5a0', letterSpacing:1, display:'block', marginBottom:4}}>SOGLIA PUNTI PER OMAGGIO</label>
            <input type="number" min="1"
              value={imp.fidelitySogliaPunti}
              onChange={e => setImp(i => ({...i, fidelitySogliaPunti: parseInt(e.target.value) || 1}))}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{fontSize:'0.72rem', color:'#00e5a0', letterSpacing:1, display:'block', marginBottom:4}}>VALORE OMAGGIO (€)</label>
            <input type="text"
              defaultValue={(imp.fidelityValoreOmaggio / 100).toFixed(2)}
              onBlur={e => {
                const val = e.target.value.replace(',', '.')
                const cents = Math.round(parseFloat(val || 0) * 100)
                setImp(i => ({...i, fidelityValoreOmaggio: isNaN(cents) ? 0 : cents}))
              }}
              style={inputStyle}
              placeholder="es. 5.00"
            />
            <div style={{fontSize:'0.7rem', color:'#5a5d6e', marginTop:4}}>
              Al raggiungimento di {imp.fidelitySogliaPunti} punti: € {(imp.fidelityValoreOmaggio / 100).toFixed(2)} di omaggio, poi i punti tornano a zero
            </div>
          </div>
        </div>
      )}

      <button onClick={salva} style={{
        padding:'10px 24px', borderRadius:12, border:'none', cursor:'pointer',
        background:'#00e5a0', color:'#08090c', fontSize:'0.85rem', fontWeight:700
      }}>
        ✓ Salva impostazioni tavoli
      </button>
    </div>
  )
}
