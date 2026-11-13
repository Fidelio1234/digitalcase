import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getTavoliDb, salvaTavoloDb, chiudiTavoloDb, getImpostazioniDb, getRepartiDb, salvaStoricoTavolo } from '@/lib/supabase-db'
import { stampaComanda } from '@/lib/stampante'
import { supabase } from '@/lib/supabase'
import { useNegozioId } from '@/hooks/useNegozioId'
import { useNegozio } from '@/context/NegozioContext'
import { stampaPrecontoRT } from '@/lib/preconto-rt'


const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect



const ICONE = {
  coffee:'☕', beer:'🍺', wine:'🍷', cocktail:'🍹', pizza:'🍕',
  sandwich:'🥪', icecream:'🍦', candy:'🍬', croissant:'🥐',
  apple:'🍎', salad:'🥗', meat:'🥩', gift:'🎁', star:'⭐',
  bread:'🍞', diamond:'💎'
}

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function tempoTrascorso(iso) {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return diff + 's'
  if (diff < 3600) return Math.floor(diff / 60) + 'm'
  return Math.floor(diff / 3600) + 'h ' + Math.floor((diff % 3600) / 60) + 'm'
}


// Ripartisce la quota tra reparti/IVA in proporzione al conto. La somma delle righe = importoQuota.
function righeQuotaRomana(righe, importoQuota, numeroTavolo) {
  const gruppi = new Map()
  for (const r of righe) {
    if (!(r.totaleRiga > 0)) continue
    const k = `${r.repartoId ?? 'x'}|${r.iva}`
    const g = gruppi.get(k) || { repartoId: r.repartoId ?? null, iva: r.iva, colore: r.colore, icona: r.icona, totale: 0 }
    g.totale += r.totaleRiga
    gruppi.set(k, g)
  }
  const lista = [...gruppi.values()].sort((a, b) => b.totale - a.totale)
  const totaleConto = lista.reduce((s, g) => s + g.totale, 0)
  if (lista.length === 0 || totaleConto <= 0) return []
  let assegnato = 0
  for (const g of lista) { g.imp = Math.floor(importoQuota * g.totale / totaleConto); assegnato += g.imp }
  lista[0].imp += importoQuota - assegnato
  const ts = Date.now()
  return lista.filter(g => g.imp > 0).map((g, i) => ({
    id: `quota-${numeroTavolo}-${ts}-${i}`,
    nome: lista.length > 1 ? `Quota tavolo ${numeroTavolo} (IVA ${g.iva}%)` : `Quota tavolo ${numeroTavolo}`,
    importo: g.imp, quantita: 1, totaleRiga: g.imp, iva: g.iva,
    colore: g.colore, icona: g.icona, repartoId: g.repartoId, sottoRepartoId: null,
    quotaTavolo: numeroTavolo,
  }))
}




export default function TavoliPage() {
  const NEGOZIO_ID = useNegozioId()
  const { negozio: negozioCtx } = useNegozio() || {}
  const [precontoRtInCorso, setPrecontoRtInCorso] = useState(false)
  const [precontoGrigliaMsg, setPrecontoGrigliaMsg] = useState(null) // { n, testo }
  const [precontoStampati, setPrecontoStampati] = useState({}) // { [numeroTavolo]: { ora, totale, aperto } }
  useEffect(() => {
    if (!NEGOZIO_ID) return
    try { setPrecontoStampati(JSON.parse(localStorage.getItem('dc_preconto_' + NEGOZIO_ID) || '{}') || {}) } catch (e) {}
  }, [NEGOZIO_ID])
  const cassa3i = negozioCtx?.rt_config?.config?.marca === '3i'
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tavoli, setTavoli] = useState([])
  const [impostazioni, setImpostazioni] = useState({ copertoAbilitato: false, copertoImporto: 200, numeroTavoli: 10 })
  const [reparti, setReparti] = useState([])
  const [tavoloAttivo, setTavoloAttivo] = useState(null)
  const [vista, setVista] = useState('griglia')
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [righeComanda, setRigheComanda] = useState([])
  const [inputCents, setInputCents] = useState(0)
  const [timer, setTimer] = useState(0)
  const [modalCoperti, setModalCoperti] = useState(null)
  const [numCoperti, setNumCoperti] = useState(1)
  const [invioOk, setInvioOk] = useState(false)
  const [notaModal, setNotaModal] = useState(null)
  const [notaTesto, setNotaTesto] = useState('')
  const [notaTipo, setNotaTipo] = useState('rimozione')
  const [aggiunte, setAggiunte] = useState([]) // voci selezionate dalla lista "aggiunte rapide" (per negozio)
  const [modalAnnulla, setModalAnnulla] = useState(false)
  const [infoAnnulla, setInfoAnnulla] = useState(null) // quote gia' incassate alla romana (centesimi)
  const [showConto, setShowConto] = useState(false)
    const [romanaPersone, setRomanaPersone] = useState(2)
