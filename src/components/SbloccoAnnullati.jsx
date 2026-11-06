import React, { useState, useRef, useEffect, useCallback } from 'react'

const PRESSIONE_MS = 3000          // tocco lungo per aprire la finestra
const DURATA_SBLOCCO_MS = 5 * 60 * 1000  // lo sblocco scade dopo 5 minuti

export function useSbloccoAnnullati() {
  const [sbloccato, setSbloccato] = useState(false)
  const [aperto, setAperto] = useState(false)
  const [pin, setPin] = useState('')
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const timerPressione = useRef(null)
  const timerScadenza = useRef(null)

  useEffect(() => () => {
    clearTimeout(timerPressione.current)
    clearTimeout(timerScadenza.current)
  }, [])

  const blocca = useCallback(() => {
    clearTimeout(timerScadenza.current)
    setSbloccato(false)
  }, [])

  const fine = useCallback(() => {
    clearTimeout(timerPressione.current)
    timerPressione.current = null
  }, [])

  const inizio = useCallback(() => {
    fine()
    timerPressione.current = setTimeout(() => {
      timerPressione.current = null
      if (sbloccato) { blocca(); return }   // tocco lungo da sbloccato = richiude subito
      setPin(''); setErrore(''); setAperto(true)
    }, PRESSIONE_MS)
  }, [sbloccato, blocca, fine])

  async function conferma() {
    if (invio) return
    setInvio(true); setErrore('')
    try {
      const r = await fetch('/api/verifica-pin-titolare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ pin }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.ok) {
        setAperto(false); setPin('')
        setSbloccato(true)
        clearTimeout(timerScadenza.current)
        timerScadenza.current = setTimeout(() => setSbloccato(false), DURATA_SBLOCCO_MS)
      } else {
        setErrore(j.reason || 'PIN errato'); setPin('')
      }
    } catch {
      setErrore('Errore di rete. Riprova.')
    }
    setInvio(false)
  }

  const pressione = {
    onPointerDown: inizio,
    onPointerUp: fine,
    onPointerLeave: fine,
    onPointerCancel: fine,
    onContextMenu: e => e.preventDefault(),
    style: { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' },
  }

  const modal = aperto ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#1a1c24', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, color: 'white' }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 14 }}>PIN del titolare</div>
        <input
          type="password" inputMode="numeric" autoFocus maxLength={8}
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => { if (e.key === 'Enter' && pin.length === 8) conferma() }}
          placeholder="8 cifre"
          style={{ width: '100%', padding: 12, fontSize: '1.2rem', borderRadius: 10, border: '1px solid #444', background: '#111318', color: 'white', textAlign: 'center', letterSpacing: 6, boxSizing: 'border-box' }}
        />
        {errore && <div style={{ color: '#ff4d6a', marginTop: 10, fontSize: '0.9rem' }}>{errore}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => { setAperto(false); setPin(''); setErrore('') }}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #444', background: 'transparent', color: 'white' }}>
            Annulla
          </button>
          <button onClick={conferma} disabled={invio || pin.length !== 8}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#ffb830', color: '#111', fontWeight: 700, opacity: (invio || pin.length !== 8) ? 0.5 : 1 }}>
            {invio ? '...' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { sbloccato, pressione, modal }
}
