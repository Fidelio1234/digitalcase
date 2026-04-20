import { useNegozio } from '@/context/NegozioContext'

export default function ScadutoPage() {
  const { negozio } = useNegozio() || {}

  return (
    <div style={{
      minHeight:'100vh', background:'#08090c', color:'#eef0f6',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'DM Sans', sans-serif", padding:20
    }}>
      <div style={{
        background:'#111318', border:'1px solid #ff4d6a44',
        borderRadius:20, padding:40, maxWidth:440, width:'100%',
        textAlign:'center', display:'flex', flexDirection:'column', gap:20
      }}>
        <div style={{fontSize:'3rem'}}>🔒</div>
        <div style={{fontSize:'1.4rem', fontWeight:700, color:'#ff4d6a'}}>
          Licenza Scaduta
        </div>
        <div style={{fontSize:'0.9rem', color:'#5a5d6e', lineHeight:1.6}}>
          La licenza di <strong style={{color:'#eef0f6'}}>{negozio?.nome || 'questo negozio'}</strong> è scaduta.
          Contatta il tuo rivenditore per rinnovare l'abbonamento.
        </div>
        <div style={{
          background:'#1a1c24', borderRadius:12, padding:16,
          fontSize:'0.82rem', color:'#5a5d6e'
        }}>
          <div style={{marginBottom:4}}>Piano: <strong style={{color:'#eef0f6'}}>{negozio?.piano || 'trial'}</strong></div>
          <div>Scaduto il: <strong style={{color:'#ff4d6a'}}>
            {negozio?.data_scadenza ? new Date(negozio.data_scadenza).toLocaleDateString('it-IT') : 'N/A'}
          </strong></div>
        </div>
        <div style={{fontSize:'0.82rem', color:'#5a5d6e'}}>
          📧 Contatta il supporto per il rinnovo
        </div>
        <button onClick={() => window.location.href = '/'}
          style={{padding:'10px 24px', borderRadius:12, border:'1px solid #252830', background:'transparent', color:'#5a5d6e', cursor:'pointer', fontSize:'0.82rem'}}>
          ↻ Riprova
        </button>
      </div>
    </div>
  )
}