const [selezione, setSelezione] = useState({}) // { idRiga: quantità da pagare }





  // ── carica definita con useCallback per stabilità nelle dipendenze ──────
  const carica = useCallback(async () => {
    if (!NEGOZIO_ID) return
    const [t, imp, r] = await Promise.all([
      getTavoliDb(NEGOZIO_ID),
      getImpostazioniDb(NEGOZIO_ID),
      getRepartiDb(NEGOZIO_ID)
    ])
    const tavMap = Object.fromEntries(t.map(x => [x.numero, x]))
    const tutti = Array.from({ length: imp.numeroTavoli }, (_, i) => {
      const n = i + 1
      return tavMap[n] || { id: null, numero: n, stato: 'libero', coperti: 0, righe: [], ultimoOrdine: null, apertoAlle: null }
    })
    setTavoli(tutti)
    setImpostazioni(imp)
    const abilitati = r.filter(x => x.abilitato)
    setReparti(abilitati)
    setRepartoAttivo(prev =>
      abilitati.some(x => x.id === prev) ? prev : (abilitati[0]?.id ?? null)
    )
  }, [NEGOZIO_ID])

  // ── caricamento iniziale ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    carica()
  }, [user, loading, carica])

  // ── timer ogni 30s per aggiornare tempi visualizzati ────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTimer(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // ── polling ogni 3 secondi — solo nella vista griglia ───────────────────
  useEffect(() => {
    if (vista !== 'griglia') return
    const interval = setInterval(carica, 3000)
    return () => clearInterval(interval)
  }, [vista, carica])


  const inviandoRef = useRef(false)
  const [inviando, setInviando] = useState(false)


   const riapriRef = useRef(null)
  const [riapriAttesa, setRiapriAttesa] = useState(false)
  useIsoLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem('riapri_tavolo')
      if (!raw) return
      sessionStorage.removeItem('riapri_tavolo')
      const d = JSON.parse(raw)
      if (d && d.numero != null && Date.now() - (d.ts || 0) < 30000) {
        riapriRef.current = d
        setRiapriAttesa(true)
        setTimeout(() => setRiapriAttesa(false), 4000)
      }
    } catch {}
  }, [])
  useEffect(() => {
    const d = riapriRef.current
    if (!d || !tavoli.length) return
    riapriRef.current = null
    const t = tavoli.find(x => String(x.numero) === String(d.numero))
    if (t && t.stato !== 'libero') {
      apriTavolo(t)
      if (d.conto) {
        const haCoperto = (t.righe || []).some(r => r.id === 'coperto' && r.quantita > 0)
        setSelezione(haCoperto ? { coperto: 1 } : {})
        const rCop = (t.righe || []).find(r => r.id === 'coperto')
        setRomanaPersone(Math.max(2, rCop?.quantita || t.coperti || 2))
        setShowConto(true)
      }
    }
    setRiapriAttesa(false)
  }, [tavoli])

  function apriTavolo(tavolo) {
    if (impostazioni.copertoAbilitato && tavolo.stato === 'libero') {
      setNumCoperti(1)
      setModalCoperti(tavolo.numero)
      return
    }
    setTavoloAttivo(tavolo.numero)
    setRigheComanda([...tavolo.righe])
    setVista('comanda')
    setInputCents(0)
  }

  function confermaCoperti(numero, coperti) {
    const updated = tavoli.map(t => t.numero === numero ? {...t, coperti} : t)
    setTavoli(updated)
    setModalCoperti(null)
    setTavoloAttivo(numero)
    const tavolo = updated.find(t => t.numero === numero)
    const righe = [...(tavolo.righe || [])]
    const hasCoperto = righe.some(r => r.id === 'coperto')
    if (coperti > 0 && !hasCoperto) {
      righe.unshift({
        id: 'coperto',
        nome: 'Coperto',
        importo: impostazioni.copertoImporto,
        quantita: coperti,
        totaleRiga: impostazioni.copertoImporto * coperti,
        iva: 10,
        colore: '#ffb830',
        icona: 'star',
        repartoId: null,
      })
    }
    setRigheComanda(righe)
    setVista('comanda')
    setInputCents(0)
  }

  function pressDigit(n) {
    setInputCents(prev => {
      const s = String(prev) + String(n)
      return parseInt(s.slice(-8))
    })
  }

  function pressClear() { setInputCents(0) }

  function aggiungiProdotto(reparto, prodotto) {
    const importo = prodotto.prezzoFisso || inputCents
    if (!importo) return
    const riga = {
      id: Date.now() + Math.random(),
      nome: prodotto.nome,
      importo,
      quantita: 1,
      totaleRiga: importo,
      iva: prodotto.ivaOverride || reparto.iva,
      colore: reparto.colore,
      icona: reparto.icona,
      repartoId: reparto.id,
    }
    setRigheComanda(prev => {
      const existing = prev.find(r => r.nome === riga.nome && r.importo === riga.importo)
      if (existing) {
        return prev.map(r => r.id === existing.id
          ? { ...r, quantita: r.quantita + 1, totaleRiga: r.importo * (r.quantita + 1) }
          : r)
      }
      return [...prev, riga]
    })
    setInputCents(0)
  }

  function aggiungiReparto(reparto) {
    if (!inputCents) return
    const riga = {
      id: Date.now() + Math.random(),
      nome: reparto.nome,
      importo: inputCents,
      quantita: 1,
      totaleRiga: inputCents,
      iva: reparto.iva,
      colore: reparto.colore,
      icona: reparto.icona,
      repartoId: reparto.id,
    }
    setRigheComanda(prev => [...prev, riga])
    setInputCents(0)
  }

  function salvaNota(id, nota, tipo = 'rimozione', costoAggiunta = 50) {
    setRigheComanda(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx === -1) return prev
      const r = prev[idx]
      const importoBase = r.importoBase ?? r.importo

      function applicaNota(riga) {
        if (tipo === 'aggiunta' && nota) {
          return {
            ...riga,
            nota: `+${nota}`,
            importoBase,
            importo: importoBase + costoAggiunta,
            totaleRiga: (importoBase + costoAggiunta) * riga.quantita,
          }
        }
        return {
          ...riga,
          nota: nota ? `-${nota}` : '',
          importoBase,
          importo: importoBase,
          totaleRiga: importoBase * riga.quantita,
        }
      }

      // Se la riga rappresenta più di un'unità, la nota riguarda solo UNA unità:
      // stacchiamo quella unità in una riga separata con la nota, le restanti
      // restano nella riga originale, invariate.
      if ((r.quantita || 1) > 1) {
        const nuove = [...prev]
        nuove[idx] = { ...r, quantita: r.quantita - 1, totaleRiga: importoBase * (r.quantita - 1) }
        const rigaStaccata = applicaNota({ ...r, id: Date.now() + Math.random(), quantita: 1 })
        nuove.splice(idx + 1, 0, rigaStaccata)
        return nuove
      }

      const nuove = [...prev]
      nuove[idx] = applicaNota(r)
      return nuove
    })
  }

  function eliminaRiga(id) {
    setRigheComanda(prev => prev.filter(r => r.id !== id))
  }

  function aggiornaQuantita(id, delta) {
    const minimo = id === 'coperto' ? 1 : 0
    setRigheComanda(prev => prev
      .map(r => r.id === id
        ? { ...r,
            quantita: Math.max(minimo, r.quantita + delta),
            totaleRiga: r.importo * Math.max(minimo, r.quantita + delta)
          }
        : r
      )
      .filter(r => r.quantita > 0)
    )
  }

  const totale = righeComanda.reduce((s, r) => s + r.totaleRiga, 0)


// La comanda è "sincronizzata" se quello che vedi coincide con quanto salvato nel DB.
// Serve per pagare per prodotti: non si incassa ciò che non è mai stato registrato.
const comandaSincronizzata = (() => {
  const salvate = tavoli.find(t => t.numero === tavoloAttivo)?.righe || []
  if (salvate.length !== righeComanda.length) return false
  return righeComanda.every(r => {
    const v = salvate.find(x => x.id === r.id)
    return v && v.quantita === r.quantita && v.importo === r.importo && (v.nota || '') === (r.nota || '')
  })
})()

const totaleSelezionato = righeComanda.reduce((s, r) => s + r.importo * (selezione[r.id] || 0), 0)


const divisioneCorrente = tavoli.find(t => t.numero === tavoloAttivo)?.divisione || null
const romanaPagato = divisioneCorrente?.importoPagato || 0
const romanaQuotePagate = divisioneCorrente?.quotePagate || 0
const romanaPersoneTot = divisioneCorrente?.persone ?? romanaPersone
const romanaPersoneRestanti = Math.max(1, romanaPersoneTot - romanaQuotePagate)
const romanaResiduo = Math.max(0, totale - romanaPagato)
const romanaImporto = romanaPersoneRestanti <= 1
  ? romanaResiduo
  : Math.round(romanaResiduo / romanaPersoneRestanti)

function pagaAllaRomana() {
  const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
  if (!tavolo || !comandaSincronizzata || romanaImporto <= 0) return
  const righeCassa = righeQuotaRomana(righeComanda, romanaImporto, tavoloAttivo)
  if (righeCassa.length === 0) return
  sessionStorage.setItem('tavolo_da_chiudere', JSON.stringify({
    numero: tavoloAttivo,
    righe: righeCassa,
    romana: { persone: romanaPersoneTot, quote: 1 },
    coperti: tavolo.coperti || 0,
    apertoAlle: tavolo.apertoAlle || null,
  }))
  
  router.push('/cassa')
}




function cambiaSelezione(id, delta, max) {
  setSelezione(prev => ({ ...prev, [id]: Math.min(max, Math.max(0, (prev[id] || 0) + delta)) }))
}

function pagaSelezionati() {
  const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
  if (!tavolo || !comandaSincronizzata) return
  const righeScelte = righeComanda
    .filter(r => (selezione[r.id] || 0) > 0)
    .map(r => ({ ...r, quantita: selezione[r.id], totaleRiga: r.importo * selezione[r.id] }))
  if (righeScelte.length === 0) return
  sessionStorage.setItem('tavolo_da_chiudere', JSON.stringify({
    numero: tavoloAttivo,
    righe: righeScelte,
    coperti: tavolo.coperti || 0,
    apertoAlle: tavolo.apertoAlle || null,
  }))
  router.push('/cassa')
}




