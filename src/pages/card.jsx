import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useFidelitySlug } from '@/lib/useFidelitySlug'

export default function CardClienteFidelity() {
  const { slug, pronto } = useFidelitySlug()
  const [negozioId, setNegozioId] = useState(null)
  const [negozioNome, setNegozioNome] = useState('')
  const [cliente, setCliente] = useState(null)
  const [loadingNegozio, setLoadingNegozio] = useState(true)
  const [form, setForm] = useState({ codice: '', password: '' })
  const [errore, setErrore] = useState('')
  const [loadingLogin, setLoadingLogin] = useState(false)

  // 1. Risolvi il negozio dallo slug del sottodominio
  useEffect(() => {
    if (!pronto) return
    if (!slug) { setLoadingNegozio(false); return }
    supabase.from('negozi').select('id, ragione_sociale').eq('slug', slug).single()
      .then(({ data }) => {
        if (data) { setNegozioId(data.id); setNegozioNome(data.ragione_sociale || slug) }
        setLoadingNegozio(false)
      })
  }, [pronto, slug])

  // 2. Se c'è una sessione salvata, ricarica il cliente (per avere i punti aggiornati)
  useEffect(() => {
    if (!negozioId) return
    const salvato = localStorage.getItem('fidelity_cliente_id')
    if (!salvato) return
    supabase.from('fidelity_clienti').select('*').eq('id', salvato).eq('negozio_id', negozioId).single()
      .then(({ data }) => { if (data) setCliente(data) })
  }, [negozioId])

  async function login() {
    setErrore('')
    if (!form.codice.trim() || !form.password.trim()) { setErrore('Inserisci codice e password'); return }
    setLoadingLogin(true)
    const { data, error } = await supabase
      .from('fidelity_clienti')
      .select('*')
      .eq('negozio_id', negozioId)
      .eq('codice_cliente', form.codice.trim().toUpperCase())
      .eq('password', form.password.trim())
      .eq('attivo', true)
      .maybeSingle()
    setLoadingLogin(false)

    if (error || !data) { setErrore('Codice o password non corretti'); return }
    localStorage.setItem('fidelity_cliente_id', data.id)
    setCliente(data)
  }

  function logout() {
    localStorage.removeItem('fidelity_cliente_id')
    setCliente(null)
    setForm({ codice: '', password: '' })
  }

  const pageStyle = {
    minHeight: '100vh', background: '#08090c', color: '#eef0f6',
    fontFamily: "'DM Mono',monospace", display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 20
  }
  const inputStyle = {
    background: '#111318', border: '1px solid #252830', borderRadius: 8,
    padding: '12px 14px', color: '#eef0f6', fontSize: '1rem',
    fontFamily: "'DM Mono',monospace", width: '100%', boxSizing: 'border-box',
    textAlign: 'center', letterSpacing: 1
  }

  if (loadingNegozio) return <div style={pageStyle}>⏳ Caricamento...</div>

  if (!negozioId) return (
    <div style={pageStyle}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 10 }}>⚠️</div>
        <div>Negozio non trovato</div>
      </div>
    </div>
  )

  // ── SCHERMATA: DASHBOARD CLIENTE (loggato) ──
  if (cliente) {
    return (
      <div style={pageStyle}>
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', color: '#00e5a0', marginBottom: 4 }}>{negozioNome}</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 24 }}>
            Ciao, {cliente.nome}! 👋
          </div>

          <div style={{ background: '#111318', borderRadius: 20, padding: 28, border: '1px solid #252830' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${cliente.qr_token}&bgcolor=17-19-24&color=0-229-160`}
              alt="QR Code fidelity"
              style={{ width: 200, height: 200, borderRadius: 12, background: 'white', padding: 8 }}
            />
            <div style={{ marginTop: 20, fontSize: '0.75rem', color: 'white', letterSpacing: 1 }}>
              I TUOI PUNTI
            </div>
            <div style={{ fontSize: '2.4rem', fontWeight: 700, color: '#00e5a0', marginTop: 4 }}>
              {cliente.punti}
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'white', marginTop: 20, lineHeight: 1.5 }}>
            Mostra questo QR alla cassa ad ogni acquisto per accumulare punti.
          </div>

          <button onClick={logout} style={{
            marginTop: 24, padding: '10px 20px', borderRadius: 10, border: '1px solid #252830',
            background: 'transparent', color: 'red', cursor: 'pointer', fontSize: '0.8rem'
          }}>
            Esci
          </button>
        </div>
      </div>
    )
  }

  // ── SCHERMATA: LOGIN ──
  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '0.8rem', color: '#5a5d6e', marginBottom: 4 }}>{negozioNome}</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>💳 Fidelity</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.72rem', color: '#00e5a0', letterSpacing: 1, display: 'block', marginBottom: 6 }}>CODICE CLIENTE</label>
          <input
            type="text" autoFocus value={form.codice}
            onChange={e => setForm(f => ({ ...f, codice: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={inputStyle} placeholder="es. 4821"
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.72rem', color: '#00e5a0', letterSpacing: 1, display: 'block', marginBottom: 6 }}>PASSWORD</label>
          <input
            type="text" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={inputStyle}
          />
        </div>

        {errore && <div style={{ color: '#ff4d6a', fontSize: '0.8rem', marginBottom: 14, textAlign: 'center' }}>{errore}</div>}

        <button onClick={login} disabled={loadingLogin} style={{
          width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: '#00e5a0', color: '#08090c', fontWeight: 700, fontSize: '0.9rem'
        }}>
          {loadingLogin ? '...' : 'Accedi'}
        </button>

        <div style={{ fontSize: '0.72rem', color: '#5a5d6e', textAlign: 'center', marginTop: 16 }}>
          Codice e password ti sono stati dati dal negozio.
        </div>
      </div>
    </div>
  )
}