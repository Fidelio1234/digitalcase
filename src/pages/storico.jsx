import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getNegozio, getContatori } from '@/lib/storage'
import { getStoricoDb, salvaChiusuraDb, getChiusureDb } from '@/lib/supabase-db'
import { NEGOZIO_ID } from '@/lib/config'
import styles from '@/styles/Storico.module.css'

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function fmtData(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export default function StoricoPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [storico, setStorico] = useState([])
  const [chiusure, setChiusure] = useState([])
  const [ricerca, setRicerca] = useState('')
  const [filtroData, setFiltroData] = useState('')
  const [filtroMetodo, setFiltroMetodo] = useState('tutti')
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('scontrini') // scontrini | chiusure
  const [showChiusuraModal, setShowChiusuraModal] = useState(false)
  const [negozio, setNegozio] = useState({})
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!user) { if (!loading) router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    getStoricoDb(NEGOZIO_ID).then(s => setStorico(s))
    getChiusureDb(NEGOZIO_ID).then(c => setChiusure(c))
    setNegozio(getNegozio())
  }, [user, router])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // Filtra scontrini
  const scontriniFiltrati = storico.filter(s => {
    const dataOk = filtroData ? s.timestamp?.startsWith(filtroData) : true
    const metodoOk = filtroMetodo === 'tutti' ? true : s.metodo === filtroMetodo
    const testOk = ricerca
      ? s.id?.toLowerCase().includes(ricerca.toLowerCase()) ||
        s.righe?.some(r => r.nome?.toLowerCase().includes(ricerca.toLowerCase())) ||
        s.contatto?.toLowerCase().includes(ricerca.toLowerCase())
      : true
    return dataOk && metodoOk && testOk
  })

  // Totali filtrati
  const totaleGiornaliero = scontriniFiltrati.reduce((s, x) => s + (x.totale || 0), 0)
  const totaleCarte = scontriniFiltrati.filter(x => x.metodo === 'carta').reduce((s, x) => s + (x.totale || 0), 0)
  const totaleContanti = scontriniFiltrati.filter(x => x.metodo === 'contanti').reduce((s, x) => s + (x.totale || 0), 0)
  const totaleIva = scontriniFiltrati.reduce((acc, s) => {
    s.righe?.forEach(r => {
      const k = String(r.iva)
      acc[k] = (acc[k] || 0) + r.totaleRiga
    })
    return acc
  }, {})

  // Chiusura fiscale
  async function eseguiChiusura() {
    const contatori = getContatori()
    const chiusura = {
      id: 'CF' + Date.now(),
      timestamp: new Date().toISOString(),
      numeroChiusura: (chiusure.length + 1),
      numeroScontrini: scontriniFiltrati.length,
      totaleGiornaliero,
      totaleCarte,
      totaleContanti,
      totaleIva,
      negozio,
      scontrini: scontriniFiltrati.map(s => s.id),
    }
    await salvaChiusuraDb(NEGOZIO_ID, chiusura)
    getChiusureDb(NEGOZIO_ID).then(c => setChiusure(c))
    setShowChiusuraModal(false)
    showToast('✓ Chiusura fiscale eseguita')
    setTab('chiusure')
  }

  async function inviaChiusuraEmail(chiusura) {
    const neg = getNegozio()
    const html = buildChiusuraHtml(chiusura, neg)
    try {
      const res = await fetch('/api/invia-chiusura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negozio: neg, chiusura, html })
      })
      if (res.ok) showToast('✓ Email chiusura inviata')
      else showToast('⚠ Errore invio email')
    } catch {
      showToast('⚠ Errore invio email')
    }
  }

  function buildChiusuraHtml(c, neg) {
    const ivaRighe = Object.entries(c.totaleIva || {}).map(([iva, imp]) =>
      `<tr><td style="padding:8px 16px;color:#5a5d6e">IVA ${iva}% su €${fmt(imp)}</td>
       <td style="padding:8px 16px;text-align:right;font-family:monospace">€ ${fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</td></tr>`
    ).join('')

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="background:#08090c;font-family:monospace;padding:32px">
<div style="max-width:560px;margin:0 auto">
  <div style="background:#111318;border:1px solid #252830;border-left:4px solid #ffb830;border-radius:12px;padding:24px;margin-bottom:20px">
    <div style="font-size:18px;font-weight:700;color:#eef0f6">${neg.ragioneSociale || 'Negozio'}</div>
    ${neg.indirizzo ? `<div style="color:#5a5d6e;font-size:13px;margin-top:4px">📍 ${neg.indirizzo}</div>` : ''}
    ${neg.partitaIva ? `<div style="color:#5a5d6e;font-size:13px">P.IVA ${neg.partitaIva}</div>` : ''}
    ${neg.numeroRt ? `<div style="color:#5a5d6e;font-size:11px;margin-top:8px">RT: ${neg.numeroRt}</div>` : ''}
  </div>
  <div style="background:#111318;border:1px solid #ffb830;border-radius:12px;padding:24px;margin-bottom:20px;text-align:center">
    <div style="font-size:11px;color:#5a5d6e;letter-spacing:2px">CHIUSURA FISCALE N°</div>
    <div style="font-size:36px;font-weight:700;color:#ffb830">${c.numeroChiusura}</div>
    <div style="font-size:13px;color:#5a5d6e">${new Date(c.timestamp).toLocaleDateString('it-IT')}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;background:#111318;border:1px solid #252830;border-radius:12px;overflow:hidden;margin-bottom:20px">
    <tr style="background:#1a1c24">
      <td style="padding:12px 16px;color:#5a5d6e;font-size:11px;letter-spacing:2px">VOCE</td>
      <td style="padding:12px 16px;text-align:right;color:#5a5d6e;font-size:11px;letter-spacing:2px">IMPORTO</td>
    </tr>
    <tr><td style="padding:12px 16px;color:#eef0f6">Numero scontrini</td><td style="padding:12px 16px;text-align:right;font-family:monospace;color:#eef0f6">${c.numeroScontrini}</td></tr>
    <tr><td style="padding:12px 16px;color:#eef0f6">Totale carte</td><td style="padding:12px 16px;text-align:right;font-family:monospace;color:#6482ff">€ ${fmt(c.totaleCarte)}</td></tr>
    <tr><td style="padding:12px 16px;color:#eef0f6">Totale contanti</td><td style="padding:12px 16px;text-align:right;font-family:monospace;color:#ff9f43">€ ${fmt(c.totaleContanti)}</td></tr>
    ${ivaRighe}
    <tr style="background:#1a1c24"><td style="padding:16px;font-size:13px;color:#5a5d6e;letter-spacing:2px">TOTALE GIORNALIERO</td>
    <td style="padding:16px;text-align:right;font-size:22px;font-weight:700;color:#ffb830;font-family:monospace">€ ${fmt(c.totaleGiornaliero)}</td></tr>
  </table>
  <div style="text-align:center;color:#5a5d6e;font-size:11px">Chiusura fiscale generata da ScontrinoDigitale</div>
</div></body></html>`
  }

  function stampaPDF(chiusura) {
    const neg = getNegozio()
    const chiusuraHtml = buildChiusuraHtml(chiusura, neg)
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Chiusura Fiscale #${chiusura.numeroChiusura}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #08090c; font-family: 'Courier New', monospace; }
        .no-print { display: flex; gap: 12px; justify-content: center; padding: 24px; }
        .btn-stampa {
          background: #ffb830; border: none; border-radius: 10px;
          padding: 14px 40px; font-size: 1rem; font-weight: 700;
          cursor: pointer; letter-spacing: 1px;
        }
        .btn-chiudi {
          background: transparent; border: 2px solid #444;
          border-radius: 10px; padding: 14px 40px;
          font-size: 1rem; color: #aaa; cursor: pointer;
        }
        .btn-chiudi:hover { border-color: #fff; color: #fff; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { color: black !important; border-color: #ddd !important; background: white !important; }
          [style*="color:#00e5a0"] { color: black !important; }
          [style*="color:#ffb830"] { color: black !important; font-weight: bold !important; }
          [style*="color:#6482ff"] { color: black !important; }
          [style*="color:#ff9f43"] { color: black !important; }
        }
      </style>
    </head><body>
      <div class="no-print">
        <button class="btn-stampa" onclick="window.print()">🖨️ Stampa / Salva PDF</button>
        <button class="btn-chiudi" onclick="window.close()">✕ Chiudi</button>
      </div>
      ${chiusuraHtml}
      <div class="no-print">
        <button class="btn-stampa" onclick="window.print()">🖨️ Stampa / Salva PDF</button>
        <button class="btn-chiudi" onclick="window.close()">✕ Chiudi</button>
      </div>
    </body></html>`)
    w.document.close()
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.replace('/cassa')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Cassa
        </button>
        <div className={styles.headerTitle}>
          <span>Storico Scontrini</span>
          <span className={styles.headerSub}>{storico.length} scontrini totali</span>
        </div>
        <button className={styles.chiusuraBtn} onClick={() => setShowChiusuraModal(true)}>
          🔒 Chiusura Fiscale
        </button>
      </header>

      {/* TABS */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'scontrini' ? styles.tabActive : ''}`} onClick={() => setTab('scontrini')}>
          🧾 Scontrini ({storico.length})
        </button>
        <button className={`${styles.tab} ${tab === 'chiusure' ? styles.tabActive : ''}`} onClick={() => setTab('chiusure')}>
          🔒 Chiusure ({chiusure.length})
        </button>
      </div>

      {tab === 'scontrini' && (
        <div className={styles.main}>

          {/* FILTRI */}
          <div className={styles.filtri}>
            <input
              type="text" placeholder="🔍 Cerca per numero, prodotto, email..."
              value={ricerca} onChange={e => setRicerca(e.target.value)}
              className={styles.searchInput}
            />
            <input
              type="date" value={filtroData}
              onChange={e => setFiltroData(e.target.value)}
              className={styles.dateInput}
            />
            <div className={styles.metodoFiltro}>
              {['tutti','carta','contanti'].map(m => (
                <button
                  key={m}
                  className={`${styles.metodoBtn} ${filtroMetodo === m ? styles.metodoActive : ''}`}
                  onClick={() => setFiltroMetodo(m)}
                >
                  {m === 'tutti' ? 'Tutti' : m === 'carta' ? '�� Carta' : '💵 Contanti'}
                </button>
              ))}
            </div>
          </div>

          {/* TOTALI */}
          <div className={styles.totaliRow}>
            <div className={styles.totaleCard}>
              <div className={styles.totaleLabel}>Totale</div>
              <div className={styles.totaleVal}>€ {fmt(totaleGiornaliero)}</div>
            </div>
            <div className={styles.totaleCard}>
              <div className={styles.totaleLabel}>💳 Carte</div>
              <div className={styles.totaleVal} style={{color:'#6482ff'}}>€ {fmt(totaleCarte)}</div>
            </div>
            <div className={styles.totaleCard}>
              <div className={styles.totaleLabel}>💵 Contanti</div>
              <div className={styles.totaleVal} style={{color:'#ff9f43'}}>€ {fmt(totaleContanti)}</div>
            </div>
            <div className={styles.totaleCard}>
              <div className={styles.totaleLabel}>N° scontrini</div>
              <div className={styles.totaleVal}>{scontriniFiltrati.length}</div>
            </div>
          </div>

          {/* LISTA */}
          <div className={styles.lista}>
            {scontriniFiltrati.length === 0 && (
              <div className={styles.empty}>
                <div style={{fontSize:'2rem'}}>🧾</div>
                <div>Nessuno scontrino trovato</div>
              </div>
            )}
            {scontriniFiltrati.map(s => (
              <div
                key={s.id}
                className={`${styles.scontrinoRow} ${selected?.id === s.id ? styles.selected : ''}`}
                onClick={() => setSelected(selected?.id === s.id ? null : s)}
              >
                <div className={styles.scontrinoLeft}>
                  <div className={styles.scontrinoNum}>#{s.numeroScontrino || s.id?.slice(-4)}</div>
                  <div className={styles.scontrinoData}>{fmtData(s.timestamp)}</div>
                </div>
                <div className={styles.scontrinoCenter}>
                  <div className={styles.scontrinoRighe}>
                    {s.righe?.slice(0,2).map((r,i) => (
                      <span key={i} className={styles.righeTag}>{r.nome}{r.quantita > 1 ? ` x${r.quantita}` : ''}</span>
                    ))}
                    {s.righe?.length > 2 && <span className={styles.righeTag}>+{s.righe.length - 2}</span>}
                  </div>
                  {s.contatto && <div className={styles.contatto}>📧 {s.contatto}</div>}
                </div>
                <div className={styles.scontrinoRight}>
                  <div className={styles.scontrinoTotale}>€ {fmt(s.totale)}</div>
                  <div className={`${styles.scontrinoMetodo} ${s.metodo === 'carta' ? styles.carta : styles.contanti}`}>
                    {s.metodo === 'carta' ? '💳' : '💵'}
                  </div>
                </div>
              </div>
            ))}

            {/* DETTAGLIO ESPANSO */}
            {selected && (
              <div className={styles.dettaglio}>
                <div className={styles.dettaglioHeader}>
                  Dettaglio scontrino #{selected.numeroScontrino}
                </div>
                {selected.righe?.map((r, i) => (
                  <div key={i} className={styles.dettaglioRiga}>
                    <span>{r.nome} {r.quantita > 1 ? `×${r.quantita}` : ''}</span>
                    <span>€ {fmt(r.totaleRiga)}</span>
                  </div>
                ))}
                <div className={styles.dettaglioTotale}>
                  <span>TOTALE</span>
                  <span>€ {fmt(selected.totale)}</span>
                </div>
                {Object.entries(
                  selected.righe?.reduce((acc, r) => {
                    const k = String(r.iva)
                    acc[k] = (acc[k] || 0) + r.totaleRiga
                    return acc
                  }, {}) || {}
                ).map(([iva, imp]) => (
                  <div key={iva} className={styles.dettaglioIva}>
                    <span>IVA {iva}%</span>
                    <span>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'chiusure' && (
        <div className={styles.main}>
          <div className={styles.lista}>
            {chiusure.length === 0 && (
              <div className={styles.empty}>
                <div style={{fontSize:'2rem'}}>🔒</div>
                <div>Nessuna chiusura fiscale ancora</div>
              </div>
            )}
            {chiusure.map(c => (
              <div key={c.id} className={styles.chiusuraRow}>
                <div className={styles.chiusuraLeft}>
                  <div className={styles.chiusuraNum}>Chiusura #{c.numeroChiusura}</div>
                  <div className={styles.chiusuraData}>{fmtData(c.timestamp)}</div>
                  <div className={styles.chiusuraMeta}>{c.numeroScontrini} scontrini</div>
                </div>
                <div className={styles.chiusuraCenter}>
                  <div className={styles.chiusuraTotale}>€ {fmt(c.totaleGiornaliero)}</div>
                  <div className={styles.chiusuraSplit}>
                    <span style={{color:'#6482ff'}}>💳 €{fmt(c.totaleCarte)}</span>
                    <span style={{color:'#ff9f43'}}>💵 €{fmt(c.totaleContanti)}</span>
                  </div>
                </div>
                <div className={styles.chiusuraActions}>
                  <button className={styles.actionBtn} onClick={() => stampaPDF(c)} title="Stampa PDF">
                    🖨️
                  </button>
                  <button className={styles.actionBtn} onClick={() => inviaChiusuraEmail(c)} title="Invia email">
                    📧
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL CHIUSURA FISCALE */}
      {showChiusuraModal && (
        <div className={styles.overlay} onClick={() => setShowChiusuraModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>🔒 Chiusura Fiscale</div>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.riepilogo}>
                <div className={styles.riepilogoRow}>
                  <span>Numero scontrini</span>
                  <strong>{scontriniFiltrati.length}</strong>
                </div>
                <div className={styles.riepilogoRow}>
                  <span>💳 Totale carte</span>
                  <strong style={{color:'#6482ff'}}>€ {fmt(totaleCarte)}</strong>
                </div>
                <div className={styles.riepilogoRow}>
                  <span>💵 Totale contanti</span>
                  <strong style={{color:'#ff9f43'}}>€ {fmt(totaleContanti)}</strong>
                </div>
                {Object.entries(totaleIva).map(([iva, imp]) => (
                  <div key={iva} className={styles.riepilogoRow}>
                    <span>IVA {iva}%</span>
                    <strong>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</strong>
                  </div>
                ))}
                <div className={styles.riepilogoTotale}>
                  <span>TOTALE GIORNALIERO</span>
                  <strong>€ {fmt(totaleGiornaliero)}</strong>
                </div>
              </div>
              <div className={styles.modalNote}>
                La chiusura verrà salvata nello storico e potrai stamparla o inviarla via email.
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowChiusuraModal(false)}>Annulla</button>
              <button className={styles.chiudiBtn} onClick={eseguiChiusura}>
                ✓ Esegui chiusura
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
