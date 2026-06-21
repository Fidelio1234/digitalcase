import { useState } from 'react'
import Head from 'next/head'

const ATTIVITA = [
  { id: 'bar', emoji: '☕', name: 'Bar & Caffetteria', desc: 'Caffè, colazioni, aperitivi',
    tagline: 'Scontrino in un tap e fila che scorre veloce come il tuo caffè.' },
  { id: 'risto', emoji: '🍕', name: 'Pizzeria & Ristorante', desc: 'Tavoli, cucina, asporto',
    tagline: 'Comande per tavolo, cucina connessa e conto diviso senza errori.' },
  { id: 'negozio', emoji: '🛍️', name: 'Negozio al dettaglio', desc: 'Vendita al banco e reparti',
    tagline: 'Barcode, giacenze e storico vendite per reparto, sempre aggiornati.' },
  { id: 'street', emoji: '🍔', name: 'Street food & Chiosco', desc: 'Furgoni, chioschi, eventi',
    tagline: 'Funziona da tablet o smartphone, anche quando la rete fa i capricci.' },
]

const PAIN = [
  { id: 'scontrini', emoji: '🧾', name: 'Scontrini & fiscale', desc: 'La parte burocratica',
    title: 'Registratore Telematico integrato',
    text: 'Scontrini elettronici a norma e invio automatico all\u2019Agenzia delle Entrate. Zero pensieri fiscali.' },
  { id: 'magazzino', emoji: '📦', name: 'Magazzino & scorte', desc: 'Cosa ho, cosa manca',
    title: 'Magazzino in tempo reale',
    text: 'Giacenze sempre aggiornate e alert quando un prodotto sta finendo. Non resti mai senza.' },
  { id: 'tavoli', emoji: '🍽️', name: 'Tavoli & comande', desc: 'Sala e cucina',
    title: 'Tavoli & comande dal palmo',
    text: 'Apri tavoli, prendi comande da telefono o tablet, invia in cucina e chiudi il conto in pochi tap.' },
  { id: 'incassi', emoji: '📊', name: 'Incassi & numeri', desc: 'Capire come va',
    title: 'Statistiche e incassi chiari',
    text: 'Vendite, prodotti top e turni di punta a colpo d\u2019occhio. Decidi con i dati, non a intuito.' },
]

const BENEFIT = [
  { emoji: '☁️', label: 'Cloud, dati sempre con te' },
  { emoji: '🔐', label: 'Multi-utente con PIN' },
  { emoji: '🏪', label: 'Multi-sede da un account' },
]

function Logo({ size = 24 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: size, height: size, background: '#00C27A', borderRadius: size * 0.28,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg viewBox="0 0 20 20" fill="none" style={{ width: size * 0.56, height: size * 0.56 }}>
          <rect x="2" y="5" width="16" height="11" rx="2" stroke="#0B1C3D" strokeWidth="1.8" />
          <path d="M2 9h16" stroke="#0B1C3D" strokeWidth="1.8" />
          <path d="M6 13h2M10 13h4" stroke="#0B1C3D" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: size * 0.5, letterSpacing: '-0.02em' }}>
        Digital<span style={{ color: '#00C27A' }}>Case</span>
      </span>
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 36, height: 36, background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10,
      cursor: 'pointer', flexShrink: 0, padding: 0,
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )
}

function ProgressDots({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 28, height: 5, borderRadius: 100, background: '#00C27A' }} />
      <div style={{ width: 28, height: 5, borderRadius: 100, background: active >= 2 ? '#00C27A' : 'rgba(255,255,255,0.16)' }} />
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginLeft: 4 }}>{active} / 2</span>
    </div>
  )
}

