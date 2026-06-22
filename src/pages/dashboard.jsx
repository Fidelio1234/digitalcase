import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import Head from 'next/head'

function getSlug() {
  if (typeof window === 'undefined') return 'dmi'
  const hn = window.location.hostname
  if (hn === 'localhost' || hn === '127.0.0.1') return process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
  return hn.replace('.digitalcase.it', '')
}

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function fmtOra(iso) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

const COLORI = ['#00e5a0', '#6482ff', '#ffb830', '#ff4d6a', '#a78bfa', '#34d399', '#fb923c', '#38bdf8']
const PERIODI = ['giorno', 'settimana', 'mese', 'anno']

export default function DashboardPage() {
  const router = useRouter()
  const [autenticato, setAutenticato] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [erroreLogin, setErroreLogin] = useState('')
  const [negozioId, setNegozioId] = useState(null)
  const [negozioNome, setNegozioNome] = useState('')
  const [loading, setLoading] = useState(false)

  const [filtroData, setFiltroData] = useState(() => new Date().toISOString().split('T')[0])
  const [periodoGrafico, setPeriodoGrafico] = useState('giorno')
  const [scontrini, setScontrini] = useState([])
  const [scontriniGrafico, setScontriniGrafico] = useState([])
  const [tavoli, setTavoli] = useState([])
  const [loadingDati, setLoadingDati] = useState(false)

  useEffect(() => {
    const auth = sessionStorage.getItem('dashboard_auth')
    if (auth) {
      const parsed = JSON.parse(auth)
      setNegozioId(parsed.negozioId)
      setNegozioNome(parsed.negozioNome)
      setAutenticato(true)
    }
  }, [])

  useEffect(() => {
    if (autenticato && negozioId) {
      caricaDati()
    }
  }, [autenticato, negozioId, filtroData, periodoGrafico])

  async function login() {
    if (!passwordInput.trim()) return
    setLoading(true)
    setErroreLogin('')
    const slug = getSlug()
    const { data: neg } = await supabase
      .from('negozi')
      .select('id, ragione_sociale, dashboard_password')
      .eq('slug', slug)
      .single()

    if (!neg) { setErroreLogin('Negozio non trovato'); setLoading(false); return }
    if (!neg.dashboard_password) { setErroreLogin('Dashboard non configurata — contatta il tecnico'); setLoading(false); return }
    if (neg.dashboard_password !== passwordInput.trim()) {
      setErroreLogin('Password errata')
      setLoading(false)
      return
    }

    sessionStorage.setItem('dashboard_auth', JSON.stringify({ negozioId: neg.id, negozioNome: neg.ragione_sociale || 'Negozio' }))
    setNegozioId(neg.id)
    setNegozioNome(neg.ragione_sociale || 'Negozio')
    setAutenticato(true)
    setLoading(false)
  }

  function getRangeGrafico() {
    const giorno = new Date(filtroData)
    const dataFineGiorno = filtroData + 'T23:59:59.999Z'

    if (periodoGrafico === 'giorno') {
      return { inizio: filtroData + 'T00:00:00.000Z', fine: dataFineGiorno }
    }
    if (periodoGrafico === 'settimana') {
      const inizio = new Date(giorno)
      inizio.setDate(giorno.getDate() - 6)
      return { inizio: inizio.toISOString().split('T')[0] + 'T00:00:00.000Z', fine: dataFineGiorno }
    }
    if (periodoGrafico === 'mese') {
      const inizio = new Date(giorno.getFullYear(), giorno.getMonth(), 1)
      return { inizio: inizio.toISOString().split('T')[0] + 'T00:00:00.000Z', fine: dataFineGiorno }
    }
    if (periodoGrafico === 'anno') {
      const inizio = new Date(giorno.getFullYear(), 0, 1)
      return { inizio: inizio.toISOString().split('T')[0] + 'T00:00:00.000Z', fine: dataFineGiorno }
    }
    return { inizio: filtroData + 'T00:00:00.000Z', fine: dataFineGiorno }
  }

  async function caricaDati() {
    setLoadingDati(true)
    const dataInizio = filtroData + 'T00:00:00.000Z'
    const dataFine = filtroData + 'T23:59:59.999Z'
    const rangeGrafico = getRangeGrafico()

    const [{ data: sc }, { data: tav }, { data: scGraf }] = await Promise.all([
      supabase
        .from('scontrini')
        .select('*, righe_scontrino(*)')
        .eq('negozio_id', negozioId)
        .gte('timestamp_emissione', dataInizio)
        .lte('timestamp_emissione', dataFine)
        .order('timestamp_emissione', { ascending: true }),
      supabase
        .from('tavoli')
        .select('*')
        .eq('negozio_id', negozioId)
        .eq('stato', 'occupato'),
      supabase
        .from('scontrini')
        .select('totale, timestamp_emissione, annullato')
        .eq('negozio_id', negozioId)
        .gte('timestamp_emissione', rangeGrafico.inizio)
        .lte('timestamp_emissione', rangeGrafico.fine)
        .order('timestamp_emissione', { ascending: true })
    ])

    setScontrini(sc || [])
    setTavoli(tav || [])
    setScontriniGrafico(scGraf || [])
    setLoadingDati(false)
  }

  function logout() {
    sessionStorage.removeItem('dashboard_auth')
    setAutenticato(false)
    setNegozioId(null)
    setPasswordInput('')
  }

  // Separa scontrini validi dagli annullati
  const scontriniValidi = scontrini.filter(s => !s.annullato)
  const scontriniAnnullati = scontrini.filter(s => s.annullato)

  const totaleGiorno = scontriniValidi.reduce((s, sc) => s + sc.totale, 0)
  const totaleContanti = scontriniValidi.filter(s => s.metodo === 'contanti').reduce((s, sc) => s + sc.totale, 0)
  const totaleCarta = scontriniValidi.filter(s => s.metodo === 'carta').reduce((s, sc) => s + sc.totale, 0)
  const numeroScontrini = scontriniValidi.length
  const scontrinoMedio = numeroScontrini > 0 ? totaleGiorno / numeroScontrini : 0
  const totaleAnnullati = scontriniAnnullati.reduce((s, sc) => s + sc.totale, 0)

  function getDatiGrafico() {
    const validi = scontriniGrafico.filter(s => !s.annullato)
    if (periodoGrafico === 'giorno') {
      return Array.from({ length: 24 }, (_, h) => {
        const sc = validi.filter(s => new Date(s.timestamp_emissione).getHours() === h)
        return { label: String(h), totale: sc.reduce((sum, s) => sum + s.totale, 0), count: sc.length }
      })
    }
    if (periodoGrafico === 'settimana') {
      return Array.from({ length: 7 }, (_, i) => {
        const giorno = new Date(filtroData)
        giorno.setDate(giorno.getDate() - 6 + i)
        const giornoStr = giorno.toISOString().split('T')[0]
        const sc = validi.filter(s => s.timestamp_emissione.startsWith(giornoStr))
        const label = giorno.toLocaleDateString('it-IT', { weekday: 'short' })
        return { label, totale: sc.reduce((sum, s) => sum + s.totale, 0), count: sc.length }
      })
    }
    if (periodoGrafico === 'mese') {
      const giorno = new Date(filtroData)
      const giorniNelMese = new Date(giorno.getFullYear(), giorno.getMonth() + 1, 0).getDate()
      return Array.from({ length: giorniNelMese }, (_, i) => {
        const g = i + 1
        const sc = validi.filter(s => new Date(s.timestamp_emissione).getDate() === g)
        return { label: String(g), totale: sc.reduce((sum, s) => sum + s.totale, 0), count: sc.length }
      })
    }
    if (periodoGrafico === 'anno') {
      const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
      return Array.from({ length: 12 }, (_, m) => {
        const sc = validi.filter(s => new Date(s.timestamp_emissione).getMonth() === m)
        return { label: mesi[m], totale: sc.reduce((sum, s) => sum + s.totale, 0), count: sc.length }
      })
    }
    return []
  }

  const datiGrafico = getDatiGrafico()
  const maxGrafico = Math.max(...datiGrafico.map(v => v.totale), 1)

  const prodottiMap = {}
  for (const sc of scontriniValidi) {
    for (const riga of (sc.righe_scontrino || [])) {
      if (!riga.nome) continue
      if (!prodottiMap[riga.nome]) prodottiMap[riga.nome] = { nome: riga.nome, quantita: 0, totale: 0 }
      prodottiMap[riga.nome].quantita += riga.quantita || 1
      prodottiMap[riga.nome].totale += riga.totale_riga || 0
    }
  }
  const topProdotti = Object.values(prodottiMap).sort((a, b) => b.quantita - a.quantita).slice(0, 8)

  if (!autenticato) {
    return (
      <div style={{
        minHeight: '100vh', background: '#08090c',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", padding: 20,
      }}>
        <Head>
          <link rel="manifest" href="/manifest-dashboard.json" />
        </Head>
        <div style={{
          background: '#111318', border: '1px solid #1e2230',
          borderRadius: 20, padding: '48px 40px',
          width: '100%', maxWidth: 380,
          display: 'flex', flexDirection: 'column', gap: 24,
          alignItems: 'center',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#eef0f6' }}>Dashboard</div>
            <div style={{ fontSize: '0.78rem', color: '#5a5d6e', marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
              Monitoraggio in tempo reale
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="Password dashboard..."
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1a1c24', border: '1px solid #252830',
                borderRadius: 12, padding: '14px 16px',
                color: '#eef0f6', fontSize: '1rem',
                fontFamily: "'DM Mono',monospace",
                outline: 'none', textAlign: 'center', letterSpacing: 2,
              }}
            />
            {erroreLogin && (
              <div style={{ color: '#ff4d6a', fontSize: '0.78rem', textAlign: 'center' }}>{erroreLogin}</div>
            )}
            <button
              onClick={login}
              disabled={loading}
              style={{
                padding: '14px', borderRadius: 12, border: 'none',
                background: '#00e5a0', color: '#08090c',
                fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                fontFamily: "'DM Mono',monospace",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? '...' : 'Accedi →'}
            </button>
          </div>

          <div style={{ fontSize: '0.7rem', color: '#3a3d4e', fontFamily: "'DM Mono',monospace" }}>
            DigitalCase · Accesso riservato al titolare
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#08090c', color: '#eef0f6', fontFamily: "'DM Sans', sans-serif" }}>

      <Head>
        <link rel="manifest" href="/manifest-dashboard.json" />
      </Head>

      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', background: '#111318',
        borderBottom: '1px solid #1a1c24', position: 'sticky', top: 0, zIndex: 100,
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.4rem' }}>📊</div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{negozioNome}</div>
            <div style={{ fontSize: '0.7rem', color: '#00e5a0', fontFamily: "'DM Mono',monospace" }}>Dashboard · Tempo reale</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="date"
            value={filtroData}
            onChange={e => setFiltroData(e.target.value)}
            style={{
              background: '#1a1c24', border: '1px solid #252830',
              borderRadius: 8, padding: '6px 10px',
              color: '#eef0f6', fontSize: '0.82rem',
              fontFamily: "'DM Mono',monospace", cursor: 'pointer',
            }}
          />
          <button
            onClick={caricaDati}
            style={{
              background: '#1a1c24', border: '1px solid #252830',
              borderRadius: 8, padding: '6px 12px',
              color: '#ffb830', fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Aggiorna
          </button>
          <button
            onClick={logout}
            style={{
              background: 'transparent', border: '1px solid #252830',
              borderRadius: 8, padding: '6px 12px',
              color: '#ff4d6a', fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Esci
          </button>
        </div>
      </header>

      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {loadingDati && (
          <div style={{ textAlign: 'center', color: '#5a5d6e', padding: 40, fontFamily: "'DM Mono',monospace" }}>
            ⏳ Caricamento...
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: 'Incasso totale', valore: '€ ' + fmt(totaleGiorno), colore: '#00e5a0', icona: '💰' },
            { label: 'Contanti', valore: '€ ' + fmt(totaleContanti), colore: '#ffb830', icona: '💵' },
            { label: 'Carta / POS', valore: '€ ' + fmt(totaleCarta), colore: '#6482ff', icona: '💳' },
            { label: 'Scontrini', valore: numeroScontrini, colore: '#ff4d6a', icona: '🧾' },
            { label: 'Scontrino medio', valore: '€ ' + fmt(scontrinoMedio), colore: '#a78bfa', icona: '📈' },
            { label: 'Tavoli aperti', valore: tavoli.length, colore: '#34d399', icona: '🍽️' },
          ].map(({ label, valore, colore, icona }) => (
            <div key={label} style={{
              background: '#111318', border: '1px solid ' + colore + '22',
              borderRadius: 16, padding: '20px 24px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.9rem' }}>{icona}</span>
                <span style={{ fontSize: '0.9rem', color: 'white', fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>{label.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: colore, fontFamily: "'DM Mono',monospace" }}>
                {valore}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#111318', border: '1px solid #1a1c24', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: '0.99rem', fontWeight: 600, color: '#eef0f6' }}>
              📈 Vendite
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {PERIODI.map(p => (
                <button key={p} onClick={() => setPeriodoGrafico(p)}
                  style={{
                    padding: '5px 14px', borderRadius: 8, fontSize: '0.72rem',
                    border: '1px solid ' + (periodoGrafico === p ? '#00e5a0' : '#252830'),
                    background: periodoGrafico === p ? 'rgba(0,229,160,0.15)' : 'transparent',
                    color: periodoGrafico === p ? '#00e5a0' : '#5a5d6e',
                    cursor: 'pointer', fontFamily: "'DM Mono',monospace",
                    textTransform: 'capitalize', fontWeight: periodoGrafico === p ? 700 : 400,
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: periodoGrafico === 'mese' ? 2 : 4, height: 120, padding: '0 4px', overflowX: 'auto' }}>
            {datiGrafico.map((item, i) => {
              const altezza = item.totale > 0 ? Math.max(8, (item.totale / maxGrafico) * 100) : 0
              const mostraLabel = periodoGrafico === 'giorno' ? i % 3 === 0 : periodoGrafico === 'mese' ? i % 5 === 0 : true
              return (
                <div key={i} style={{ flex: '1 0 auto', minWidth: periodoGrafico === 'mese' ? 14 : periodoGrafico === 'giorno' ? 16 : 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  {item.totale > 0 && periodoGrafico !== 'mese' && (
                    <div style={{ fontSize: '0.65rem', color: '#00e5a0', fontFamily: "'DM Mono',monospace", whiteSpace: 'nowrap' }}>
                      {item.count}
                    </div>
                  )}
                  <div
                    title={item.label + ' — €' + fmt(item.totale) + ' (' + item.count + ' scontrini)'}
                    style={{
                      width: '100%', height: altezza,
                      background: item.totale > 0 ? '#00e5a0' : '#1a1c24',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease',
                      cursor: item.totale > 0 ? 'pointer' : 'default',
                      opacity: item.totale > 0 ? 1 : 0.3,
                    }}
                  />
                  {mostraLabel && (
                    <div style={{ fontSize: '0.7rem', color: 'white', fontFamily: "'DM Mono',monospace" }}>
                      {item.label}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          <div style={{ background: '#111318', border: '1px solid #1a1c24', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: '0.99rem', fontWeight: 600, color: '#eef0f6', marginBottom: 16 }}>
              🏆 Top prodotti
            </div>
            {topProdotti.length === 0 ? (
              <div style={{ color: '#5a5d6e', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>Nessun dato</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topProdotti.map((p, i) => {
                  const maxQ = topProdotti[0].quantita
                  return (
                    <div key={p.nome} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 700,
                            color: COLORI[i % COLORI.length],
                            fontFamily: "'DM Mono',monospace",
                            minWidth: 16,
                          }}>#{i + 1}</span>
                          <span style={{ fontSize: '0.82rem', color: '#eef0f6' }}>{p.nome}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#5a5d6e' }}>×{p.quantita}</span>
                          <span style={{ fontSize: '0.82rem', color: COLORI[i % COLORI.length], fontFamily: "'DM Mono',monospace" }}>
                            €{fmt(p.totale)}
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: '#1a1c24', borderRadius: 2 }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          background: COLORI[i % COLORI.length],
                          width: (p.quantita / maxQ * 100) + '%',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ background: '#111318', border: '1px solid #1a1c24', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: '0.99rem', fontWeight: 600, color: '#eef0f6', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span>🍽️ Tavoli aperti ora</span>
              <span style={{ color: '#00e5a0', fontFamily: "'DM Mono',monospace" }}>{tavoli.length}</span>
            </div>
            {tavoli.length === 0 ? (
              <div style={{ color: '#5a5d6e', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>Nessun tavolo aperto</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tavoli.map(t => {
                  const totTavolo = (t.righe || []).reduce((s, r) => s + (r.totaleRiga || 0), 0)
                  const apertoAlle = t.apertoAlle ? fmtOra(t.apertoAlle) : '—'
                  return (
                    <div key={t.numero} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', background: '#1a1c24',
                      borderRadius: 10, border: '1px solid #ff4d6a33',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'rgba(255,77,106,0.15)',
                          border: '1px solid #ff4d6a44',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, color: '#ff4d6a', fontSize: '0.85rem',
                          fontFamily: "'DM Mono',monospace",
                        }}>
                          {t.numero}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.82rem', color: '#eef0f6' }}>
                            {(t.righe || []).length} prodotti
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#5a5d6e' }}>Aperto alle {apertoAlle}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#00e5a0', fontFamily: "'DM Mono',monospace" }}>
                        €{fmt(totTavolo)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: '#111318', border: '1px solid #1a1c24', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: '0.99rem', fontWeight: 600, color: '#eef0f6', marginBottom: 16 }}>
            🧾 Scontrini del giorno
          </div>
          {scontriniValidi.length === 0 ? (
            <div style={{ color: '#5a5d6e', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>Nessuno scontrino</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...scontriniValidi].reverse().map((sc, i) => (
                <div key={sc.id || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: '#1a1c24',
                  borderRadius: 10, border: '1px solid #252830',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.92rem', color: 'yellow', fontFamily: "'DM Mono',monospace", minWidth: 40 }}>
                      {fmtOra(sc.timestamp_emissione)}
                    </span>
                    <span style={{
                      fontSize: '0.99rem', padding: '2px 8px', borderRadius: 6,
                      background: sc.metodo === 'contanti' ? 'rgba(255,184,48,0.15)' : 'rgba(100,130,255,0.15)',
                      color: sc.metodo === 'contanti' ? '#ffb830' : '#6482ff',
                      fontFamily: "'DM Mono',monospace",
                    }}>
                      {sc.metodo === 'contanti' ? '💵' : '💳'}
                    </span>
                    {sc.operatore_nome && (
                      <span style={{ fontSize: '0.92rem', color: 'yellow' }}>{sc.operatore_nome}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'yellow', fontFamily: "'DM Mono',monospace" }}>
                    € {fmt(sc.totale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SCONTRINI ANNULLATI — sezione separata */}
        {scontriniAnnullati.length > 0 && (
          <div style={{ background: '#111318', border: '1px solid #ff4d6a33', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: '0.99rem', fontWeight: 600, color: '#ff4d6a', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span>🗑️ Scontrini annullati</span>
              <span style={{ fontFamily: "'DM Mono',monospace" }}>{scontriniAnnullati.length} · €{fmt(totaleAnnullati)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...scontriniAnnullati].reverse().map((sc, i) => (
                <div key={sc.id || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: '#1a1c24',
                  borderRadius: 10, border: '1px solid #ff4d6a22',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.92rem', color: 'white', fontFamily: "'DM Mono',monospace", minWidth: 40 }}>
                      {fmtOra(sc.timestamp_emissione)}
                    </span>
                    {sc.annullato_da && (
                      <span style={{ fontSize: '0.92rem', color: 'white' }}>annullato da {sc.annullato_da}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ff4d6a', fontFamily: "'DM Mono',monospace", textDecoration: 'line-through' }}>
                    € {fmt(sc.totale)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}