import { useNegozio } from '@/context/NegozioContext'

export default function ScadutoPage() {
  const { negozio } = useNegozio() || {}

  return (
    <div style={{
      minHeight:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'DM Sans', sans-serif", padding:20
    }}>
      <div style={{
        background:'var(--dc-surface)', border:'1px solid rgba(var(--dc-rosso-rgb), 0.27)',
        borderRadius:20, padding:40, maxWidth:440, width:'100%',
        textAlign:'center', display:'flex', flexDirection:'column', gap:20
      }}>
        <div style={{fontSize:'3rem'}}>🔒</div>
        <div style={{fontSize:'1.4rem', fontWeight:700, color:'var(--dc-rosso)'}}>
          Licenza Scaduta
        </div>
        <div style={{fontSize:'0.9rem', color:'var(--dc-muted)', lineHeight:1.6}}>
          La licenza di <strong style={{color:'var(--dc-text)'}}>{negozio?.nome || 'questo negozio'}</strong> è scaduta.
          Contatta il tuo rivenditore per rinnovare l'abbonamento.
        </div>
        <div style={{
          background:'var(--dc-surface2)', borderRadius:12, padding:16,
          fontSize:'0.82rem', color:'var(--dc-muted)'
        }}>
          <div style={{marginBottom:4}}>Piano: <strong style={{color:'var(--dc-text)'}}>{negozio?.piano || 'trial'}</strong></div>
          <div>Scaduto il: <strong style={{color:'var(--dc-rosso)'}}>
            {negozio?.data_scadenza ? new Date(negozio.data_scadenza).toLocaleDateString('it-IT') : 'N/A'}
          </strong></div>
        </div>
        <div style={{fontSize:'0.82rem', color:'var(--dc-muted)'}}>
          📧 Contatta il supporto per il rinnovo
        </div>
        <button onClick={() => window.location.href = '/'}
          style={{padding:'10px 24px', borderRadius:12, border:'1px solid var(--dc-border)', background:'transparent', color:'var(--dc-muted)', cursor:'pointer', fontSize:'0.82rem'}}>
          ↻ Riprova
        </button>
      </div>
    </div>
  )
}