export default function QuizPage() {
  const [step, setStep] = useState('start')
  const [activity, setActivity] = useState(null)
  const [pain, setPain] = useState(null)

  const act = ATTIVITA.find(a => a.id === activity) || ATTIVITA[0]
  const p = PAIN.find(x => x.id === pain) || PAIN[0]

  const card = {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14, padding: '16px 14px', cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif", transition: 'transform .15s, border-color .2s, background .2s',
    color: '#fff', width: '100%',
  }

  return (
    <>
      <Head>
        <title>Scopri se DigitalCase fa per il tuo locale — Quiz</title>
        <meta name="description" content="Rispondi a 2 domande e scopri come DigitalCase può semplificare la gestione di cassa, comande, tavoli e magazzino della tua attività." />
        <meta property="og:title" content="Il tuo locale è pronto per il futuro?" />
        <meta property="og:description" content="Scopri in 1 minuto se DigitalCase fa per la tua attività." />
        <meta property="og:image" content="https://digitalcase.it/quiz-preview.png" />
        <meta property="og:url" content="https://digitalcase.it/quiz" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Il tuo locale è pronto per il futuro?" />
        <meta name="twitter:description" content="Scopri in 1 minuto se DigitalCase fa per la tua attività." />
        <meta name="twitter:image" content="https://digitalcase.it/quiz-preview.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        minHeight: '100vh', background: '#060F20',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
        <div style={{
          position: 'relative', width: '100%', maxWidth: 480, minHeight: '70vh',
          background: '#0B1C3D', color: '#fff', fontFamily: "'DM Sans', sans-serif",
          overflow: 'hidden', borderRadius: 24, boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            position: 'absolute', width: 320, height: 320, left: '50%', top: -140,
            background: 'radial-gradient(circle, rgba(0,194,122,0.16) 0%, transparent 62%)',
            pointerEvents: 'none', transform: 'translateX(-50%)',
          }} />

          {/* START */}
          {step === 'start' && (
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 24, minHeight: '70vh' }}>
              <Logo size={32} />

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: 32 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(0,194,122,0.12)', border: '1px solid rgba(0,194,122,0.3)',
                  color: '#00C27A', fontSize: 12, fontWeight: 600, padding: '6px 14px',
                  borderRadius: 100, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 20,
                }}>
                  🇮🇹 Per le PMI italiane
                </div>
                <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 18 }}>
                  Gestisci ancora cassa, magazzino e comande <em style={{ fontStyle: 'normal', color: '#00C27A' }}>a mano?</em>
                </h1>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, maxWidth: 380 }}>
                  Rispondi a 2 domande e scopri come DigitalCase semplifica davvero la <em style={{ fontStyle: 'normal', color: '#fff' }}>tua</em> attività.
                </p>
              </div>

              <div style={{ marginTop: 32 }}>
                <button onClick={() => setStep('q1')} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: '#00C27A', color: '#0B1C3D', fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700, fontSize: 17, padding: '16px 32px', border: 'none',
                  borderRadius: 14, cursor: 'pointer',
                }}>
                  Scopri come →
                </button>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 14 }}>
                  ⏱ 20 secondi · nessuna registrazione
                </p>
              </div>
            </div>
          )}

          {/* Q1 */}
          {step === 'q1' && (
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', padding: 32, minHeight: '70vh' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <BackBtn onClick={() => setStep('start')} />
                  <Logo size={24} />
                </div>
                <ProgressDots active={1} />
              </div>

              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: '-0.03em', lineHeight: 1.12, marginBottom: 8 }}>
                Che attività hai?
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>
                Così ti mostriamo gli strumenti giusti.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {ATTIVITA.map(a => (
                  <button key={a.id} onClick={() => { setActivity(a.id); setStep('q2') }}
                    style={card}>
                    <span style={{ fontSize: 28, lineHeight: 1, marginBottom: 6 }}>{a.emoji}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>{a.name}</span>
                    <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Q2 */}
          {step === 'q2' && (
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', padding: 32, minHeight: '70vh' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <BackBtn onClick={() => setStep('q1')} />
                  <Logo size={24} />
                </div>
                <ProgressDots active={2} />
              </div>

              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', lineHeight: 1.12, marginBottom: 8 }}>
                Cosa ti fa perdere<br />più tempo?
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>
                La tua priorità numero uno.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {PAIN.map(item => (
                  <button key={item.id} onClick={() => { setPain(item.id); setStep('result') }}
                    style={card}>
                    <span style={{ fontSize: 28, lineHeight: 1, marginBottom: 6 }}>{item.emoji}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>{item.name}</span>
                    <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RESULT */}
          {step === 'result' && (
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', padding: '28px 28px 24px', minHeight: '70vh' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                <Logo size={24} />
                <span style={{ fontSize: 12.5, color: '#00C27A', fontWeight: 700, background: 'rgba(0,194,122,0.12)', padding: '5px 12px', borderRadius: 100 }}>
                  ✓ Risultato
                </span>
              </div>

              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                DigitalCase per
              </p>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8 }}>
                <span style={{ marginRight: 8 }}>{act.emoji}</span>{act.name}
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, marginBottom: 20 }}>
                {act.tagline}
              </p>

              <div style={{
                background: 'linear-gradient(135deg, rgba(0,194,122,0.16), rgba(0,194,122,0.05))',
                border: '1px solid rgba(0,194,122,0.35)', borderRadius: 18, padding: '20px 18px', marginBottom: 18,
              }}>
                <p style={{ fontSize: 12, color: '#00C27A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  La tua priorità → {p.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{p.emoji}</span>
                  <div>
                    <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: '#fff', marginBottom: 4 }}>{p.title}</h3>
                    <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.68)', lineHeight: 1.5 }}>{p.text}</p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 'auto' }}>
                {BENEFIT.map(b => (
                  <div key={b.label} style={{
                    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, padding: '12px 8px', textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 20, display: 'block', marginBottom: 4 }}>{b.emoji}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, lineHeight: 1.25, display: 'block' }}>{b.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <a href="https://wa.me/393391199015?text=Ciao!%20Vorrei%20provare%20DigitalCase%20gratis%20per%20la%20mia%20attivit%C3%A0."
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#00C27A', color: '#0B1C3D', fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700, fontSize: 15, padding: '16px 12px', borderRadius: 14,
                    textDecoration: 'none',
                  }}>
                  <svg viewBox="0 0 24 24" fill="#0B1C3D" style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  Demo su WhatsApp
                </a>
                <a href="mailto:digitalcase@blu.it?subject=Richiesta%20demo%20DigitalCase"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700, fontSize: 15, padding: '16px 12px',
                    border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, textDecoration: 'none',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 7l-10 6L2 7" />
                  </svg>
                  Email
                </a>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>🎁 2 settimane gratis · pronta in 20 min</p>
                <button onClick={() => { setStep('start'); setActivity(null); setPain(null) }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  ↺ Rifai il test
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}