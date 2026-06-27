import { useEffect, useRef, useState } from 'react'

export default function FidelityScanner({ onScan, onClose }) {
  const [inputUsb, setInputUsb] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && inputUsb.trim()) {
      onScan(inputUsb.trim())
      setInputUsb('')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111318', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, border: '1px solid #252830' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#eef0f6' }}>🔌 Scansiona QR Fidelity</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#5a5d6e', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputUsb}
          onChange={e => setInputUsb(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Sparare il QR con il lettore..."
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', background: '#08090c', border: '1px solid #00e5a0',
            borderRadius: 10, padding: '14px', color: '#eef0f6', fontSize: '0.95rem', textAlign: 'center'
          }}
        />
        <div style={{ fontSize: '0.75rem', color: '#5a5d6e', textAlign: 'center', marginTop: 10 }}>
          Tieni il focus su questo campo e spara il codice del cliente
        </div>
      </div>
    </div>
  )
}