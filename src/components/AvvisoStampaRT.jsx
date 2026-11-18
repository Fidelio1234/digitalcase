import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  ESITI_SCONTRINO, ESITI_SCONTRINO_RT, EVENTO_PROBLEMA_STAMPA,
  EVENTO_RIFAI_SCONTRINO, CHIAVE_DA_RIFARE,
  leggiProblemiStampa, rimuoviPrimoProblemaStampa,
} from '@/lib/scontrino3i'

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

// Avviso a tutto schermo quando la cassa non ha emesso uno scontrino.
// Va montato una sola volta in _app.jsx: resta visibile anche se si cambia pagina.
export default function AvvisoStampaRT() {
  const [problemi, setProblemi] = useState([])
  const router = useRouter()

  useEffect(() => {
    const aggiorna = () => setProblemi(leggiProblemiStampa())
    aggiorna()
    window.addEventListener(EVENTO_PROBLEMA_STAMPA, aggiorna)
    return () => window.removeEventListener(EVENTO_PROBLEMA_STAMPA, aggiorna)
  }, [])

  if (problemi.length === 0) return null
  const p = problemi[0]

  // Ricarica in cassa le righe dello scontrino non uscito, cosi' il cassiere non ribatte tutto.
  // Con la carta finita NON si propone: la cassa completa da sola la stampa e ne uscirebbero due.
  const puoRifare = Array.isArray(p.righe) && p.righe.length > 0 && p.tipoRt !== 'carta_finita'
  function rifaiScontrino() {
    try { sessionStorage.setItem(CHIAVE_DA_RIFARE, JSON.stringify(p.righe)) } catch (e) {}
    rimuoviPrimoProblemaStampa()
    if (router.pathname === '/cassa') window.dispatchEvent(new Event(EVENTO_RIFAI_SCONTRINO))
    else router.push('/cassa')
  }
  const esito = (p.tipoRt && ESITI_SCONTRINO_RT[p.tipoRt]) || ESITI_SCONTRINO[p.esito] || ESITI_SCONTRINO.cassa_non_risponde
  // Dettaglio tecnico della cassa (es. "Errore cassa E12"): non serve se il testo spiega gia' tutto
  const mostraDettaglio = !!p.dettaglio && !['carta_finita', 'coperchio_aperto'].includes(p.tipoRt)
  const ora = p.ora ? new Date(p.ora).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#111318', border: '2px solid #ff4d6a', borderRadius: 20,
        padding: '32px 36px', maxWidth: 480, width: '100%', textAlign: 'center',
        fontFamily: "'DM Mono',monospace", color: '#eef0f6',
        boxShadow: '0 0 48px rgba(255,77,106,0.25)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
          border: '2px solid #ff4d6a', color: '#ff4d6a', fontSize: '2.2rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✗</div>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ff4d6a', letterSpacing: 1 }}>{esito.titolo}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '14px 0 4px' }}>
          € {fmt(p.totale || 0)}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#9a9db0', marginBottom: 16 }}>
          {p.metodo === 'carta' ? 'Carta / POS' : p.metodo === 'nonriscosso' ? 'Non riscosso' : p.metodo === 'seguefattura' ? 'Segue fattura' : 'Contanti'}
          {ora ? ` · ore ${ora}` : ''}
        </div>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: mostraDettaglio ? 10 : 22 }}>{esito.testo}</div>
        {mostraDettaglio && (
          <div style={{ fontSize: '0.72rem', color: '#9a9db0', marginBottom: 22, wordBreak: 'break-word' }}>{p.dettaglio}</div>
        )}
        {problemi.length > 1 && (
          <div style={{ fontSize: '0.75rem', color: '#ffb830', marginBottom: 14 }}>
            Altri avvisi in coda: {problemi.length - 1}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={rimuoviPrimoProblemaStampa} style={{
            padding: '12px 28px', borderRadius: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid #4a4d5e',
            color: '#eef0f6', fontWeight: 700, fontSize: '1rem',
          }}>OK</button>
          {puoRifare && (
            <button onClick={rifaiScontrino} style={{
              padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#ff4d6a', color: '#08090c', fontWeight: 700, fontSize: '1rem',
            }}>Rifai lo scontrino</button>
          )}
        </div>
      </div>
    </div>
  )
}