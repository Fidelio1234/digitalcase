import { useRef, useState } from 'react'

const LATO_MAX = 600
const QUALITA = [0.82, 0.7, 0.55, 0.4]
const MAX_BYTE = 280 * 1024

// Ridimensiona nel browser: la foto del telefono passa da qualche MB a poche decine di KB
async function preparaImmagine(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) throw new Error('Il file scelto non è un\'immagine')
  const bitmap = await createImageBitmap(file)
  const scala = Math.min(1, LATO_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scala))
  const h = Math.max(1, Math.round(bitmap.height * scala))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  if (bitmap.close) bitmap.close()

  let tipo = 'image/webp'
  if (!canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp')) {
    // Browser senza WebP: ripiego su JPEG con sfondo bianco
    tipo = 'image/jpeg'
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  let dataUrl = ''
  for (const q of QUALITA) {
    dataUrl = canvas.toDataURL(tipo, q)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (base64.length * 0.75 <= MAX_BYTE) return dataUrl
  }
  throw new Error('La foto è troppo pesante anche dopo la riduzione')
}

export default function ImmagineProdotto({ value, onChange }) {
  const inputRef = useRef(null)
  const [caricamento, setCaricamento] = useState(false)
  const [errore, setErrore] = useState('')
  const [sopra, setSopra] = useState(false)

  async function gestisciFile(file) {
    if (!file) return
    setErrore('')
    setCaricamento(true)
    try {
      const dataUrl = await preparaImmagine(file)
      const res = await fetch('/api/prodotto-immagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immagine: dataUrl }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) throw new Error(json.error || 'Caricamento non riuscito')
      onChange(json.url)
    } catch (e) {
      setErrore(e.message || 'Caricamento non riuscito')
    }
    setCaricamento(false)
  }

  function alRilascio(e) {
    e.preventDefault()
    setSopra(false)
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    gestisciFile(file)
  }

  return (
    <div>
      <div
        onClick={() => !caricamento && inputRef.current && inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setSopra(true) }}
        onDragLeave={() => setSopra(false)}
        onDrop={alRilascio}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
          padding: 12, borderRadius: 12,
          border: '2px dashed ' + (sopra ? '#00e5a0' : '#3a3d4e'),
          background: sopra ? 'rgba(0,229,160,0.08)' : 'transparent',
        }}
      >
        {value ? (
          <img src={value} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 84, height: 84, borderRadius: 10, background: '#1a1c26', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>📷</div>
        )}
        <div style={{ fontSize: '0.85rem', color: '#9a9db0', lineHeight: 1.4 }}>
          {caricamento
            ? 'Caricamento in corso…'
            : value
              ? 'Trascina un\'altra foto qui oppure clicca per cambiarla'
              : 'Trascina qui la foto oppure clicca per sceglierla dal computer'}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { gestisciFile(e.target.files && e.target.files[0]); e.target.value = '' }}
        />
      </div>
      {value && !caricamento && (
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#ff4d6a', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
        >
          Rimuovi foto
        </button>
      )}
      {errore && <div style={{ marginTop: 8, color: '#ff4d6a', fontSize: '0.8rem' }}>⚠ {errore}</div>}
    </div>
  )
}