async function inviaComanda() {
  if (inviandoRef.current || righeComanda.length === 0) return
  inviandoRef.current = true
  setInviando(true)
  try {
    
    await inviaComandaInterna()
  } finally {
    // Tengo il blocco qualche secondo: la vista torna alla griglia dopo ~1,2 s
    // e i dati del tavolo si aggiornano solo dopo, quindi un tocco subito dopo
    // rimanderebbe le stesse righe.
    setTimeout(() => { inviandoRef.current = false; setInviando(false) }, 3000)
  }
}

async function inviaComandaInterna() {
    const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
    if (!tavolo) return
    const ora = new Date().toISOString()

    const righeVecchie = tavolo.righe || []
    const righeNuove = righeComanda.filter(r => {
      const vecchia = righeVecchie.find(v => v.id === r.id)
      if (!vecchia) return true
      if (r.id === 'coperto') return false
      return r.quantita > vecchia.quantita
    }).map(r => {
      const vecchia = righeVecchie.find(v => v.id === r.id)
      if (!vecchia) return r
      const diff = r.quantita - vecchia.quantita
      return { ...r, quantita: diff, totaleRiga: r.importo * diff }
    })

    const aggiornato = {
      ...tavolo,
      numero: tavoloAttivo,
      coperti: righeComanda.find(r => r.id === 'coperto')?.quantita ?? tavolo.coperti ?? 0,
      stato: 'occupato',
      righe: righeComanda,
      ultimoOrdine: ora,
      apertoAlle: tavolo.apertoAlle || ora,
    }
    const okSalvataggio = await salvaTavoloDb(NEGOZIO_ID, aggiornato)

    // Prima di stampare controllo che le righe siano davvero sul database:
    // un altro dispositivo (cassa o palmare) può sovrascrivere il tavolo.
    // Se non riesco a rileggere, stampo come prima: meglio una stampa in più
    // che una comanda che non arriva in cucina.
    let righeDopo = null
    let righeMancanti = false
    if (okSalvataggio) {
      try {
        const tavoliDopo = await getTavoliDb(NEGOZIO_ID)
        const tavoloDopo = tavoliDopo.find(t => t.numero === tavoloAttivo)
        righeDopo = tavoloDopo ? (tavoloDopo.righe || []) : []
        righeMancanti = !righeComanda.every(r => {
          const d = righeDopo.find(x => x.id === r.id)
          return !!d && (d.quantita ?? 0) >= (r.quantita ?? 0)
        })
      } catch (e) { /* non so come sia andata: mi comporto come prima */ }
    }

    if (!okSalvataggio || righeMancanti) {
      try {
        await supabase.from('debug_comande').insert({
          negozio_id: NEGOZIO_ID,
          numero_tavolo: tavoloAttivo,
          righe_vecchie: righeVecchie,
          righe_comanda: righeComanda,
          righe_nuove: righeNuove,
          righe_dopo_carica: righeDopo,
        })
      } catch (e) { /* il log non deve mai bloccare la comanda */ }
      window.alert('Comanda NON salvata: il tavolo è stato modificato da un altro dispositivo. Non ho stampato nulla in cucina: controlla il tavolo e rimanda la comanda.')
      carica()
      return
    }

    if (righeNuove.length > 0) {
      await stampaComanda(tavoloAttivo, righeNuove, 'comanda', reparti, NEGOZIO_ID)
    }

    setInvioOk(true)
    setTimeout(() => {
      setInvioOk(false)
      setVista('griglia')
      setTavoloAttivo(null)
      setRigheComanda([])
      setInputCents(0)
    }, 1200)
    carica()
  }





  function totaleRigheTavolo(tv) {
    return (tv.righe || []).reduce((s, r) => s + (r.totaleRiga || 0), 0)
  }

  function statoPrecontoGriglia(tv) {
    if (precontoGrigliaMsg?.n === tv.numero) return { ok: false, testo: precontoGrigliaMsg.testo }
    const p = precontoStampati[tv.numero]
    if (p && p.totale === totaleRigheTavolo(tv) && p.aperto === (tv.apertoAlle || null)) {
      return { ok: true, testo: '✓ Stampato ' + p.ora }
    }
    return null
  }

  async function stampaPrecontoDaGriglia(tavolo) {
    if (precontoRtInCorso) return
    setPrecontoRtInCorso(true)
    setPrecontoGrigliaMsg(null)
    const errore = (testo) => setPrecontoGrigliaMsg({ n: tavolo.numero, testo })
    try {
      let cfg = negozioCtx?.rt_config?.config
      if (!cfg) {
        const { data } = await supabase.from('negozi').select('rt_config').eq('id', NEGOZIO_ID).single()
        cfg = data?.rt_config?.config
      }
      if (!cfg || cfg.marca !== '3i') { errore('✗ Solo con registratore 3i'); return }
      const r = await stampaPrecontoRT(cfg, tavolo.numero, tavolo.righe || [])
      console.log('Preconto cassa 3i (griglia, tavolo ' + tavolo.numero + '):', JSON.stringify(r))
      if (r.ok) {
        const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        const next = { ...precontoStampati, [tavolo.numero]: { ora, totale: totaleRigheTavolo(tavolo), aperto: tavolo.apertoAlle || null } }
        setPrecontoStampati(next)
        try { localStorage.setItem('dc_preconto_' + NEGOZIO_ID, JSON.stringify(next)) } catch (e) {}
      } else {
        errore('✗ Cassa non risponde')
      }
    } catch (e) {
      errore('✗ Errore: ' + e.message)
    } finally {
      setPrecontoRtInCorso(false)
    }
  }

  async function stampaPreconto() {
    await stampaComanda(tavoloAttivo, righeComanda, 'preconto', reparti, NEGOZIO_ID)
  }

  async function chiudiTavolo() {
    const tavolo = tavoli.find(t => t.numero === tavoloAttivo)
    if (!tavolo) return
    const righeFinali = [...righeComanda]
    sessionStorage.setItem('tavolo_da_chiudere', JSON.stringify({
      numero: tavoloAttivo,
      righe: righeFinali,
      coperti: righeComanda.find(r => r.id === 'coperto')?.quantita ?? tavolo.coperti ?? 0,
      apertoAlle: tavolo.apertoAlle || null,
      ultimoOrdine: tavolo.ultimoOrdine || null,
    }))
    router.push('/cassa')
  }



  async function annullaComanda() {
    if (!tavoloAttivo) return
    // Rilegge il tavolo dal DB: se alla romana e' gia' stata pagata una quota (scontrino emesso) lo segnala.
    let info = null
    try {
      const { getTavoliDb } = await import('@/lib/supabase-db')
      const lista = await getTavoliDb(NEGOZIO_ID)
      const t = (lista || []).find(x => x.numero === tavoloAttivo)
      const pagato = t?.divisione?.importoPagato || 0
      if (pagato > 0) {
        const totale = (t.righe || []).reduce((a, r) => a + (r.totaleRiga || 0), 0)
        info = {
          pagato, totale, residuo: Math.max(0, totale - pagato),
          persone: t.divisione.persone, quotePagate: t.divisione.quotePagate,
          righe: t.righe || [], coperti: t.coperti || 0, apertoAlle: t.apertoAlle || null,
        }
      }
    } catch (e) { console.error('Lettura tavolo prima di annullare fallita:', e) }
    setInfoAnnulla(info)
    setModalAnnulla(true)
  }

  async function confermaAnnullaComanda() {
    setModalAnnulla(false)
    const info = infoAnnulla
    setInfoAnnulla(null)
    if (info) {
      // Quote gia' incassate: lascia una riga nello storico tavoli (totale = incassato, residuo annullato in negativo).
      const { salvaStoricoTavolo } = await import('@/lib/supabase-db')
      const ok = await salvaStoricoTavolo(NEGOZIO_ID, {
        numero: tavoloAttivo,
        righe: [...info.righe, { id: 'residuo-annullato', nome: '✕ Residuo annullato', quantita: 1, importo: -info.residuo, totaleRiga: -info.residuo }],
        coperti: info.coperti,
        apertoAlle: info.apertoAlle,
      })
      if (!ok) {
        window.alert('Non sono riuscito a salvare la riga nello storico tavoli. Il tavolo NON è stato annullato: riprova.')
        return
      }
    }
    await chiudiTavoloDb(NEGOZIO_ID, tavoloAttivo)
    setRigheComanda([])
    setInputCents(0)
    setTavoloAttivo(null)
    await carica()
    setVista('griglia')
  }




  const repAttivo = reparti.find(r => r.id === repartoAttivo)
  const tavoloCorrente = tavoli.find(t => t.numero === tavoloAttivo)
  const copertiAttuali = righeComanda.find(r => r.id === 'coperto')?.quantita ?? tavoloCorrente?.coperti ?? 0

  // ── VISTA COMANDA ────────────────────────────────────────────────────────
  if (riapriAttesa) return <div style={{ minHeight: '100vh', background: '#05070d' }} />
  
  if (vista === 'comanda') {
    return (
      <div style={{ display:'flex', height:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Sans', sans-serif" }}>

        {/* SINISTRA — tastiera */}
        <div style={{ width:240, background:'var(--dc-surface)', borderRight:'1px solid var(--dc-surface2)', display:'flex', flexDirection:'column', padding:16, gap:8, flexShrink:0 }}>
        <button onClick={() => { setVista('griglia'); setTavoloAttivo(null); setRigheComanda([]); setInputCents(0) }} style={{ background:'transparent', border:'1px solid var(--dc-border)', borderRadius:10, color:'var(--dc-verde)', padding:'8px', cursor:'pointer', fontSize:'1.2rem', marginBottom:8 }}>
            ← Tavoli
          </button>
          <div style={{ textAlign:'center', padding:'12px', background:'var(--dc-surface2)', borderRadius:12, marginBottom:8 }}>
            <div style={{ fontSize:'0.9rem', color:'var(--dc-giallo)', letterSpacing:2 }}>TAVOLO</div>
            <div style={{ fontSize:'2rem', fontWeight:700, color:'var(--dc-forte)' }}>{tavoloAttivo}</div>
            {impostazioni.copertoAbilitato && copertiAttuali > 0 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:8 }}>
                              <span style={{ fontSize:'1.1rem', fontWeight:600, color:'var(--dc-forte)' }}>👤 {copertiAttuali} coperti</span>
              </div>
            )}
          </div>

          <div style={{ background:'var(--dc-surface2)', borderRadius:12, padding:'12px 16px', textAlign:'center', marginBottom:4 }}>
            <div style={{ fontSize:'0.85rem', color:'var(--dc-giallo)', letterSpacing:2 }}>IMPORTO</div>
            <div style={{ fontSize:'1.8rem', fontWeight:700, color:'var(--dc-verde)', fontFamily:"'DM Mono',monospace" }}>
              € {fmt(inputCents)}
            </div>
          </div>


          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {[7,8,9,4,5,6,1,2,3].map(n => (
              <button key={n} onClick={() => pressDigit(n)} style={{ padding:'14px', background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', borderRadius:10, color:'var(--dc-text)', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>{n}</button>
            ))}
            <button onClick={pressClear} style={{ padding:'14px', background:'var(--dc-surface2)', border:'1px solid rgba(var(--dc-rosso-rgb), 0.27)', borderRadius:10, color:'var(--dc-rosso)', fontSize:'0.8rem', cursor:'pointer' }}>C</button>
            <button onClick={() => pressDigit(0)} style={{ padding:'14px', background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', borderRadius:10, color:'var(--dc-text)', fontSize:'1.1rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>0</button>
            <button onClick={() => setInputCents(prev => parseInt(String(prev) + '00'))} style={{ padding:'14px', background:'var(--dc-surface2)', border:'1px solid #252830', borderRadius:10, color:'var(--dc-text)', fontSize:'0.9rem', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>00</button>
          </div>








                   <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                   {totale > 0 && (
              <>
                <button onClick={stampaPreconto} style={{ padding:'12px', background:'var(--dc-ambra)', border:'none', borderRadius:12, color:'var(--dc-bg)', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                  🧾 Preconto su comanda
                </button>
                <button
                  onClick={() => {
                    const tv = tavoli.find(t => t.numero === tavoloAttivo)
const haCoperto = righeComanda.some(r => r.id === 'coperto' && r.quantita > 0) || tv?.righe?.some(r => r.id === 'coperto' && r.quantita > 0)
setSelezione(haCoperto ? { coperto: 1 } : {})
const rCop = righeComanda.find(r => r.id === 'coperto') || tv?.righe?.find(r => r.id === 'coperto')
setRomanaPersone(Math.max(2, rCop?.quantita || tv?.coperti || 2))
setShowConto(true)
                  }}
                  style={{ padding:'12px', background:'var(--dc-rosso)', border:'none', borderRadius:12, color:'white', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                  💳 Chiudi Conto
                </button>
              </>
            )}

            <button onClick={inviaComanda} disabled={righeComanda.length === 0 || inviando} style={{ padding:'12px', background: righeComanda.length === 0 ? 'var(--dc-surface2)' : 'var(--dc-verde)', border:'none', borderRadius:12, color: righeComanda.length === 0 ? 'var(--dc-muted)' : 'var(--dc-bg)', fontWeight:700, cursor: righeComanda.length === 0 ? 'not-allowed' : 'pointer', fontSize:'0.85rem' }}>
              ✓ Invia comanda
            </button>

            <button onClick={annullaComanda} style={{ padding:'12px', background:'transparent', border:'1px solid var(--dc-rosso)', borderRadius:12, color:'var(--dc-rosso)', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
              ✕ Annulla comanda
            </button>
          </div>
        </div>



        {/* CENTRO — scontrino + prodotti */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          <div style={{ flex:'0 0 50%', borderBottom:'1px solid var(--dc-surface2)', overflow:'auto', padding:16 }}>
            <div style={{ fontSize:'0.72rem', color:'var(--dc-forte)', letterSpacing:2, marginBottom:12 }}>COMANDA TAVOLO {tavoloAttivo}</div>
            {righeComanda.length === 0 ? (
              <div style={{ textAlign:'center', color:'var(--dc-forte)', padding:40 }}>
                <div style={{ fontSize:'2rem' }}>🍽️</div>
                <div>Nessun prodotto</div>
              </div>
            ) : (
              <>




                {righeComanda.map(r => (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(var(--dc-surface2-rgb), 0.25)' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:r.colore+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>{ICONE[r.icona]||'📦'}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'0.85rem' }}>{r.nome}{r.quantita > 1 ? <span style={{ color:'var(--dc-forte)', marginLeft:6 }}>×{r.quantita}</span> : ''}</div>
                      <div style={{ fontSize:'0.7rem', color:'var(--dc-forte)' }}>€ {fmt(r.importo)} cad.</div>
                    </div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'0.85rem', fontWeight:600 }}>€ {fmt(r.totaleRiga)}</div>
                    {r.nota && (
                      <div style={{fontSize:'0.85rem', color: r.nota.startsWith('+') ? 'var(--dc-giallo)' : 'var(--dc-rosso-vivo)'}}>
                        📝 {r.nota}{r.nota.startsWith('+') && r.importoBase ? ` +€${((r.importo - r.importoBase)/100).toFixed(2).replace('.',',')}` : ''}
                      </div>
                    )}
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <button onClick={() => aggiornaQuantita(r.id, -1)}
                        style={{ width:24, height:24, borderRadius:6, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', cursor:'pointer', fontSize:'0.9rem' }}>−</button>
                      <button onClick={() => aggiornaQuantita(r.id, 1)}
                        style={{ width:24, height:24, borderRadius:6, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', cursor:'pointer', fontSize:'0.9rem' }}>+</button>
                      <button disabled={r.id === 'coperto'} onClick={() => { setNotaModal(r.id); setNotaTesto(r.nota?.replace(/^[+-]/,'') || ''); setNotaTipo(r.nota?.startsWith('+') ? 'aggiunta' : 'rimozione'); setAggiunte([]) }}
                        style={{ background:'transparent', border:'none', cursor:'pointer', color: r.nota ? 'var(--dc-ambra)' : 'var(--dc-muted)', fontSize:'0.9rem', padding:'2px', marginLeft:28, visibility: r.id === 'coperto' ? 'hidden' : 'visible' }}>✏️</button>
                      <button disabled={r.id === 'coperto'} onClick={() => eliminaRiga(r.id)}
                        style={{ background:'transparent', border:'none', color:'var(--dc-rosso)', cursor:'pointer', fontSize:'1rem', visibility: r.id === 'coperto' ? 'hidden' : 'visible' }}>✕</button>
                    </div>


                  </div>
                ))}




                <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', fontWeight:700, fontSize:'0.9rem' }}>
                  <span style={{ color:'var(--dc-forte)' }}>TOTALE</span>
                  <span style={{ color:'var(--dc-verde)', fontFamily:"'DM Mono',monospace" }}>€ {fmt(totale)}</span>
                </div>
                 {romanaPagato > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--dc-ambra)' }}>
                    <span>Pagato alla romana ({romanaQuotePagate}/{romanaPersoneTot})</span>
                    <span>residuo € {fmt(romanaResiduo)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ flex:'0 0 50%', overflow:'auto', padding:16 }}>
            {repAttivo && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:8 }}>



                   {repAttivo.sottoreparti?.filter(s => s.abilitato).map(sr => {
                  const qtaInComanda = righeComanda
                    .filter(r => r.nome === sr.nome)
                    .reduce((s, r) => s + r.quantita, 0)
                  return (
                    <button key={sr.id}
                      onClick={() => aggiungiProdotto(repAttivo, sr)}
                      style={{ padding:'12px 8px', background:'var(--dc-surface)', border:'1px solid ' + repAttivo.colore + '44', borderRadius:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, position:'relative', ...(sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine) ? { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundOrigin: 'border-box', minHeight: 110, justifyContent: 'space-between', textShadow: 'none' } : {}) }}>
                      {qtaInComanda > 0 && (
                        <div style={{
                          position:'absolute', top:-8, right:-8,
                          background: repAttivo.colore,
                          color:'var(--dc-bg)',
                          borderRadius:'50%',
                          width:22, height:22,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:'0.72rem', fontWeight:700,
                          fontFamily:"'DM Mono',monospace",
                          boxShadow:`0 0 8px ${repAttivo.colore}88`,
                          zIndex:1,
                        }}>
                          {qtaInComanda}
                        </div>
                      )}
                      {(sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) && <div style={{ width:'100%', aspectRatio:'1 / 1', flexShrink:0, borderRadius:8, marginBottom:4, backgroundImage:'url("' + sr.immagine + '")', backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat' }} />}
<div style={{ fontSize:'0.78rem', color:'var(--dc-text)', fontWeight:500, ...((sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) ? { fontSize:'0.95rem', fontWeight:700 } : {}) }}>{sr.nome}</div>
                      <div style={{ fontSize:'0.85rem', fontWeight:700, color:repAttivo.colore, fontFamily:"'DM Mono',monospace", ...((sr.immagine && /^https:\/\/[^"'()\s]+$/.test(sr.immagine)) ? { fontSize:'1.05rem', fontWeight:700 } : {}) }}>€ {fmt(sr.prezzoFisso)}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>




        </div>






        {/* DESTRA — reparti */}
        <div style={{ width:180, background:'var(--dc-surface)', borderLeft:'1px solid var(--dc-surface2)', overflow:'auto', padding:12, flexShrink:0 }}>
          <div style={{ fontSize:'0.9rem', color:'var(--dc-verde)', letterSpacing:2, marginBottom:12 }}>REPARTI</div>
          {reparti.map(r => {
            const qtaReparto = righeComanda
              .filter(riga => riga.repartoId === r.id)
              .reduce((s, riga) => s + riga.quantita, 0)
            return (
              <button key={r.id}
                onClick={() => { setRepartoAttivo(r.id); if (inputCents > 0) aggiungiReparto(r) }}
                style={{
                  width:'100%', textAlign:'left', padding:'10px 12px', marginBottom:6,
                  background: repartoAttivo === r.id ? r.colore + '22' : 'transparent',
                  border: '1px solid ' + (repartoAttivo === r.id ? r.colore : 'transparent'),
                  borderRadius:10, cursor:'pointer', color:'var(--dc-text)', fontSize:'0.82rem',
                  display:'flex', alignItems:'center', gap:8,
                }}>
                <span>{ICONE[r.icona]||'📦'}</span>
                <span>{r.nome}</span>
                {qtaReparto > 0 && (
                  <span style={{
                    marginLeft:'auto',
                    background: r.colore,
                    color:'var(--dc-bg)',
                    borderRadius:'50%',
                    width:20, height:20,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.68rem', fontWeight:700,
                    fontFamily:"'DM Mono',monospace",
                    flexShrink:0,
                  }}>
                    {qtaReparto}
                  </span>
                )}
              </button>
            )
          })}
        </div>
{/* MODAL SUCCESSO */}
{invioOk && (
          <div style={{
            position:'fixed', inset:0, zIndex:9999,
            background:'rgba(var(--dc-bg-rgb), 0.85)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <div style={{
              background:'var(--dc-surface)', border:'2px solid var(--dc-verde)',
              borderRadius:24, padding:'40px 56px',
              display:'flex', flexDirection:'column', alignItems:'center', gap:16,
              boxShadow:'0 0 64px rgba(var(--dc-verde-rgb), 0.3)',
              animation:'popIn 0.3s ease',
            }}>
              <div style={{
                width:64, height:64, borderRadius:'50%',
                background:'rgba(var(--dc-verde-rgb), 0.15)', border:'2px solid var(--dc-verde)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--dc-verde)" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--dc-verde)' }}>Comanda inviata!</div>
            </div>
            <style>{`@keyframes popIn { from { transform:scale(0.7); opacity:0 } to { transform:scale(1); opacity:1 } }`}</style>
          </div>
        )}



{showConto && (
  <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:700, padding:20 }}>
    <div style={{ background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:20, padding:24, width:'100%', maxWidth:640, maxHeight:'90vh', display:'flex', flexDirection:'column', gap:14, overflowY:'auto' }}>
      <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--dc-text)' }}>
        💳 Conto tavolo {tavoloAttivo} — € {fmt(divisioneCorrente ? romanaResiduo : totale)}
      </div>

      {!comandaSincronizzata && (
        <div style={{ fontSize:'0.8rem', color:'var(--dc-ambra)', background:'rgba(var(--dc-ambra-rgb), 0.1)', borderRadius:8, padding:'8px 10px' }}>
          Ci sono modifiche non inviate: premi "Invia comanda" prima di pagare per prodotti o alla romana.
        </div>
      )}

      {!divisioneCorrente && (
        <button onClick={() => { setShowConto(false); chiudiTavolo() }}
          style={{ padding:14, borderRadius:12, background:'var(--dc-rosso)', border:'none', color:'white', fontWeight:700, cursor:'pointer', fontSize:'0.95rem' }}>
          Paga tutto € {fmt(totale)}
        </button>
      )}

      {/* ALLA ROMANA */}
      <div style={{ fontSize:'0.8rem', color:'var(--dc-menta)', letterSpacing:1 }}>ALLA ROMANA</div>
      <div style={{ background:'var(--dc-surface2)', borderRadius:12, padding:14, display:'flex', flexDirection:'column', gap:12,
        opacity: comandaSincronizzata ? 1 : 0.4, pointerEvents: comandaSincronizzata ? 'auto' : 'none' }}>
        {divisioneCorrente ? (
          <div style={{ fontSize:'0.82rem', color:'var(--dc-ambra)' }}>
            Pagato € {fmt(romanaPagato)} · Residuo € {fmt(romanaResiduo)}
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:'0.88rem' }}>Persone a tavola</span>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => setRomanaPersone(p => Math.max(2, p - 1))} style={{ width:32, height:32, borderRadius:8, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', fontSize:'1.1rem', cursor:'pointer' }}>−</button>
              <span style={{ minWidth:24, textAlign:'center', fontFamily:"'DM Mono',monospace", fontSize:'1.1rem' }}>{romanaPersone}</span>
              <button onClick={() => setRomanaPersone(p => Math.min(50, p + 1))} style={{ width:32, height:32, borderRadius:8, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', fontSize:'1.1rem', cursor:'pointer' }}>+</button>
            </div>
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:8 }}>
          {Array.from({ length: Math.max(romanaPersoneTot, romanaQuotePagate) }, (_, i) => {
            const pagato = i < romanaQuotePagate
            return (
              <button key={i} disabled={pagato} onClick={pagaAllaRomana}
                style={{ padding:'14px 8px', borderRadius:12, border:'1px solid ' + (pagato ? 'var(--dc-border)' : 'var(--dc-verde)'),
                  background: pagato ? 'var(--dc-surface)' : 'rgba(var(--dc-verde-rgb), 0.12)', color: pagato ? 'var(--dc-muted)' : 'var(--dc-text)',
                  cursor: pagato ? 'default' : 'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:'0.72rem', letterSpacing:1 }}>PERSONA {i + 1}</span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700 }}>
                  {pagato ? '✓ pagato' : `€ ${fmt(romanaImporto)}`}
                </span>
              </button>
            )
          })}
          {romanaQuotePagate >= romanaPersoneTot && romanaResiduo > 0 && (
            <button onClick={pagaAllaRomana}
              style={{ padding:'14px 8px', borderRadius:12, border:'1px solid var(--dc-ambra)', background:'rgba(var(--dc-ambra-rgb), 0.12)', color:'var(--dc-text)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:'0.72rem', letterSpacing:1 }}>RESIDUO</span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700 }}>€ {fmt(romanaResiduo)}</span>
            </button>
          )}
        </div>
      </div>

      {/* PER PRODOTTI (nascosto se la divisione alla romana è in corso) */}
      {!divisioneCorrente && (
        <>
          <div style={{ fontSize:'0.8rem', color:'var(--dc-menta)', letterSpacing:1 }}>OPPURE SCEGLI I PRODOTTI DA PAGARE</div>
          <div style={{ overflowY:'auto', flex:1, opacity: comandaSincronizzata ? 1 : 0.4, pointerEvents: comandaSincronizzata ? 'auto' : 'none' }}>
            {righeComanda.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(var(--dc-surface2-rgb), 0.25)' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.88rem' }}>{r.nome} <span style={{ color:'#ffffff99' }}>× {r.quantita}</span></div>
                  {r.nota && <div style={{ fontSize:'0.75rem', color: r.nota.startsWith('+') ? 'var(--dc-giallo)' : 'var(--dc-rosso-vivo)' }}>📝 {r.nota}</div>}
                  <div style={{ fontSize:'0.72rem', color:'#ffffff99' }}>€ {fmt(r.importo)} cad.</div>
                </div>

                {r.id === 'coperto' ? <span style={{ width:32 }} /> : (
                  <button onClick={() => cambiaSelezione(r.id, -1, r.quantita)} style={{ width:32, height:32, borderRadius:8, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', fontSize:'1.1rem', cursor:'pointer' }}>−</button>
                )}
                <span style={{ minWidth:20, textAlign:'center', fontFamily:"'DM Mono',monospace", color: (selezione[r.id] || 0) > 0 ? 'var(--dc-verde)' : 'var(--dc-text)' }}>{selezione[r.id] || 0}</span>
                {r.id === 'coperto' ? <span style={{ width:32 }} /> : (
                  <button onClick={() => cambiaSelezione(r.id, 1, r.quantita)} style={{ width:32, height:32, borderRadius:8, background:'var(--dc-border)', border:'none', color:'var(--dc-text)', fontSize:'1.1rem', cursor:'pointer' }}>+</button>
                )}
              </div>
              
            ))}
          </div>
        </>
      )}

      <div style={{ display:'flex', gap:10 }}>
        <button onClick={() => setShowConto(false)}
          style={{ flex:1, padding:12, borderRadius:10, background:'transparent', border:'1px solid var(--dc-border)', color:'var(--dc-text)', cursor:'pointer' }}>
          Indietro
        </button>
        {!divisioneCorrente && (
          <button onClick={pagaSelezionati} disabled={!comandaSincronizzata || totaleSelezionato === 0}
            style={{ flex:1.4, padding:12, borderRadius:10, border:'none', fontWeight:700,
              background: (!comandaSincronizzata || totaleSelezionato === 0) ? 'var(--dc-surface2)' : 'var(--dc-verde)',
              color: (!comandaSincronizzata || totaleSelezionato === 0) ? 'var(--dc-muted)' : 'var(--dc-bg)',
              cursor: (!comandaSincronizzata || totaleSelezionato === 0) ? 'not-allowed' : 'pointer' }}>
            Paga selezionati € {fmt(totaleSelezionato)}
          </button>
        )}
      </div>
    </div>
  </div>
)}




{modalAnnulla && (
          <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:700 }}>
            <div style={{ background:'var(--dc-surface)', border:'1px solid rgba(var(--dc-rosso-rgb), 0.27)', borderRadius:20, padding:28, width:340, display:'flex', flexDirection:'column', gap:18, alignItems:'center' }}>
              <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--dc-rosso)' }}>🗑️ Annulla comanda</div>
              <div style={{ fontSize:'0.85rem', color:'var(--dc-forte)', textAlign:'center' }}>
                {infoAnnulla ? (
                  <>
                    Sul tavolo {tavoloAttivo} sono già stati incassati <strong>€ {fmt(infoAnnulla.pagato)}</strong> ({infoAnnulla.quotePagate} {infoAnnulla.quotePagate === 1 ? 'quota' : 'quote'} su {infoAnnulla.persone}) con scontrino.<br/>
                    Annullando perdi il residuo di <strong>€ {fmt(infoAnnulla.residuo)}</strong> e il tavolo verrà liberato.<br/>
                    Nello storico tavoli resterà la riga con quanto incassato.
                  </>
                ) : (
                  <>Annullare la comanda del tavolo {tavoloAttivo}?<br/>Il tavolo verrà liberato.</>
                )}
              </div>
              <div style={{ display:'flex', gap:12, width:'100%' }}>
                <button onClick={() => { setModalAnnulla(false); setInfoAnnulla(null) }}
                  style={{ flex:1, padding:12, borderRadius:12, background:'transparent', border:'1px solid var(--dc-border)', color:'var(--dc-text)', cursor:'pointer' }}>
                  No, torna indietro
                </button>
                <button onClick={confermaAnnullaComanda}
                  style={{ flex:1, padding:12, borderRadius:12, background:'var(--dc-rosso)', border:'none', color:'white', fontWeight:700, cursor:'pointer' }}>
                  Sì, annulla
                </button>
              </div>
            </div>
          </div>
        )}





        {/* MODAL NOTA - inline nella vista comanda */}
        {notaModal !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:20 }}>
        <div style={{ background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:20, padding:24, width:'100%', maxWidth:360, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--dc-text)' }}>✏️ Variante per: {righeComanda.find(r => r.id === notaModal)?.nome}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { if (notaTipo !== 'rimozione') setAggiunte([]); setNotaTipo('rimozione') }}
              style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='rimozione' ? 'var(--dc-rosso)' : 'var(--dc-border)'}`,
                background: notaTipo==='rimozione' ? 'rgba(var(--dc-rosso-rgb), 0.15)' : 'transparent',
                color: notaTipo==='rimozione' ? 'var(--dc-rosso)' : 'var(--dc-muted)', cursor:'pointer', fontWeight:700 }}>
              − Rimozione
            </button>
                <button onClick={() => { if (notaTipo !== 'aggiunta') setAggiunte([]); setNotaTipo('aggiunta') }}
                  style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${notaTipo==='aggiunta' ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
                    background: notaTipo==='aggiunta' ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'transparent',
                    color: notaTipo==='aggiunta' ? 'var(--dc-verde)' : 'var(--dc-muted)', cursor:'pointer', fontWeight:700 }}>
                  + Aggiunta
                </button>
              </div>
              {notaTipo === 'rimozione' && impostazioni.aggiunteRapide?.length > 0 && (() => {
                const nomiRim = [...new Set(impostazioni.aggiunteRapide.map(a => a.nome))]
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ fontSize:'0.8rem', color:'var(--dc-rosso)', letterSpacing:1 }}>RIMOZIONI RAPIDE</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {nomiRim.map(item => {
                        const selected = aggiunte.some(a => a.nome === item)
                        return (
                          <button key={item}
                            onClick={() => setAggiunte(prev => prev.some(a => a.nome === item) ? prev.filter(a => a.nome !== item) : [...prev, { nome: item, costo: 0 }])}
                            style={{
                              padding:'6px 12px', borderRadius:8, fontSize:'0.9rem', cursor:'pointer',
                              border: `1px solid ${selected ? 'var(--dc-rosso)' : 'var(--dc-border)'}`,
                              background: selected ? 'rgba(var(--dc-rosso-rgb), 0.15)' : 'var(--dc-surface2)',
                              color: selected ? 'var(--dc-rosso)' : 'var(--dc-text)',
                              fontWeight: selected ? 700 : 400,
                            }}>
                            {item}
                          </button>
                        )
                      })}
                    </div>
                    {aggiunte.length > 0 && (
                      <div style={{ fontSize:'0.75rem', color:'var(--dc-rosso)', background:'rgba(var(--dc-rosso-rgb), 0.1)', borderRadius:8, padding:'6px 10px' }}>
                        Senza: {aggiunte.map(a => a.nome).join(', ')}
                      </div>
                    )}
                  </div>
                )
              })()}
              {notaTipo === 'aggiunta' && impostazioni.aggiunteRapide?.length > 0 && (() => {
                const gruppiMap = {}
                for (const a of impostazioni.aggiunteRapide) {
                  if (!gruppiMap[a.costo]) gruppiMap[a.costo] = new Set()
                  gruppiMap[a.costo].add(a.nome)
                }
                const tiers = Object.entries(gruppiMap).map(([costo, s]) => ({ costo: parseInt(costo), items: [...s] })).sort((a,b) => a.costo - b.costo)
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ fontSize:'0.8rem', color:'var(--dc-menta)', letterSpacing:1 }}>AGGIUNTE RAPIDE</div>
                    {tiers.map(({ costo, items }) => (
                      <div key={costo}>
                        <div style={{ fontSize:'0.82rem', color:'var(--dc-ambra)', marginBottom:4 }}>€ {(costo/100).toFixed(2).replace('.',',')}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                          {items.map(item => {
                            const selected = aggiunte.some(a => a.nome === item && a.costo === costo)
                            return (
                              <button key={`${costo}-${item}`}
                                onClick={() => setAggiunte(prev => {
                                  const esiste = prev.find(a => a.nome === item)
                                  if (esiste) return prev.filter(a => a.nome !== item)
                                  return [...prev, { nome: item, costo }]
                                })}
                                style={{
                                  padding:'6px 12px', borderRadius:8, fontSize:'0.9rem', cursor:'pointer',
                                  border: `1px solid ${selected ? 'var(--dc-verde)' : 'var(--dc-border)'}`,
                                  background: selected ? 'rgba(var(--dc-verde-rgb), 0.15)' : 'var(--dc-surface2)',
                                  color: selected ? 'var(--dc-verde)' : 'var(--dc-text)',
                                  fontWeight: selected ? 700 : 400,
                                }}>
                                {item}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {aggiunte.length > 0 && (
                      <div style={{ fontSize:'0.75rem', color:'var(--dc-verde)', background:'rgba(var(--dc-verde-rgb), 0.1)', borderRadius:8, padding:'6px 10px' }}>
                        💰 Totale: +€{(aggiunte.reduce((s,a) => s + a.costo, 0)/100).toFixed(2).replace('.',',')} — {aggiunte.map(a => a.nome).join(', ')}
                      </div>
                    )}
                  </div>
                )
              })()}
              <textarea autoFocus value={notaTesto} onChange={e => setNotaTesto(e.target.value.toUpperCase())}
                placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella...' : 'es. con funghi...'}
                rows={3}
                style={{ background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', borderRadius:10, padding:12, color:'var(--dc-text)', fontSize:'0.9rem', resize:'none', fontFamily:"'DM Sans',sans-serif" }}
              />
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([]) }}
                  style={{ flex:1, padding:12, borderRadius:10, background:'transparent', border:'1px solid var(--dc-border)', color:'var(--dc-text)', cursor:'pointer' }}>
                  Annulla
                </button>
                <button onClick={() => {
                    if (notaTipo === 'rimozione' && aggiunte.length > 0) {
                  const nomiRim = aggiunte.map(a => `SENZA ${a.nome}`).join(', ')
                  const testoRim = notaTesto ? `${nomiRim} — ${notaTesto}` : nomiRim
                  salvaNota(notaModal, testoRim, notaTipo, 0)
                } else if (notaTipo === 'aggiunta' && aggiunte.length > 0) {
                      const nomi = aggiunte.map(a => a.nome).join(', ')
                      const testoFinale = notaTesto ? `${nomi} — ${notaTesto}` : nomi
                      salvaNota(notaModal, testoFinale, notaTipo, aggiunte.reduce((s,a) => s + a.costo, 0))
                    } else {
                      salvaNota(notaModal, notaTesto, notaTipo, impostazioni.costoAggiunta ?? 50)
                    }
                    setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([])
                  }}
                  style={{ flex:1, padding:12, borderRadius:10, background:'var(--dc-verde)', border:'none', color:'var(--dc-bg)', fontWeight:700, cursor:'pointer' }}>
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── MODAL COPERTI ────────────────────────────────────────────────────────
  if (modalCoperti !== null) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(var(--dc-bg-rgb), 0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
        <div style={{ background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:20, padding:32, width:320, display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>
          <div style={{fontSize:'1rem', fontWeight:700}}>🍽️ Tavolo {modalCoperti}</div>
          <div style={{fontSize:'0.82rem', color:'var(--dc-forte)'}}>Quante persone al tavolo?</div>
          <div style={{display:'flex', alignItems:'center', gap:20}}>
            <button onClick={() => setNumCoperti(n => Math.max(1, n-1))}
              style={{width:44, height:44, borderRadius:12, background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', color:'var(--dc-text)', fontSize:'1.5rem', cursor:'pointer'}}>−</button>
            <span style={{fontSize:'3rem', fontWeight:700, color:'var(--dc-verde)', fontFamily:"'DM Mono',monospace", minWidth:60, textAlign:'center'}}>{numCoperti}</span>
            <button onClick={() => setNumCoperti(n => n+1)}
              style={{width:44, height:44, borderRadius:12, background:'var(--dc-surface2)', border:'1px solid var(--dc-border)', color:'var(--dc-text)', fontSize:'1.5rem', cursor:'pointer'}}>+</button>
          </div>
          <div style={{fontSize:'0.78rem', color:'var(--dc-forte)'}}>
            Coperto: € {((impostazioni.copertoImporto * numCoperti) / 100).toFixed(2)} totale
          </div>
          <div style={{display:'flex', gap:12, width:'100%'}}>
            <button onClick={() => setModalCoperti(null)}
              style={{flex:1, padding:12, borderRadius:12, background:'transparent', border:'1px solid var(--dc-border)', color:'var(--dc-text)', cursor:'pointer'}}>Annulla</button>
            <button onClick={() => confermaCoperti(modalCoperti, numCoperti)}
              style={{flex:1, padding:12, borderRadius:12, background:'var(--dc-verde)', border:'none', color:'var(--dc-bg)', fontWeight:700, cursor:'pointer'}}>Apri tavolo</button>
          </div>
        </div>
      </div>
    )
  }





  // ── VISTA GRIGLIA TAVOLI ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'var(--dc-bg)', color:'var(--dc-text)', fontFamily:"'DM Sans', sans-serif" }}>
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'var(--dc-surface)', borderBottom:'1px solid var(--dc-surface2)' }}>
        <button onClick={() => router.replace('/cassa')} style={{ background:'transparent', border:'1px solid rgba(var(--dc-forte-rgb), 0.267)', borderRadius:10, color:'var(--dc-menta)', padding:'8px 16px', cursor:'pointer', fontSize:'0.92rem' }}>
          ← Cassa
        </button>
        <button onClick={() => router.replace('/storico-tavoli')} style={{ background:'transparent', border:'1px solid rgba(var(--dc-forte-rgb), 0.267)', borderRadius:10, color:'var(--dc-giallo)', padding:'8px 16px', cursor:'pointer', fontSize:'0.92rem' }}>
          📋 Storico
        </button>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>🍽️ Tavoli</div>
        <button onClick={carica} style={{ background:'transparent', border:'1px solid rgba(var(--dc-forte-rgb), 0.267)', borderRadius:10, color:'var(--dc-ambra)', padding:'8px 16px', cursor:'pointer', fontSize:'0.82rem' }}>
          ↻ Aggiorna
        </button>
      </header>

      <div style={{ padding:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:16 }}>
          {tavoli.map(t => {
            const occupato = t.stato === 'occupato'
            const tempo = t.ultimoOrdine ? tempoTrascorso(t.ultimoOrdine) : null
            const totTavolo = t.righe?.reduce((s, r) => s + r.totaleRiga, 0) || 0
            return (
              <button key={t.numero}
                onClick={() => apriTavolo(t)}
                style={{
                  padding:16, borderRadius:16, cursor:'pointer', textAlign:'left',
                  background: occupato ? 'rgba(var(--dc-rosso-rgb), 0.1)' : 'rgba(var(--dc-verde-rgb), 0.05)',
                  border: '2px solid ' + (occupato ? 'var(--dc-rosso)' : 'rgba(var(--dc-verde-rgb), 0.27)'),
                  display:'flex', flexDirection:'column', gap:8,
                  transition:'all 0.15s',
                }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'0.95rem', color:'var(--dc-menta)', letterSpacing:2 }}>TAVOLO</span>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: occupato ? 'var(--dc-rosso)' : 'var(--dc-verde)', boxShadow: '0 0 8px ' + (occupato ? 'var(--dc-rosso)' : 'var(--dc-verde)') }} />
                </div>
                <div style={{ fontSize:'2.5rem', fontWeight:700, color: occupato ? 'var(--dc-rosso)' : 'var(--dc-verde)', lineHeight:1 }}>{t.numero}</div>
                {occupato ? (
                  <>
                    <div style={{ fontSize:'0.98rem', fontWeight:600, color:'var(--dc-text)', fontFamily:"'DM Mono',monospace" }}>€ {fmt(Math.max(0, totTavolo - (t.divisione?.importoPagato || 0)))}</div>
                    {t.divisione && <div style={{ fontSize:'0.8rem', color:'var(--dc-ambra)' }}>alla romana {t.divisione.quotePagate}/{t.divisione.persone}</div>}
                    <div style={{ fontSize:'0.88rem', color:'var(--dc-menta)' }}>{(() => { const n = t.righe?.filter(r => r.id !== 'coperto').length || 0; return n === 1 ? '1 prodotto' : `${n} prodotti` })()}</div>
                    {tempo && <div style={{ fontSize:'0.8rem', color:'var(--dc-ambra)', whiteSpace:'nowrap' }}>Occupato ⏱ {tempo}</div>}
                    {impostazioni.copertoAbilitato && t.coperti > 0 && (
                      <div style={{ fontSize:'0.95rem', color:'var(--dc-menta)' }}>👤 {t.coperti} coperti</div>
                    )}
                    {/* PRECONTO_SOTTO_COPERTI */}
                    {cassa3i && (t.righe?.length || 0) > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:6, marginTop:4 }}>
                        <span role="button"
                          onClick={(e) => { e.stopPropagation(); stampaPrecontoDaGriglia(t) }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onMouseUp={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); stampaPrecontoDaGriglia(t) }}
                          style={{ padding:'6px 14px', border:'1px solid var(--dc-ambra)', borderRadius:8, color:'var(--dc-ambra)', fontWeight:700, fontSize:'0.85rem', cursor: precontoRtInCorso ? 'wait' : 'pointer', userSelect:'none' }}>
                          Preconto
                        </span>
                        {(() => {
                          const s = statoPrecontoGriglia(t)
                          return s ? <div style={{ fontSize:'0.74rem', color: s.ok ? 'var(--dc-verde)' : 'var(--dc-rosso)', whiteSpace: s.ok ? 'nowrap' : 'normal' }}>{s.testo}</div> : null
                        })()}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize:'1.3rem', color:'var(--dc-menta)' }}>Libero</div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}