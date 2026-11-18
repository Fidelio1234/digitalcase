import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { parse88F, eseguiChiusuraVerificata, ESITI, chiusuraEseguita } from '@/lib/chiusura3i'

// RCH / Ditron: il programma non puo' rileggere lo stato della cassa come fa con la 3i,
// quindi puo' solo controllare che il comando sia stato accettato.
const ESITI_RT = {
  ...ESITI,
  comando_accettato: {
    colore: '#ffb830', icona: '!', titolo: 'COMANDO ACCETTATO',
    testo: "La cassa ha accettato il comando di chiusura. Controlla che abbia stampato lo scontrino di chiusura Z: con questa cassa il programma non puo' verificarlo.",
  },
}

function esitoChiusuraGenerica(res) {
  if (!res?.ok) return { esito: 'non_eseguita', dettaglio: res?.error || 'La cassa non ha accettato il comando' }
  const testo = typeof res.risposta === 'string' ? res.risposta : ''
  if (/\b(err|errore|error|ko|nak)\b/i.test(testo)) {
    return { esito: 'non_eseguita', dettaglio: 'Risposta della cassa: ' + testo.trim() }
  }
  return { esito: 'comando_accettato' }
}

// Helper: chiama il registratore via service locale (produzione) o API (sviluppo)
async function callRT(marca, body) {
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocalhost) {
    const endpoint = marca === 'rch' ? '/api/rch' : '/api/ditron'
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.json()
  } else {
    console.log('callRT produzione - chiamata a localhost:3002')
    const res = await fetch('http://localhost:3002', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'rt', marca, ...body }) })
    return res.json()
  }
}

