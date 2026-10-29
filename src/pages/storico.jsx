import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getNegozio, getContatori } from '@/lib/storage'
import { sincronizzaNegozioLocale } from '@/lib/supabase-db'
import { getStoricoDb, getScontriniPeriodoDb, salvaChiusuraDb, getChiusureDb } from '@/lib/supabase-db'
import { useNegozioId } from '@/hooks/useNegozioId'
import styles from '@/styles/Storico.module.css'
import { totaliPerIva, riepilogoIvaMensile } from '@/lib/iva'

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function fmtData(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export default function StoricoPage() {
  const NEGOZIO_ID = useNegozioId()
  const { user, loading } = useAuth()
  const router = useRouter()
  const [storico, setStorico] = useState([])
  const [chiusure, setChiusure] = useState([])
  const [ricerca, setRicerca] = useState('')
  const [filtroData, setFiltroData] = useState(new Date().toISOString().split('T')[0])
  const [filtroMetodo, setFiltroMetodo] = useState('tutti')
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('scontrini')
  const [negozio, setNegozio] = useState({})
  const [toast, setToast] = useState('')

  // Report IVA mensile
  const [ivaOpen, setIvaOpen] = useState(false)
  const [ivaMese, setIvaMese] = useState(() => {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  })
  const [ivaRiep, setIvaRiep] = useState(null)
  const [ivaLoading, setIvaLoading] = useState(false)
  const [ivaErrore, setIvaErrore] = useState('')

  // Legge il mese a pagine (limite di 1000 righe di Supabase) quando il pannello è aperto
  useEffect(() => {
    if (!ivaOpen || !NEGOZIO_ID) return
    let annullata = false
    setIvaLoading(true)
    setIvaRiep(null)
    setIvaErrore('')
    const [anno, mese] = ivaMese.split('-').map(Number)
    getScontriniPeriodoDb(NEGOZIO_ID, new Date(anno, mese - 1, 1).toISOString(), new Date(anno, mese, 1).toISOString())
      .then(r => {
        if (annullata) return
        if (!r.ok) setIvaErrore('Impossibile leggere gli scontrini del mese. Riprova.')
        else setIvaRiep(riepilogoIvaMensile(r.scontrini))
        setIvaLoading(false)
      })
      .catch(() => {
        if (annullata) return
        setIvaErrore('Errore di rete. Riprova.')
        setIvaLoading(false)
      })
    return () => { annullata = true }
  }, [ivaOpen, ivaMese, NEGOZIO_ID])

  useEffect(() => {
    if (!user) { if (!loading) router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
    getStoricoDb(NEGOZIO_ID).then(s => setStorico(s))
    getChiusureDb(NEGOZIO_ID).then(c => setChiusure(c))
    setNegozio(getNegozio())
    sincronizzaNegozioLocale(NEGOZIO_ID).then(() => setNegozio(getNegozio()))
  }, [user, router])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const chiusureDelGiorno = chiusure.filter(c => c.timestamp?.startsWith(filtroData))
  const ultimaChiusuraDelGiorno = chiusureDelGiorno.length > 0
    ? chiusureDelGiorno.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
    : null

  const scontriniFiltrati = storico.filter(s => {
    const dataOk = filtroData ? s.timestamp?.startsWith(filtroData) : true
    const metodoOk = filtroMetodo === 'annullati' ? s.annullato : (!s.annullato && (filtroMetodo === 'tutti' || s.metodo === filtroMetodo))
    const testOk = ricerca
      ? s.id?.toLowerCase().includes(ricerca.toLowerCase()) ||
        s.righe?.some(r => r.nome?.toLowerCase().includes(ricerca.toLowerCase())) ||
        s.contatto?.toLowerCase().includes(ricerca.toLowerCase()) ||
        (() => {
          const r = ricerca.replace('€','').replace(',','.').trim()
          const totaleStr = (s.totale / 100).toFixed(2)
          return totaleStr.startsWith(r) || totaleStr === r || 
                 fmt(s.totale).replace(',','.').startsWith(r)
        })()
      : true
    const dopoChiusura = ultimaChiusuraDelGiorno
      ? new Date(s.timestamp) > new Date(ultimaChiusuraDelGiorno.timestamp)
      : true
    // Gli annullati ignorano il filtro dopoChiusura
   // return dataOk && metodoOk && testOk && (s.annullato || dopoChiusura)
   return dataOk && metodoOk && testOk
  })

  const totaleGiornaliero = scontriniFiltrati.filter(x => !x.annullato).reduce((s, x) => s + (x.totale || 0), 0)
  const totaleCarte = scontriniFiltrati.filter(x => !x.annullato && x.metodo === 'carta').reduce((s, x) => s + (x.totale || 0), 0)
  const totaleContanti = scontriniFiltrati.filter(x => !x.annullato && x.metodo === 'contanti').reduce((s, x) => s + (x.totale || 0), 0)
  const totaleIva = scontriniFiltrati.filter(x => !x.annullato).reduce((acc, s) => {
    for (const [k, v] of Object.entries(totaliPerIva(s.righe))) acc[k] = (acc[k] || 0) + v
    return acc
  }, {})





async function eseguiChiusura() {
    // Ricarica gli scontrini freschi da Supabase PRIMA di calcolare i totali,
    // per evitare di usare uno stato locale non aggiornato (es. un annullo
    // appena fatto da un'altra pagina, non ancora rispecchiato qui).
    const storicoFresco = await getStoricoDb(NEGOZIO_ID)

    const scontriniDaChiudere = storicoFresco.filter(s => {
      const dataOk = filtroData ? s.timestamp?.startsWith(filtroData) : true
      const metodoOk = filtroMetodo === 'annullati' ? s.annullato : (!s.annullato && (filtroMetodo === 'tutti' || s.metodo === filtroMetodo))
      const testOk = ricerca
        ? s.id?.toLowerCase().includes(ricerca.toLowerCase()) ||
          s.righe?.some(r => r.nome?.toLowerCase().includes(ricerca.toLowerCase())) ||
          s.contatto?.toLowerCase().includes(ricerca.toLowerCase())
        : true
      return dataOk && metodoOk && testOk
    })

    const totaleGiornalieroFresco = scontriniDaChiudere.filter(x => !x.annullato).reduce((s, x) => s + (x.totale || 0), 0)
    const totaleCarteFresco = scontriniDaChiudere.filter(x => !x.annullato && x.metodo === 'carta').reduce((s, x) => s + (x.totale || 0), 0)
    const totaleContantiFresco = scontriniDaChiudere.filter(x => !x.annullato && x.metodo === 'contanti').reduce((s, x) => s + (x.totale || 0), 0)
    const totaleIvaFresco = scontriniDaChiudere.filter(x => !x.annullato).reduce((acc, s) => {
      for (const [k, v] of Object.entries(totaliPerIva(s.righe))) acc[k] = (acc[k] || 0) + v
      return acc
    }, {})

    const chiusura = {
      id: 'CF' + Date.now(),
      timestamp: new Date().toISOString(),
      numeroChiusura: (chiusure.length + 1),
      numeroScontrini: scontriniDaChiudere.filter(s => !s.annullato).length,
      totaleGiornaliero: totaleGiornalieroFresco,
      totaleCarte: totaleCarteFresco,
      totaleContanti: totaleContantiFresco,
      totaleIva: totaleIvaFresco,
      negozio,
      scontrini: scontriniDaChiudere.map(s => s.id),
    }
    await salvaChiusuraDb(NEGOZIO_ID, chiusura)
    getStoricoDb(NEGOZIO_ID).then(s => setStorico(s)) // aggiorna anche lo stato locale, per coerenza con la UI
    getChiusureDb(NEGOZIO_ID).then(c => setChiusure(c))
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
    } catch { showToast('⚠ Errore invio email') }
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
        .btn-stampa { background: #ffb830; border: none; border-radius: 10px; padding: 14px 40px; font-size: 1rem; font-weight: 700; cursor: pointer; }
        .btn-chiudi { background: transparent; border: 2px solid #444; border-radius: 10px; padding: 14px 40px; font-size: 1rem; color: #aaa; cursor: pointer; }
        @media print { .no-print { display: none !important; } body { background: white !important; } * { color: black !important; border-color: #ddd !important; background: white !important; } }
      </style>
    </head><body>
      <div class="no-print">
        <button class="btn-stampa" onclick="window.print()">🖨️ Stampa / Salva PDF</button>
        <button class="btn-chiudi" onclick="window.close()">✕ Chiudi</button>
      </div>
      ${chiusuraHtml}
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
           {/* 
          <span className={styles.headerSub}>{storico.length} scontrini totali</span>
          */}
        </div>
      </header>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'scontrini' ? styles.tabActive : ''}`} onClick={() => setTab('scontrini')}>
          🧾 Scontrini ({scontriniFiltrati.length})
        </button>
        <button className={`${styles.tab} ${tab === 'chiusure' ? styles.tabActive : ''}`} onClick={() => setTab('chiusure')}>
          🔒 Chiusure ({chiusure.length})
        </button>
      </div>

      {tab === 'scontrini' && (
        <div className={styles.main}>
          <div className={styles.filtri}>
            <input type="text" placeholder="🔍 Cerca per numero, prodotto, email..."
              value={ricerca} onChange={e => setRicerca(e.target.value)} className={styles.searchInput} />
            <input type="date" value={filtroData}
              onChange={e => setFiltroData(e.target.value)} className={styles.dateInput} />
            <div className={styles.metodoFiltro}>
              {['tutti','carta','contanti', ...(user?.role === 'owner' ? ['annullati'] : [])].map(m => (
                <button key={m}
                  className={`${styles.metodoBtn} ${filtroMetodo === m ? styles.metodoActive : ''}`}
                  onClick={() => setFiltroMetodo(m)}>
                  {m === 'tutti' ? 'Tutti' : m === 'carta' ? '💳 Carta' : m === 'contanti' ? '💵 Contanti' : '🗑️ Annullati'}
                </button>
                ))}
                <button
                  className={styles.metodoBtn}
                  onClick={() => setIvaOpen(true)}>
                  🧮 IVA mensile
                </button>
            </div>
          </div>

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

          <div className={styles.lista}>
            {scontriniFiltrati.length === 0 && (
              <div className={styles.empty}>
                <div style={{fontSize:'2rem'}}>🧾</div>
                <div>Nessuno scontrino trovato</div>
              </div>
            )}
            {scontriniFiltrati.map(s => (
              <React.Fragment key={s.id}>
                <div
                  className={`${styles.scontrinoRow} ${selected?.id === s.id ? styles.selected : ''}`}
                  style={s.annullato ? {borderColor:'#ff4d6a', opacity:0.7, background:'rgba(255,77,106,0.05)'} : {}}
                  onClick={() => setSelected(selected?.id === s.id ? null : s)}
                >
                  <div className={styles.scontrinoLeft}>
                    <div className={styles.scontrinoNum}>#{s.numeroScontrino || s.id?.slice(-4)}</div>
                    <div className={styles.scontrinoData}>{fmtData(s.timestamp)}</div>
                  {s.operatoreNome && (
                    <div style={{fontSize:'0.9rem', color:'white', marginTop:2}}>👤 {s.operatoreNome}</div>
                  )}
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
                    <div className={s.annullato ? styles.annullato : `${styles.scontrinoMetodo} ${s.metodo === 'carta' ? styles.carta : styles.contanti}`}>
                      {s.annullato ? '🗑️' : s.metodo === 'carta' ? '💳' : '💵'}
                    </div>
                  </div>
                </div>
                {selected?.id === s.id && (
                  <div className={styles.dettaglio}>
                    <div className={styles.dettaglioHeader}>
                      Dettaglio scontrino #{s.numeroScontrino}
                    </div>
                    {s.righe?.map((r, i) => (
                      <div key={i} style={{display:'flex', flexDirection:'column'}}>
                        <div className={styles.dettaglioRiga}>
                          <span>{r.nome} {r.quantita > 1 ? `×${r.quantita}` : ''}</span>
                          <span>€ {fmt(r.totaleRiga)}</span>
                        </div>
                        {r.nota && (
                          <div style={{fontSize:'0.82rem', color: r.nota.startsWith('+') ? 'yellow' : 'red', paddingLeft:8, marginTop:-4, marginBottom:4}}>
                            📝 {r.nota}{r.nota.startsWith('+') && r.importoBase ? ` +€${((r.importo - r.importoBase)/100).toFixed(2).replace('.',',')}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className={styles.dettaglioTotale}>
                      <span>TOTALE</span>
                      <span>€ {fmt(s.totale)}</span>
                    </div>

                      {Object.entries(totaliPerIva(s.righe)).map(([iva, imp]) => (
                      <div key={iva} className={styles.dettaglioIva}>
                        <span>IVA {iva}%</span>
                        <span>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
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
                  <div className={styles.chiusuraNum}>
                    Chiusura #{c.numeroChiusura}
                    {c.stato && c.stato !== 'inviata' && (
                      <span style={{marginLeft:8, fontSize:'0.65rem', padding:'2px 8px', borderRadius:6,
                        background: c.stato === 'non_inviata' ? 'rgba(255,184,48,0.15)' : 'rgba(100,130,255,0.15)',
                        color: c.stato === 'non_inviata' ? '#ffb830' : '#6482ff'}}>
                        {c.stato === 'non_inviata' ? '⚠ Non inviata RT' : '✎ Manuale'}
                      </span>
                    )}
                  </div>
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
                 {/* STAMPA SU ODF E MANDA LA MAIL
                <div className={styles.chiusuraActions}>
                  <button className={styles.actionBtn} onClick={() => stampaPDF(c)} title="Stampa PDF">🖨️</button>
                  <button className={styles.actionBtn} onClick={() => inviaChiusuraEmail(c)} title="Invia email">📧</button>
                </div>
                */}
              </div>
            ))}
          </div>
        </div>
      )}

      {ivaOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#111318', border: '2px solid #00e5a0', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#00e5a0' }}>🧮 IVA mensile sulle vendite</div>
              <button onClick={() => setIvaOpen(false)}
                style={{ background: 'transparent', border: '1px solid #252830', borderRadius: 8, color: '#eef0f6', padding: '6px 12px', cursor: 'pointer' }}>✕</button>
            </div>
            <input type="month" value={ivaMese}
              onChange={e => { if (e.target.value) setIvaMese(e.target.value) }}
              className={styles.dateInput} />

            {ivaLoading && <div style={{ marginTop: 16, color: '#ffb830' }}>⏳ Calcolo in corso…</div>}
            {ivaErrore && <div style={{ marginTop: 16, color: '#ff4d6a', fontWeight: 700 }}>⚠ {ivaErrore}</div>}

            {ivaRiep && (
              <div style={{ marginTop: 16 }}>
                {ivaRiep.righe.length === 0 ? (
                  <div style={{ color: '#ffffff' }}>Nessuna vendita in questo mese.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ color: '#ffffff', textAlign: 'right' }}>
                        <th style={{ textAlign: 'left', padding: '6px 4px' }}>Aliquota</th>
                        <th style={{ padding: '6px 4px' }}>Lordo</th>
                        <th style={{ padding: '6px 4px' }}>Imponibile</th>
                        <th style={{ padding: '6px 4px' }}>IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ivaRiep.righe.map(r => (
                        <tr key={r.aliquota} style={{ color: '#eef0f6', textAlign: 'right', borderTop: '1px solid #252830' }}>
                          <td style={{ textAlign: 'left', padding: '8px 4px' }}>{r.aliquota}%</td>
                          <td style={{ padding: '8px 4px' }}>€ {fmt(r.lordo)}</td>
                          <td style={{ padding: '8px 4px' }}>€ {fmt(r.imponibile)}</td>
                          <td style={{ padding: '8px 4px' }}>€ {fmt(r.iva)}</td>
                        </tr>
                      ))}
                      <tr style={{ color: '#00e5a0', textAlign: 'right', fontWeight: 700, borderTop: '2px solid #00e5a0' }}>
                        <td style={{ textAlign: 'left', padding: '8px 4px' }}>TOTALE</td>
                        <td style={{ padding: '8px 4px' }}>€ {fmt(ivaRiep.totaleLordo)}</td>
                        <td style={{ padding: '8px 4px' }}>€ {fmt(ivaRiep.totaleImponibile)}</td>
                        <td style={{ padding: '8px 4px' }}>€ {fmt(ivaRiep.totaleIva)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#ffffff' }}>
                  {ivaRiep.numero} {ivaRiep.numero === 1 ? 'scontrino conteggiato' : 'scontrini conteggiati'} · {ivaRiep.annullati} {ivaRiep.annullati === 1 ? 'annullato (escluso)' : 'annullati (esclusi)'}
                </div>
                {ivaRiep.nonStampati > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,77,106,0.12)', border: '1px solid #ff4d6a', color: '#ff4d6a', fontSize: '0.85rem', fontWeight: 700 }}>
                    🚫 {ivaRiep.nonStampati} {ivaRiep.nonStampati === 1 ? 'scontrino NON stampato' : 'scontrini NON stampati'} dalla cassa (€ {fmt(ivaRiep.importoNonStampati)}): {ivaRiep.nonStampati === 1 ? 'escluso' : 'esclusi'} dall'IVA.
                  </div>
                )}
                {ivaRiep.daVerificare > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,184,48,0.12)', border: '1px solid #ffb830', color: '#ffb830', fontSize: '0.85rem', fontWeight: 700 }}>
                    ⚠ {ivaRiep.daVerificare} {ivaRiep.daVerificare === 1 ? 'scontrino da verificare: incluso' : 'scontrini da verificare: inclusi'} nell'IVA, {ivaRiep.daVerificare === 1 ? 'controllalo' : 'controllali'} sulla cassa.
                  </div>
                )}
                {(ivaRiep.senzaRighe > 0 || ivaRiep.differenza !== 0) && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,184,48,0.12)', border: '1px solid #ffb830', color: '#ffb830', fontSize: '0.85rem', fontWeight: 700 }}>
                    ⚠ Controllo di coerenza: {ivaRiep.senzaRighe} {ivaRiep.senzaRighe === 1 ? 'scontrino senza righe' : 'scontrini senza righe'}, differenza tra totali scontrini e righe € {fmt(ivaRiep.differenza)}. I numeri potrebbero non essere completi.
                  </div>
                )}
                <div style={{ marginTop: 14, fontSize: '0.75rem', color: '#ffffff', lineHeight: 1.5 }}>
                  Dato indicativo calcolato dagli scontrini registrati: IVA sulle vendite, scorporata dal lordo di ogni aliquota. Non è la liquidazione: l'IVA da versare dipende anche da IVA sugli acquisti, credito e acconti (conferma con il commercialista). Il valore ufficiale resta quello del registratore: possibili differenze di pochi centesimi.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