export default function PannelloRT({ rtConfig, mappatura, scontrino, onStampa, onChiusura, negozioId }) {
  const [loading, setLoading] = useState(false)
  const [conferma, setConferma] = useState(null)
  const [risultato, setRisultato] = useState(null)
  const [pannelloAperto, setPannelloAperto] = useState(false)
  const [chiusuraFase, setChiusuraFase] = useState(null)      // fase in corso della chiusura 3i
  const [esitoChiusura, setEsitoChiusura] = useState(null)    // esito mostrato nel modal
  const chiusuraInCorso = useRef(false)                        // blocca il doppio tocco
  const [annulloData, setAnnulloData] = useState({ nazz: '', ndoc: '', data: '' })
  const [ristampaData, setRistampaData] = useState({
    dataInizio: new Date().toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,''),
    dataFine: new Date().toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,''),
    dalNumero: 0,
    alNumero: 0,
  })

  if (!rtConfig?.ip) return null

  async function chiamaRT(azione, dati) {
    setLoading(true)
    setRisultato(null)
    try {
      let data

      if (rtConfig.marca === 'rch') {
        let comandi = []
        if (azione === 'chiusura_fiscale') {
          comandi = ['=C3', '=C10']
        } else if (azione === 'lettura_x') {
          comandi = ['=C2', '=C10']
        } else if (azione === 'ristampa') {
          // RCH: stampa DGFE integrale in Z (range specifico non supportato)
          comandi = ['=C3', '=C450/$1']
        } else if (azione === 'annullo') {
          // RCH RT: =k/&ddmmyy/[nazzeramento/]ndocumento
          comandi = [`=k/&${dati.data}/[${dati.numeroAzzeramento}/]${dati.numeroDocumento}`]
        } else if (azione === 'scontrino' && dati?.righe) {
          const mapp = rtConfig.mappatura || {}
          for (const riga of dati.righe) {
            const ivaIndice = mapp[riga.repartoId]?.ivaIndice || 1
            const importoCents = Math.round(riga.importo)
            const descr = (riga.nome || '').replace(/[()\/]/g, ' ').substring(0, 36)
            if (riga.quantita > 1) comandi.push(`=R${ivaIndice}/$${importoCents}/*${riga.quantita}/(${descr})`)
            else comandi.push(`=R${ivaIndice}/$${importoCents}/(${descr})`)
          }
          if (dati.metodo === 'carta') comandi.push('=T4')
          else comandi.push('=T1')
        }
        data = await callRT('rch', { ip: rtConfig.ip, porta: rtConfig.porta || 80, comandi })
      } else {
        // Ditron/3i — costruisci comando prima di inviare
        let cmd = null

        if (azione === 'annullo') {
          if (rtConfig.marca === '3i') {
            // 3i: prima verifica stato con 50F, poi annulla con 52F
            // formato: "zzzz-ssss"52F dove zzzz=num azzeramento, ssss=num scontrino
            const nazz = String(dati.numeroAzzeramento).padStart(4, '0')
            const ndoc = String(dati.numeroDocumento).padStart(4, '0')
            cmd = `"${nazz}-${ndoc}"52F`
          } else {
            cmd = `docannullo mat='${dati.matricola}', nazz=${dati.numeroAzzeramento}, ndoc=${dati.numeroDocumento}, data=${dati.data}`
          }
        } else if (azione === 'ristampa') {
          if (rtConfig.marca === '3i') {
            // formato 15F: "aammgg00001 00030"15F — 16 caratteri: data(6) + n_da(5) + n_a(5)
            // Converte DDMMYY -> YYMMDD
            const fmtData3i = (d) => {
              if (!d || d.length !== 6) return '000000'
              return d.slice(4,6) + d.slice(2,4) + d.slice(0,2) // DDMMYY -> YYMMDD
            }
            const data = fmtData3i(dati.dataInizio)
            const n1 = String(dati.dalNumero || 0).padStart(5, '0')
            const n2 = String(dati.alNumero || 65535).padStart(5, '0')
            cmd = `"${data}${n1}${n2}"15F`
          } else {
            // Ditron: ristampa DGFE per range date
            cmd = `dgfe tipo=160, datada=${dati.dataInizio}, dataa=${dati.dataFine}, nda=${dati.dalNumero}, na=${dati.alNumero}`
          }
        }
      
        data = await callRT(rtConfig.marca || 'ditron', {
          ip: rtConfig.ip, porta: rtConfig.porta,
          azione: cmd ? 'raw' : azione,
          dati: cmd ? { cmd } : dati,
          marca: rtConfig.marca, modalita: rtConfig.modalita || 'MF'
        })
      }

      setRisultato(data)
      return data
    } catch (e) {
      const result = { ok: false, error: e.message }
      setRisultato(result)
      return result
    } finally {
      setLoading(false)
    }
  }

  async function stampaScontrino() {
    if (!scontrino) return
    const righeConRt = scontrino.righe.map(riga => ({
      ...riga,
      numeroRepartoRt: mappatura[riga.repartoId]?.numeroRt || 1,
      ivaIndice: mappatura[riga.repartoId]?.ivaIndice || 1,
    }))
    const res = await chiamaRT('scontrino', {
      righe: righeConRt,
      metodo: scontrino.metodo,
      totale: scontrino.totale,
      resto: scontrino.resto,
      contatto: scontrino.contatto,
    })
    if (res?.ok && onStampa) {
      setPannelloAperto(false)
      onStampa()
    }
  }

  function chiusuraFiscale(tipo) {
    const tipoLabel = tipo === 1 ? 'semplice' : tipo === 2 ? 'con report reparti+IVA' : 'media'
    setConferma({
      titolo: 'Chiusura Fiscale Z',
      messaggio: 'Eseguire la chiusura fiscale Z ' + tipoLabel + '? Questa operazione azzera i totalizzatori giornalieri.',
      colore: '#ffb830',
      onConferma: async () => {
        if (rtConfig.marca === '3i') {
          // 3i: la cassa viene letta prima e dopo la chiusura (comando 88F)
          await chiusura3iVerificata(tipo)
          return
        }
        await chiusuraGenerica(tipo)
      }
    })
  }









  // Chiusura RCH / Ditron: la riga in "chiusure" si salva solo se la cassa ha accettato il comando.
  async function chiusuraGenerica(tipo) {
    if (chiusuraInCorso.current) return
    chiusuraInCorso.current = true
    setPannelloAperto(false)
    setEsitoChiusura(null)
    setRisultato(null)
    setLoading(true)
    setChiusuraFase('chiusura')
    let r
    try {
      const res = await chiamaRT('chiusura_fiscale', { tipo })
      console.log('📟 Risposta cassa (chiusura Z):', JSON.stringify(res))
      r = esitoChiusuraGenerica(res)
      if (r.esito === 'comando_accettato') {
        try {
          await salvaChiusura('inviata')
        } catch (e) {
          console.error('Errore salvataggio chiusura:', e)
          r = { ...r, dettaglio: 'Chiusura eseguita ma NON salvata nello storico del programma. Non ripetere la chiusura: avvisa subito l\'assistenza (339 119 9015) e segna i totali del giorno.' }
        }
      }
    } catch (e) {
      r = { esito: 'non_raggiungibile', dettaglio: e.message }
    } finally {
      chiusuraInCorso.current = false
      setLoading(false)
      setChiusuraFase(null)
      setRisultato(null)
    }
    setEsitoChiusura(r)
  }

  // Chiusura 3i con verifica reale: legge la cassa prima, manda la Z,
  // controlla che la cassa abbia chiuso e che abbia inviato all'Agenzia.
  async function chiusura3iVerificata(tipo) {
    if (chiusuraInCorso.current) return
    chiusuraInCorso.current = true
    setPannelloAperto(false)
    setEsitoChiusura(null)
    setRisultato(null)
    setLoading(true)
    setChiusuraFase('lettura')

    const parametri = { ip: rtConfig.ip, porta: rtConfig.porta, marca: rtConfig.marca, modalita: rtConfig.modalita || 'MF' }
    const chiediStato = async () => {
      const r = await callRT(rtConfig.marca, { ...parametri, azione: 'raw', dati: { cmd: '88F' } })
      if (!r?.ok) throw new Error(r?.error || 'Cassa non raggiungibile')
      return parse88F(r.risposta)
    }
    const inviaChiusura = async () => {
      try { return await callRT(rtConfig.marca, { ...parametri, azione: 'chiusura_fiscale', dati: { tipo } }) }
      catch (e) { return { ok: false, error: e.message } }
    }

    let r
    try {
      r = await eseguiChiusuraVerificata({ chiediStato, inviaChiusura, onFase: setChiusuraFase })
      if (chiusuraEseguita(r.esito)) {
        try {
          await salvaChiusura(r.esito, r.azzeramentoDopo)
          // aggiornaChiusureTrasmesse: se la cassa non ha piu' chiusure in attesa (pending 0),
          // quelle rimaste "non inviata" sono state trasmesse: si aggiornano.
          if (r.esito === 'inviata' && r.pendingDopo === 0) {
            try {
              const { error: errAgg } = await supabase.from('chiusure')
                .update({ stato: 'inviata' })
                .eq('negozio_id', negozioId).eq('stato', 'non_inviata')
              if (errAgg) console.warn('Aggiornamento chiusure trasmesse non riuscito:', errAgg.message)
            } catch (e) { console.warn('Aggiornamento chiusure trasmesse non riuscito:', e.message) }
          }
        } catch (e) {
          console.error('Errore salvataggio chiusura:', e)
          r = { ...r, dettaglio: 'Chiusura eseguita ma NON salvata nello storico del programma. Non ripetere la chiusura: avvisa subito l\'assistenza (339 119 9015) e segna i totali del giorno.' }
        }
      }
    } catch (e) {
      r = { esito: 'non_raggiungibile', dettaglio: e.message }
    } finally {
      chiusuraInCorso.current = false
      setLoading(false)
      setChiusuraFase(null)
    }
    setEsitoChiusura(r)
  }

  // Riprova una chiamata Supabase (3 tentativi, pausa crescente). Se fallisce sempre lancia l'errore:
  // cosi' il chiamante mostra l'avviso "Chiusura eseguita ma NON salvata" invece di perderla in silenzio.
  async function conRiprova(chiama, nome) {
    let ultimo = null
    for (let i = 1; i <= 3; i++) {
      let res
      try { res = await chiama() } catch (e) { res = { error: e } }
      if (!res?.error) return res
      ultimo = res.error
      console.warn('⚠️ ' + nome + ': tentativo ' + i + '/3 non riuscito:', res.error.message || res.error)
      if (i < 3) await new Promise(ok => setTimeout(ok, i * 1500))
    }
    throw new Error(nome + ': ' + (ultimo?.message || 'errore sconosciuto'))
  }

  // numeroCassa = numero di azzeramento letto dalla cassa (3i). Se manca, contatore giornaliero come prima.
  async function salvaChiusura(stato, numeroCassa) {
    const ora = new Date().toISOString()
    const oggi = ora.split('T')[0]
    const { data: ultimaChiusura } = await conRiprova(() => supabase
      .from('chiusure').select('timestamp_chiusura')
      .eq('negozio_id', negozioId)
      .order('timestamp_chiusura', { ascending: false })
      .limit(1).maybeSingle(), 'Lettura ultima chiusura')
    const dataFrom = ultimaChiusura?.timestamp_chiusura || (oggi + 'T00:00:00')

    const { data: scontriniGrezzi } = await conRiprova(() => supabase
      .from('scontrini').select('totale, metodo, annullato')
      .eq('negozio_id', negozioId)
      .gt('timestamp_emissione', dataFrom)
      .lte('timestamp_emissione', ora), 'Lettura scontrini')
    const scontrini = scontriniGrezzi?.filter(s => !s.annullato) || []
    const totaleGiornaliero = scontrini.reduce((a, s) => a + s.totale, 0)
    const totaleCarte = scontrini.filter(s => s.metodo === 'carta').reduce((a, s) => a + s.totale, 0)
    const totaleContanti = scontrini.filter(s => s.metodo === 'contanti').reduce((a, s) => a + s.totale, 0)
    const numeroScontrini = scontrini.length

    const { data: cont } = await conRiprova(() => supabase
      .from('contatori').select('chiusure')
      .eq('negozio_id', negozioId).eq('data', oggi).maybeSingle(), 'Lettura contatori')
    const numChiusura = numeroCassa ?? ((cont?.chiusure || 0) + 1)

    const riga = {
      negozio_id: negozioId, numero_chiusura: numChiusura, stato,
      timestamp_chiusura: ora, numero_scontrini: numeroScontrini,
      totale_giornaliero: totaleGiornaliero, totale_carte: totaleCarte,
      totale_contanti: totaleContanti, totale_iva: {},
    }
    await conRiprova(async () => {
      // se un tentativo precedente e' arrivato al database ma la risposta si e' persa, non duplica la riga
      const { data: esiste } = await supabase.from('chiusure').select('id')
        .eq('negozio_id', negozioId).eq('timestamp_chiusura', ora).maybeSingle()
      if (esiste) return { error: null }
      return await supabase.from('chiusure').insert(riga)
    }, 'Salvataggio chiusura')

    // il contatore e' secondario: la chiusura e' gia' salvata, quindi un errore qui non la invalida
    try {
      await conRiprova(() => supabase.from('contatori').upsert({
        negozio_id: negozioId, data: oggi,
        chiusure: numChiusura, scontrini: cont?.scontrini || 0,
      }, { onConflict: 'negozio_id,data' }), 'Aggiornamento contatori')
    } catch (e) {
      console.warn('⚠️ Contatori non aggiornati (la chiusura e\' salvata):', e.message)
    }
  }








  async function letturaX(tipo) {
    await chiamaRT('lettura_x', { tipo })
  }

  function annulloScontrino() {
    if (!annulloData.nazz || !annulloData.ndoc || !annulloData.data) {
      setConferma({
        titolo: 'Dati mancanti',
        messaggio: 'Compila N° Chiusura, N° Documento e Data prima di procedere.',
        colore: '#ffb830', onConferma: null
      })
      return
    }
    setConferma({
      titolo: 'Annullo Scontrino RT',
      messaggio: 'Confermi annullo scontrino n° ' + annulloData.ndoc + ' chiusura ' + annulloData.nazz + '? Operazione comunicata AdE.',
      colore: '#ff4d6a',
      onConferma: () => chiamaRT('annullo', {
        matricola: rtConfig.matricola,
        numeroAzzeramento: annulloData.nazz,
        numeroDocumento: annulloData.ndoc,
        data: annulloData.data,
      })
    })
  }

  async function ristampaDGFE() {
    await chiamaRT('ristampa', ristampaData)
  }

  const btnStyle = (color) => {
    const m = /^var\(--dc-([a-z0-9-]+)\)$/.exec(color || '')
    const rgb = 'var(--dc-' + (m ? m[1] : 'border') + '-rgb)'
    return {
      padding:'10px 16px', borderRadius:10,
      border:'1px solid rgba(' + rgb + ', 0.267)',
      cursor: loading ? 'not-allowed' : 'pointer',
      background: m ? 'rgba(' + rgb + ', 0.133)' : 'var(--dc-surface2)',
      color: m ? color : 'var(--dc-text)',
      fontSize:'0.82rem', fontFamily:"'DM Mono',monospace",
      opacity: loading ? 0.6 : 1,
      display:'flex', alignItems:'center', gap:8,
    }
  }

  const inputStyle = {
    width:'100%', boxSizing:'border-box',
    background:'var(--dc-surface2)', border:'1px solid var(--dc-border)',
    borderRadius:6, padding:'4px 8px',
    color:'var(--dc-lime)', fontSize:'1.1rem', textAlign:'center',
    fontFamily:"'DM Mono',monospace"
  }

  return (
    <div style={{ position:'fixed', top:8, left:220, zIndex:400 }}>




      
<div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div onClick={() => setPannelloAperto(!pannelloAperto)} style={{
          padding:'8px 14px', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8,
          background:'var(--dc-surface2)', borderRadius:10, border:'1px solid var(--dc-border)',
        }}>
          <div style={{
            width:8, height:8, borderRadius:'50%',
            background: rtConfig.attivo ? 'var(--dc-verde)' : 'var(--dc-muted)',
            boxShadow: rtConfig.attivo ? '0 0 8px var(--dc-verde)' : 'none'
          }} />
          <span style={{fontSize:'0.78rem', fontFamily:"'DM Mono',monospace", color:'var(--dc-giallo)'}}>
            MENU RT {rtConfig.marca?.toUpperCase()}
          </span>
          <span style={{color:'var(--dc-muted)', fontSize:'0.75rem'}}>{pannelloAperto ? '▼' : '▲'}</span>
        </div>
        {rtConfig.attivo && rtConfig.ip && (
          <button
            onClick={() => chiamaRT('raw', { cmd: 'a' })}
            title="Apri cassetto"
            style={{
              padding:'8px 12px', cursor:'pointer',
              background:'var(--dc-surface2)', borderRadius:10, border:'1px solid var(--dc-ambra)',
              color:'var(--dc-ambra)', fontSize:'0.78rem', fontWeight:700, marginLeft:50,
              fontFamily:"'DM Mono',monospace",
            }}>
            🗃️ Apri Cassetto 
          </button>
        )}
      </div>




      {pannelloAperto && (
        <div style={{
          position:'fixed', inset:0, zIndex:500,
          background:'rgba(var(--dc-bg-rgb), 0.85)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={() => setPannelloAperto(false)}>
          <div style={{
            background:'var(--dc-surface)', border:'1px solid var(--dc-border)',
            borderRadius:20, padding:24,
            width:880, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto',
            boxShadow:'0 24px 64px rgba(0,0,0,0.7)',
            display:'flex', flexDirection:'column', gap:14,
          }} onClick={e => e.stopPropagation()}>

            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{color:'var(--dc-giallo)', fontSize:'2rem'}}>MENU RT - {rtConfig.marca?.toUpperCase()}</div>
              <button onClick={() => setPannelloAperto(false)}
                style={{background:'transparent', border:'none', color:'var(--dc-rosso-vivo)', cursor:'pointer', fontSize:'1.2rem'}}>X</button>
            </div>

            {scontrino && (
              <div>
                <div style={{fontSize:'0.7rem', color:'var(--dc-forte)', letterSpacing:1, marginBottom:8}}>SCONTRINO CORRENTE</div>
                <button style={btnStyle('var(--dc-verde)')} onClick={stampaScontrino} disabled={loading}>Stampa su RT</button>
              </div>
            )}

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))', gap:28, alignItems:'start'}}>
            <div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                <div style={{width:'100%', color:'var(--dc-ambra)'}}>CHIUSURE FISCALI</div>
                <button style={btnStyle('var(--dc-ambra)')} onClick={() => chiusuraFiscale(1)} disabled={loading}>Chiusura fiscale Z (semplice)</button>
<button style={btnStyle('var(--dc-ambra)')} onClick={() => chiusuraFiscale(2)} disabled={loading}>Chiusura fiscale Z (con report reparti+IVA)</button>
                <br/>


                <div style={{width:'100%', color:'var(--dc-ambra)'}}>LETTURA PARZIALE</div>
                <button style={btnStyle('var(--dc-ambra)')} onClick={() => letturaX(2)} disabled={loading}>Lettura X (parziale)</button>
                <br/>
                <div style={{width:'100%', color:'var(--dc-ambra)'}}>RISTAMPA SCONTRINI (dal DGFE)</div>
                <button style={btnStyle('var(--dc-verde)')} onClick={() => chiamaRT('raw', { cmd: '91F' })} disabled={loading}>Ristampa ultimo scontrino</button>
                <button style={btnStyle('var(--dc-verde)')} onClick={() => chiamaRT('raw', { cmd: '92F' })} disabled={loading}>Ristampa penultimo</button>
                <button style={btnStyle('var(--dc-verde)')} onClick={() => chiamaRT('raw', { cmd: '93F' })} disabled={loading}>Ristampa terzultimo</button>



              </div>

            </div>

            <div style={{display:'flex', flexDirection:'column', gap:24}}>
            <div>
              <div style={{width:'100%', color:'var(--dc-rosso)'}}>ANNULLO SCONTRINO RT</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6}}>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-rosso)'}}>N° CHIUSURA</label>
                  <input type="number" value={annulloData.nazz}
                    onChange={e => setAnnulloData(d => ({...d, nazz: e.target.value}))}
                    placeholder="0001" style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-rosso)'}}>N° DOCUMENTO</label>
                  <input type="number" value={annulloData.ndoc}
                    onChange={e => setAnnulloData(d => ({...d, ndoc: e.target.value}))}
                    placeholder="0001" style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-rosso)'}}>DATA (DDMMYY)</label>
                  <input type="text" value={annulloData.data}
                    onChange={e => setAnnulloData(d => ({...d, data: e.target.value}))}
                    placeholder="010126" maxLength={6} style={inputStyle} />
                </div>
              </div>
              <button style={btnStyle('var(--dc-rosso)')} onClick={annulloScontrino} disabled={loading}>Annulla scontrino RT</button>
            </div>

            <div>
              <div style={{width:'100%', color:'var(--dc-lime)'}}>RISTAMPA DA DGFE</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6}}>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-lime)'}}>DA DATA (DDMMYY)</label>
                  <input type="text" value={ristampaData.dataInizio}
                    onChange={e => setRistampaData(d => ({...d, dataInizio: e.target.value}))}
                    maxLength={6} style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-lime)'}}>A DATA (DDMMYY)</label>
                  <input type="text" value={ristampaData.dataFine}
                    onChange={e => setRistampaData(d => ({...d, dataFine: e.target.value}))}
                    maxLength={6} style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-lime)'}}>DA N° SCONTRINO</label>
                  <input type="number" value={ristampaData.dalNumero}
                    onChange={e => setRistampaData(d => ({...d, dalNumero: parseInt(e.target.value)}))}
                    placeholder="0 = tutti" style={inputStyle} />
                </div>
                <div>
                  <label style={{fontSize:'12px', color:'var(--dc-lime)'}}>A N° SCONTRINO</label>
                  <input type="number" value={ristampaData.alNumero}
                    onChange={e => setRistampaData(d => ({...d, alNumero: parseInt(e.target.value)}))}
                    placeholder="0 = tutti" style={inputStyle} />
                </div>
              </div>
              <button style={btnStyle('var(--dc-lime)')} onClick={ristampaDGFE} disabled={loading}>Ristampa scontrini</button>
            </div>
            </div>
            </div>

            {loading && (
              <div style={{textAlign:'center', color:'var(--dc-muted)', fontSize:'0.8rem'}}>⏳ Comunicazione con la cassa...</div>
            )}
            {risultato && (
              <div style={{
                padding:'10px 12px', borderRadius:8,
                background: risultato.ok ? 'rgba(var(--dc-verde-rgb), 0.1)' : 'rgba(var(--dc-rosso-rgb), 0.1)',
                border: '1px solid ' + (risultato.ok ? 'rgba(var(--dc-verde-rgb), 0.25)' : 'rgba(var(--dc-rosso-rgb), 0.25)'),
                fontSize:'0.75rem', fontFamily:"'DM Mono',monospace",
                color: risultato.ok ? 'var(--dc-verde)' : 'var(--dc-rosso)',
              }}>
                {risultato.ok ? '✓ ' : '✗ '}{risultato.risposta || risultato.error || 'OK'}
              </div>
            )}
          </div>
        </div>
      )}

      {(chiusuraFase || esitoChiusura) && (() => {
        const e = esitoChiusura ? ESITI_RT[esitoChiusura.esito] : null
        const colore = e ? e.colore : '#ffb830'
        const fasi = {
          lettura: 'Controllo la cassa...',
          chiusura: 'Chiusura in corso... non spegnere la cassa',
          verifica: 'Attendo la conferma dalla cassa...',
          invio: "Invio all'Agenzia delle Entrate...",
        }
        const dettaglio = esitoChiusura?.dettaglio
        const servizioOff = dettaglio && /failed to fetch|networkerror/i.test(dettaglio)
        return (
          <div style={{ position:'fixed', inset:0, zIndex:700, background:'rgba(8,9,12,0.92)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div style={{
              background:'#111318', border:'2px solid ' + colore, borderRadius:24,
              padding:'36px 44px', width:560, maxWidth:'95vw',
              display:'flex', flexDirection:'column', alignItems:'center', gap:16, textAlign:'center',
              boxShadow:'0 0 64px ' + colore + '33',
            }}>
              {!e ? (
                <>
                  <div style={{ fontSize:'2.4rem' }}>⏳</div>
                  <div style={{ fontSize:'1.2rem', fontWeight:700, color:'#ffb830' }}>{fasi[chiusuraFase] || 'Attendere...'}</div>
                  <div style={{ fontSize:'0.8rem', color:'#aeb0bc' }}>Non chiudere questa finestra</div>
                </>
              ) : (
                <>
                  <div style={{
                    width:72, height:72, borderRadius:'50%', border:'2px solid ' + colore, background: colore + '22',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.2rem', fontWeight:700, color:colore,
                  }}>{e.icona}</div>
                  <div style={{ fontSize:'1.5rem', fontWeight:700, color:colore, letterSpacing:1 }}>{e.titolo}</div>
                  <div style={{ fontSize:'0.95rem', color:'#eef0f6', lineHeight:1.6 }}>{e.testo}</div>
                  {esitoChiusura.azzeramentoDopo != null && (
                    <div style={{ fontSize:'0.9rem', color:'#ffffff', fontFamily:"'DM Mono',monospace" }}>
                      Chiusura n° {String(esitoChiusura.azzeramentoDopo).padStart(4, '0')}
                    </div>
                  )}
                  {esitoChiusura.esito === 'non_inviata' && (
                    <div style={{ fontSize:'0.9rem', color:'#ffb830', fontFamily:"'DM Mono',monospace" }}>
                      Chiusure in attesa di invio: {esitoChiusura.pendingDopo}
                    </div>
                  )}
                  {dettaglio && (
                    <div style={{ fontSize:'0.75rem', color:'#aeb0bc', fontFamily:"'DM Mono',monospace" }}>
                      {servizioOff ? 'Il servizio locale DigitalCase non risponde su questo PC: controlla che sia acceso.' : dettaglio}
                    </div>
                  )}
                  <button onClick={() => setEsitoChiusura(null)} style={{
                    marginTop:8, padding:'12px 40px', borderRadius:12, border:'none',
                    background:colore, color:'#08090c', fontWeight:700, fontSize:'1rem', cursor:'pointer',
                  }}>OK</button>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {conferma && (
        <div style={{
          position:'fixed', inset:0, zIndex:600,
          background:'rgba(var(--dc-bg-rgb), 0.92)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{
            background:'var(--dc-surface)', border:'1px solid ' + conferma.colore + '44',
            borderRadius:20, padding:28, width:380, maxWidth:'90vw',
            display:'flex', flexDirection:'column', gap:16,
          }}>
            <div style={{fontSize:'1rem', fontWeight:700, color:'var(--dc-text)'}}>{conferma.titolo}</div>
            <div style={{fontSize:'0.82rem', color:'#aeb0bc', lineHeight:1.6}}>{conferma.messaggio}</div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={() => setConferma(null)} style={{
                flex:1, padding:'10px', borderRadius:10,
                border:'1px solid var(--dc-border)', background:'transparent',
                color:'var(--dc-text)', cursor:'pointer', fontSize:'0.85rem'
              }}>Annulla</button>
              {conferma.onConferma && (
                <button onClick={() => { setConferma(null); conferma.onConferma() }} style={{
                  flex:1, padding:'10px', borderRadius:10,
                  border:'none', background:conferma.colore,
                  color:'var(--dc-bg)', cursor:'pointer', fontSize:'0.85rem', fontWeight:700
                }}>Conferma</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}