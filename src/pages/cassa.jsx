import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { useNegozio } from '@/context/NegozioContext'
import PannelloRT from '@/components/PannelloRT'

import { salvaScontrinoDb, chiudiTavoloDb, salvaStoricoTavolo, getImpostazioniDb, aggiornaGiacenza, salvaAnnulloDb } from '@/lib/supabase-db'
import { getRepartiDb } from '@/lib/supabase-db'
import { useNegozioId } from '@/hooks/useNegozioId'
import { supabase } from '@/lib/supabase'
import { useCassa } from '@/hooks/useCassa'
import styles from '@/styles/Cassa.module.css'
import { incrementaScontrino, incrementaChiusura, getContatori, resetScontrini } from '@/lib/storage'


// Helper: chiama il registratore via service locale (produzione) o API (sviluppo)
async function callRT(marca, body) {
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  console.log('callRT:', marca, 'isLocalhost:', isLocalhost, 'porta:', body.porta)
  if (isLocalhost) {
    const endpoint = marca === 'rch' ? '/api/rch' : '/api/ditron'
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.json()
  } else {
    const res = await fetch('http://localhost:3002', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'rt', marca, ...body }) })
    return res.json()
  }
}


const ICONE = {
  // Bevande
  coffee:'☕', beer:'🍺', wine:'🍷', drink:'🥤', cocktail:'🍹',
  tea:'🍵', juice:'🧃', water:'💧', champagne:'🥂', whiskey:'🥃',
  // Cibo base
  pizza:'🍕', sandwich:'🥪', bread:'🥐', food:'🍽️', salad:'🥗',
  // Carne e pesce
  meat:'🥩', fish:'🐟', chicken:'🍗', bacon:'🥓', shrimp:'🦐',
  // Snack e fritti
  fries:'🍟', popcorn:'🍿', chips:'🥨', hotdog:'🌭', burger:'🍔',
  // Dolci
  cake:'🍰', ice_cream:'🍦', candy:'🍬', donut:'🍩', cookie:'🍪',
  chocolate:'🍫', gelato:'🧁', waffle:'🧇',
  // Frutta e verdura
  fruit:'🍎', lemon:'🍋', tomato:'🍅', pepper:'🌶️', mushroom:'🍄',
  corn:'🌽', avocado:'🥑', olive:'🫒', garlic:'🧄', onion:'🧅',
  // Formaggio e latticini
  cheese:'🧀', egg:'🥚', butter:'🧈',
  // Pasta e riso
  pasta:'🍝', rice:'🍚', soup:'🍜', taco:'🌮', burrito:'🌯',
  // Altro
  shopping:'🛍️', gift:'🎁', star:'⭐', tag:'🏷️', box:'📦',
  fire:'🔥', heart:'❤️', leaf:'🌿',
}
function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export default function CassaPage() {
  console.log('🔴 CASSA MONTATA - stack:', new Error().stack.split('\n')[2])
  const NEGOZIO_ID = useNegozioId()
  const { negozio } = useNegozio() || {}
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [reparti, setReparti] = useState([])
  const [benvenuto, setBenvenuto] = useState(false)
  const [rtConfig, setRtConfig] = useState(null)
  const tavoloCaricato = useRef(false)

  const [rtMappatura, setRtMappatura] = useState({})
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [showChiusura, setShowChiusura] = useState(false)
  const [showConfirmAnnulla, setShowConfirmAnnulla] = useState(false)
  const [showSuccesso, setShowSuccesso] = useState(null)
  const [showAvvisoMezzanotte, setShowAvvisoMezzanotte] = useState(false)
  const [scontrinoCorrente, setScontrinoCorrente] = useState(null)
  const [righeBackup, setRigheBackup] = useState([])
  const [barcodeVal, setBarcodeVal] = useState('')
  const [avvisoMagazzino, setAvvisoMagazzino] = useState([])
  const [giacenzaInsuff, setGiacenzaInsuff] = useState([])
  const [notaModal, setNotaModal] = useState(null)
  const [notaTesto, setNotaTesto] = useState('')
  const [notaTipo, setNotaTipo] = useState('rimozione') // rimozione | aggiunta
  const [showSconto, setShowSconto] = useState(false)
  const [tipoSconto, setTipoSconto] = useState('euro') // euro | percentuale
  const [valoreSconto, setValoreSconto] = useState('')
  const longPressTimer = useRef(null)
  const [impostazioni, setImpostazioni] = useState({ tavoliAbilitati: false, magazzinoAbilitato: false })
  const [contatori, setContatori] = useState({ scontrini: 0, chiusure: 0 })
  const [aggiunte, setAggiunte] = useState([]) // [{nome, costo}]

  const {
    inputCents, righe, ultimaChiusa, errore, totale, subtotalePerIva,
    pressDigit, pressDoubleZero, pressClear,
    aggiungiRiga, caricaRigheEsterne, annullaUltima, annullaTutto, chiudiScontrino,
    ripristinaRighe, eliminaRiga, applicaSconto, scontrinoAperto, resetScontrinoAperto, apriScontrino, salvaNota, aggiornaQuantita
  } = useCassa()





  function cercaProdottoBarcode(barcode) {
    for (const reparto of reparti) {
      const prodotto = reparto.sottoreparti?.find(p => p.barcode === barcode)
      if (prodotto) {
        aggiungiRiga(reparto, prodotto)
        return
      }
    }
    console.warn('Barcode non trovato:', barcode)
  }

  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    async function loadReparti() {
      const r = (await getRepartiDb(NEGOZIO_ID)).filter(r => r.abilitato)
      setReparti(r)
      if (r.length > 0) setRepartoAttivo(r[0].id)
    }
    loadReparti()
    getImpostazioniDb(NEGOZIO_ID).then(imp => setImpostazioni(imp))
    setContatori(getContatori())
    // Mostra benvenuto solo se arriva dal login
    if (sessionStorage.getItem('appena_loggato')) {
      sessionStorage.removeItem('appena_loggato')
      setBenvenuto(true)
      setTimeout(() => setBenvenuto(false), 2000)
    }
  }, [user, router])

  // Carica righe da tavolo quando la pagina si monta
  useEffect(() => {
    // Gestisci ritorno da asporto
    const asportoDaChiudere = sessionStorage.getItem('asporto_da_chiudere')
    if (asportoDaChiudere) {
      try {
        const { righe } = JSON.parse(asportoDaChiudere)
        setTimeout(() => {
          caricaRigheEsterne(righe)
          apriScontrino()
        }, 300)
      } catch(e) { console.error(e) }
    }

    const tavoloDaChiudere = sessionStorage.getItem('tavolo_da_chiudere')
    console.log('Check tavolo:', tavoloDaChiudere)
    if (tavoloDaChiudere) {
      try {
        const { righe } = JSON.parse(tavoloDaChiudere)
        console.log('Righe tavolo trovate:', righe?.length)
        setTimeout(() => caricaRigheEsterne(righe), 300)
      } catch(e) { console.error(e) }
    }
  }, [])

  // Carica config RT separatamente
  useEffect(() => {
    supabase.from('negozi').select('rt_config').eq('id', NEGOZIO_ID).single().then(({ data }) => {
      console.log('RT config caricata:', JSON.stringify(data?.rt_config))
      if (data?.rt_config?.config) setRtConfig(data.rt_config.config)
      if (data?.rt_config?.mappatura) setRtMappatura(data.rt_config.mappatura)
    })
  }, [])

  // ── Avviso mezzanotte ──────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const now = new Date()
      if (now.getHours() === 23 && now.getMinutes() === 50 && now.getSeconds() === 0) {
        setShowAvvisoMezzanotte(true)
        // suono beep
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)
          osc.start(ctx.currentTime)
          osc.stop(ctx.currentTime + 1.5)
        } catch {}
      }
    }
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (showChiusura || showConfirmAnnulla || showSuccesso || showAvvisoMezzanotte) return
      // Ignora se si sta digitando in un input/select
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
      if (e.key >= '0' && e.key <= '9') pressDigit(e.key)
      else if (e.key === 'Backspace') pressClear()
      else if (e.key === 'Escape') {
        if (righe.length > 0) setShowConfirmAnnulla(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showChiusura, showConfirmAnnulla, showSuccesso, showAvvisoMezzanotte, pressDigit, pressClear, righe])

  function handleRepartoClick(reparto) {
    if (inputCents > 0) { aggiungiRiga(reparto); return }
    setRepartoAttivo(prev => prev === reparto.id ? null : reparto.id)
  }

  function handleSottorepartoClick(reparto, sr) {
    aggiungiRiga(reparto, sr)
  }

  async function handleChiudi() {
    if (righe.length === 0) return

    // Controlla giacenze insufficienti leggendo dal DB
    if (impostazioni.magazzinoAbilitato) {
      const prodottiConGiacenza = righe.filter(r => r.sottoRepartoId)
      if (prodottiConGiacenza.length > 0) {
        const ids = [...new Set(prodottiConGiacenza.map(r => r.sottoRepartoId))]
        const { data: prodottiDb } = await supabase
          .from('prodotti')
          .select('id, giacenza, giacenza_minima')
          .in('id', ids)

        const giacenzeMap = {}
        for (const p of prodottiDb || []) giacenzeMap[p.id] = p

        // Aggrega quantità per prodotto
        const qtaPerProdotto = {}
        for (const r of righe) {
          if (r.sottoRepartoId) {
            qtaPerProdotto[r.sottoRepartoId] = (qtaPerProdotto[r.sottoRepartoId] || 0) + r.quantita
          }
        }

        const insufficienti = []
        for (const [id, qta] of Object.entries(qtaPerProdotto)) {
          const p = giacenzeMap[id]
          if (p && p.giacenza !== null && p.giacenza < qta) {
            const riga = righe.find(r => r.sottoRepartoId === id)
            insufficienti.push({ nome: riga?.nome || id, giacenza: p.giacenza, quantita: qta })
          }
        }

        if (insufficienti.length > 0) {
          setGiacenzaInsuff(insufficienti)
          return
        }
      }
    }

    setRigheBackup([...righe])
    const sc = chiudiScontrino()
    const c = incrementaScontrino()
    setContatori(getContatori())
    const scConNumeri = { ...sc, numeroScontrino: c.scontrini, numeroChiusure: c.chiusure }
    setScontrinoCorrente(scConNumeri)
    setShowChiusura(true)
  }

  function handleAnnullaChiusura() {
    ripristinaRighe(righeBackup)
    setRigheBackup([])
    setShowChiusura(false)
  }

  async function handleConfermAnnulla() {
    // Chiudi asporto pendente se presente
    const asportoDaChiudere = sessionStorage.getItem('asporto_da_chiudere')
    let righeAsporto = null
    let totaleAsporto = 0
    if (asportoDaChiudere) {
      try {
        const parsed = JSON.parse(asportoDaChiudere)
        righeAsporto = parsed.righe || []
        totaleAsporto = righeAsporto.reduce((s, r) => s + (r.totaleRiga || 0), 0)
        const { chiudiAsportoDb } = await import('@/lib/supabase-db')
        await chiudiAsportoDb(NEGOZIO_ID, parsed.id)
        sessionStorage.removeItem('asporto_da_chiudere')
      } catch(e) {}
    }

    // Salva annullo se scontrino è aperto (anche se vuoto)
    if (scontrinoAperto) {
      const righeEffettive = righe.length > 0 ? righe : (righeAsporto || [])
      const totaleEffettivo = righe.length > 0 ? totale : totaleAsporto
      salvaAnnulloDb(NEGOZIO_ID, {
        totale: totaleEffettivo,
        operatoreId: user?.id || null,
        operatoreNome: user?.name || null,
        righe: righeEffettive,
      })
    }
    annullaTutto()
    setShowConfirmAnnulla(false)
  }

  async function handleSuccesso(info) {
    // Chiudi tavolo su Supabase se scontrino viene da un tavolo
    const tavoloDaChiudere = sessionStorage.getItem('tavolo_da_chiudere')
    if (tavoloDaChiudere) {
      try {
        const { numero } = JSON.parse(tavoloDaChiudere)
        // Salva storico tavolo
        await salvaStoricoTavolo(NEGOZIO_ID, {
          numero,
          righe: JSON.parse(tavoloDaChiudere).righe || [],
          coperti: JSON.parse(tavoloDaChiudere).coperti || 0,
          apertoAlle: JSON.parse(tavoloDaChiudere).apertoAlle || null,
        })
        await chiudiTavoloDb(NEGOZIO_ID, numero)
        sessionStorage.removeItem('tavolo_da_chiudere')
      } catch(e) {}
    }

    // Chiudi asporto se viene da asporto
    const asportoDaChiudere = sessionStorage.getItem('asporto_da_chiudere')
    if (asportoDaChiudere) {
      try {
        const { id } = JSON.parse(asportoDaChiudere)
        const { chiudiAsportoDb } = await import('@/lib/supabase-db')
        await chiudiAsportoDb(NEGOZIO_ID, id)
        sessionStorage.removeItem('asporto_da_chiudere')
      } catch(e) {}
    }

    // Salva nello storico su Supabase
    salvaScontrinoDb(NEGOZIO_ID, {
      timestamp: new Date().toISOString(),
      righe: scontrinoCorrente?.righe || [],
      totale: info.totale,
      metodo: info.metodo === 'cortesia' ? 'contanti' : info.metodo,
      resto: info.resto || 0,
      contatto: info.contatto || null,
      numeroScontrino: scontrinoCorrente?.numeroScontrino || 1,
      operatoreId: user?.id || null,
      operatoreNome: user?.name || null,
    })
    setContatori(getContatori())
    setShowChiusura(false)
    setShowSuccesso(info)
    setRigheBackup([])
    resetScontrinoAperto()

    // Scala giacenze magazzino
    if (impostazioni.magazzinoAbilitato) {
      const avvisi = []
      for (const riga of scontrinoCorrente?.righe || []) {
        if (riga.giacenza !== null && riga.giacenza !== undefined) {
          const nuovaGiacenza = Math.max(0, riga.giacenza - riga.quantita)
          await aggiornaGiacenza(NEGOZIO_ID, riga.id, riga.nome, 'vendita', riga.quantita, nuovaGiacenza)
          if (riga.giacenzaMinima !== null && nuovaGiacenza <= riga.giacenzaMinima) {
            avvisi.push({ nome: riga.nome, giacenza: nuovaGiacenza, minima: riga.giacenzaMinima })
          }
        }
      }
      if (avvisi.length > 0) setAvvisoMagazzino(avvisi)
    }

    // Stampa su RT se configurato
    if (rtConfig?.attivo && rtConfig?.ip && scontrinoCorrente?.righe?.length > 0) {
      try {
        if (rtConfig.marca === '3i') {
          // 3i Solution — TCP/IP XON/XOFF
          let cmd = ''
          const mappatura = rtMappatura || {}
          for (const riga of scontrinoCorrente.righe) {
            // Salta righe sconto — le gestiamo separatamente
            if (riga.repartoId === null && riga.importo < 0) continue
            const reparto = mappatura[riga.repartoId]?.numeroRt || 1
            const importoCents = Math.round(riga.importo)
            const descr = (riga.nome || '').replace(/"/g, '').substring(0, 38)
            if (riga.quantita > 1) {
              cmd += `"${descr}"${riga.quantita}*${importoCents}H${reparto}R`
            } else {
              cmd += `"${descr}"${importoCents}H${reparto}R`
            }
          }
          // Applica sconti sul subtotale
          const righeSconto = scontrinoCorrente.righe.filter(r => r.repartoId === null && r.importo < 0)
          if (righeSconto.length > 0) {
            cmd += '='  // subtotale
            for (const sconto of righeSconto) {
              const scontoCents = Math.abs(Math.round(sconto.importo))
              if (sconto.nome.includes('%')) {
                // Sconto percentuale: formato 10.00*2M
                const perc = sconto.nome.match(/(\d+(?:\.\d+)?)%/)?.[1] || '0'
                cmd += `${perc}*2M`
              } else {
                // Sconto in euro: formato 150H4M
                cmd += `${scontoCents}H4M`
              }
            }
          }
          if (info.metodo === 'carta') {
            cmd += '3T'
          } else if (info.metodo === 'cortesia' || info.metodo === 'contanti') {
            // Contanti o cortesia — stesso trattamento
            const contantiCents = info.totale + (info.resto || 0)
            if (contantiCents > info.totale) {
              cmd += `${contantiCents}H1T`
            } else {
              cmd += '1T'
            }
            // Apertura cassetto
            if (info.metodo === 'contanti') {
              cmd += 'a'
            }
          }

          await callRT('ditron', { ip: rtConfig.ip, porta: rtConfig.porta || 9600, azione: 'raw', dati: { cmd } })

          // Stampa scontrino di cortesia se richiesto (cortesia o carta con modulo abilitato)
          console.log('metodo:', info.metodo, 'cortesiaAbilitato:', impostazioni.cortesiaAbilitato)
          if (info.metodo === 'cortesia' || (info.metodo === 'carta' && impostazioni.cortesiaAbilitato)) {
            let cmdCortesia = 'j'
            for (const riga of scontrinoCorrente.righe) {
              if (riga.importo < 0) continue
              const descr = (riga.nome || '').replace(/"/g, '').substring(0, 38)
              const qta = riga.quantita > 1 ? `${riga.quantita}x ` : ''
              cmdCortesia += `"${qta}${descr}"@`
              if (riga.nota) {
                const nota = riga.nota.replace(/"/g, '').substring(0, 38)
                cmdCortesia += `"  >> ${nota}"@`
              }
            }
            cmdCortesia += 'J'
            await new Promise(r => setTimeout(r, 500))
            await callRT('ditron', { ip: rtConfig.ip, porta: rtConfig.porta || 9600, azione: 'raw', dati: { cmd: cmdCortesia } })
          }
        } else if (rtConfig.marca === 'rch') {
          // RCH Print!F — HTTP XML
          const comandi = []
          for (const riga of scontrinoCorrente.righe) {
            if (riga.repartoId === null && riga.importo < 0) continue
            const ivaIndice = rtMappatura[riga.repartoId]?.ivaIndice || 1
            const importoCents = Math.round(riga.importo)
            const descr = (riga.nome || '').replace(/[()\/]/g, ' ').substring(0, 36)
            if (riga.quantita > 1) {
              comandi.push(`=R${ivaIndice}/$${importoCents}/*${riga.quantita}/(${descr})`)
            } else {
              comandi.push(`=R${ivaIndice}/$${importoCents}/(${descr})`)
            }
          }
          // Sconti RCH
          const righeSconto = scontrinoCorrente.righe.filter(r => r.repartoId === null && r.importo < 0)
          if (righeSconto.length > 0) {
            comandi.push('=S')
            for (const sconto of righeSconto) {
              const scontoCents = Math.abs(Math.round(sconto.importo))
              if (sconto.nome.includes('%')) {
                const perc = sconto.nome.match(/(\d+(?:\.\d+)?)%/)?.[1] || '0'
                comandi.push(`=%-/$${perc}`)
              } else {
                comandi.push(`=V-/$${scontoCents}`)
              }
            }
          }
          // Pagamento
          if (info.metodo === 'carta') {
            comandi.push('=T4')
          } else if (info.metodo === 'cortesia' || info.metodo === 'contanti') {
            const contantiCents = info.totale + (info.resto || 0)
            if (contantiCents > info.totale) {
              comandi.push(`=T1/$${contantiCents}`)
            } else {
              comandi.push('=T1')
            }
          }

          await callRT('rch', { ip: rtConfig.ip, porta: rtConfig.porta || 80, comandi })

          // Stampa scontrino di cortesia RCH
          if (info.metodo === 'cortesia' || (info.metodo === 'carta' && impostazioni.cortesiaAbilitato)) {
            const comandiCortesia = ['=C0']
            for (const riga of scontrinoCorrente.righe) {
              if (riga.importo < 0) continue
              const descr = (riga.nome || '').replace(/[()\/]/g, ' ').substring(0, 36)
              const qta = riga.quantita > 1 ? `${riga.quantita}x ` : ''
              comandiCortesia.push(`="/?A/(${qta}${descr})`)
            }
            comandiCortesia.push('=C1')
            await new Promise(r => setTimeout(r, 1000))
            await callRT('rch', { ip: rtConfig.ip, porta: rtConfig.porta || 80, comandi: comandiCortesia })
          }
        } else {
          // Ditron — TCP
          const righeConRt = scontrinoCorrente.righe.map(riga => ({
            ...riga,
            numeroRepartoRt: rtMappatura[riga.repartoId]?.numeroRt || 1,
          }))
          await callRT('ditron', { ip: rtConfig.ip, porta: rtConfig.porta, azione: 'scontrino', dati: { righe: righeConRt, metodo: info.metodo === 'cortesia' ? 'contanti' : info.metodo, totale: info.totale, resto: info.resto || 0, contatto: info.contatto || null } })
        }
      } catch(e) {
        console.error('Errore stampa RT:', e)
      }
    }
  }
  
  return (
    <div className={styles.page}>

      {negozio && !negozio.scaduto && negozio.giorniRimanenti <= 7 && (
        <div style={{
          background:'#ffb83022', borderBottom:'2px solid #ffb830',
          padding:'10px 16px', textAlign:'center',
          fontSize:'0.82rem', color:'#ffb830',
          fontFamily:"'DM Mono',monospace"
        }}>
          ⚠️ Licenza in scadenza tra <strong>{negozio.giorniRimanenti} giorni</strong> ({new Date(negozio.data_scadenza).toLocaleDateString('it-IT')}) — contatta il rivenditore
        </div>
      )}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoMark}>🧾</div>
          <div>
            <div className={styles.logoName}>ScontrinoDigitale</div>
            <div className={styles.headerUser}>{user?.name} · {user?.role === 'owner' ? 'Admin' : 'Cassiere'}</div>
          </div>
        </div>
        <div className={styles.headerCenter}>
          {errore && <div className={styles.errore}>⚠ {errore}</div>}
        </div>
        <div className={styles.headerRight}>

            {/* NASCONDE GLI SCONTRINI E LE CHIUSURE
          <div className={styles.contatori}>
            <span title="Scontrini oggi">🧾 {contatori.scontrini}</span>
            <span title="Chiusure oggi">🔒 {contatori.chiusure}</span>
          </div>*/}

          {user?.role === 'owner' && (
            <>
              <button className={styles.cfgBtn1} onClick={() => router.push('/storico')}>
                📋 Storico Scontrini
              </button>
              <button className={styles.cfgBtn} onClick={() => router.push('/configurazione')}>
                ⚙️ Configurazione
              </button>
            </>
          )}
          <button className={styles.logoutBtn} onClick={() => { logout(); router.replace('/login') }}>
            Esci
          </button>
        </div>
      </header>

      {/* BENVENUTO */}
      {benvenuto && user && (
        <div style={{
          position:'fixed', inset:0, zIndex:500,
          display:'flex', alignItems:'center', justifyContent:'center',
          pointerEvents:'none',
          animation:'benvenutoFade 3s ease forwards',
        }}>
          <div style={{
            background:'#111318', border:'1px solid #00e5a0',
            borderRadius:24, padding:'48px 72px',
            display:'flex', flexDirection:'column', alignItems:'center', gap:16,
            boxShadow:'0 0 64px rgba(0,229,160,0.2), 0 32px 80px rgba(0,0,0,0.7)',
            animation:'benvenutoIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{
              width:88, height:88, borderRadius:'50%',
              background:'rgba(0,229,160,0.12)', border:'2px solid #00e5a0',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 32px rgba(0,229,160,0.35)',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{fontSize:'0.72rem', color:' #00e5a0', letterSpacing:4, fontFamily:"'DM Mono',monospace", textTransform:'uppercase'}}>
              Benvenuto/a
            </div>
            <div style={{fontFamily:"'Unbounded',sans-serif", fontSize:'1.8rem', fontWeight:700, color:'#ffd06b', letterSpacing:'-0.5px'}}>
              {user.name}
            </div>
            <div style={{fontSize:'0.82rem', color:' #00e5a0', fontFamily:"'DM Mono',monospace"}}>
              {user.role === 'owner' ? '👑 Titolare — Accesso Completo' : '👤 Cassiere — Solo Cassa'}
            </div>
          </div>
          <style>{`
            @keyframes benvenutoIn {
              from { transform:scale(0.7); opacity:0 }
              to   { transform:scale(1);   opacity:1 }
            }
            @keyframes benvenutoFade {
              0%   { opacity:1 }
              70%  { opacity:1 }
              100% { opacity:0 }
            }
          `}</style>
        </div>
      )}

      <div className={styles.main}>

        {/* SINISTRA */}
        <div className={styles.colLeft}>
          <div className={styles.displayImporto}>
            <div className={styles.displayLabel}>TOTALE IMPORTO</div>
            <div className={styles.displayValue}>
              {inputCents > 0 ? `€ ${fmt(inputCents)}` : righe.length > 0 ? `€ ${fmt(totale)}` : '€ 0,00'}
            </div>
            {ultimaChiusa && righe.length === 0 && (
              <div className={styles.ultimaChiusa}>
                Ultimo: {ultimaChiusa.nome} €{fmt(ultimaChiusa.importo)}
              </div>
            )}
          </div>

          <div className={styles.numpad}>
            {['7','8','9','4','5','6','1','2','3'].map(n => (
              <button key={n} className={styles.key} onClick={() => pressDigit(n)}>{n}</button>
            ))}
            <button className={styles.key} onClick={pressClear}>C</button>
            <button className={styles.key} onClick={() => pressDigit('0')}>0</button>
            <button className={styles.key} onClick={pressDoubleZero}>00</button>
          </div>

          <div className={styles.funzioni}>
            <button className={styles.fnBtn} onClick={annullaUltima} disabled={righe.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
              Ann. ultima
            </button>
            <button className={`${styles.fnBtn} ${styles.fnDanger}`}
              onClick={() => righe.length > 0 && setShowConfirmAnnulla(true)}
              disabled={righe.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
              Ann. tutto
            </button>
          </div>

          {(righe.length > 0 || scontrinoAperto) && (
            <div className={styles.subtotale}>
              <div className={styles.subtotaleRow}
                style={{cursor:'pointer', userSelect:'none'}}
                onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowSconto(true), 600) }}
                onMouseUp={() => clearTimeout(longPressTimer.current)}
                onMouseLeave={() => clearTimeout(longPressTimer.current)}
                onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowSconto(true), 600) }}
                onTouchEnd={() => clearTimeout(longPressTimer.current)}
              >
                <span>Subtotale {showSconto && '✂️'}</span>
                <span>€ {fmt(totale)}</span>
              </div>
              {Object.entries(subtotalePerIva).map(([iva, imp]) => (
                <div key={iva} className={styles.subtotaleIva}>
                  <span>IVA {iva}%</span>
                  <span>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</span>
                </div>
              ))}
            </div>
          )}


          <div style={{display:'flex', gap:8, marginBottom:8, flexWrap:'wrap'}}>
            {impostazioni.asportoAbilitato && (
              <button onClick={() => router.push('/asporto')}
                style={{width:60, height:60, background:'black', border:'none', borderRadius:10,
                  color:'#6482ff', cursor:'pointer', fontSize:'0.72rem', fontWeight:700,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2}}>
                <span style={{fontSize:'1.4rem'}}>🛵</span>
                <span>Asporto</span>
              </button>
            )}
            {impostazioni.magazzinoAbilitato && (
              <button onClick={() => router.push('/magazzino')}
                style={{width:60, height:60, background:'black', border:'none', borderRadius:10,
                  color:'#ffb830', cursor:'pointer', fontSize:'0.72rem', fontWeight:700,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2}}>
                <span style={{fontSize:'1.4rem'}}>📦</span>
                <span>Giacenze</span>
              </button>
            )}
            {impostazioni.tavoliAbilitati !== false && (
              <button onClick={() => router.push('/tavoli')}
                style={{width:60, height:60, background:'black', border:'none', borderRadius:10,
                  color:'#00e5a0', cursor:'pointer', fontSize:'0.72rem', fontWeight:700,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2}}>
                <span style={{fontSize:'1.4rem'}}>🍽️</span>
                <span>Tavoli</span>
              </button>
            )}
          </div>
          {scontrinoAperto && righe.length === 0 && (
            <button className={styles.chiudiBtn}
              style={{background:'#ff4d6a'}}
              onClick={() => setShowConfirmAnnulla(true)}>
              🗑️ Annulla scontrino
            </button>
          )}
          <button className={styles.chiudiBtn} onClick={handleChiudi} disabled={righe.length === 0 || (scontrinoAperto && righe.length === 0)}>
            Chiudi scontrino
            {righe.length > 0 && <span className={styles.chiudiBadge}>€ {fmt(totale)}</span>}
          </button>
        </div>

        {/* CENTRO */}
        <div className={styles.colCenter}>
          {/* SCONTRINO IN CORSO - metà superiore */}
          <div className={styles.colCenterTop}>
            <div className={styles.displayHeader}>
              <div style={{display:'flex', alignItems:'center', gap:8, flex:1}}>
                <span style={{fontSize:'1rem'}}>📷</span>
                <input
                  type="text"
                  placeholder="Scansiona codice a barre..."
                  value={barcodeVal}
                  onChange={e => setBarcodeVal(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      const val = barcodeVal.trim()
                      if (val.length > 0) {
                        cercaProdottoBarcode(val)
                        setBarcodeVal('')
                      }
                    }
                  }}
                  style={{
                    flex:1, background:'transparent', border:'none',
                    borderBottom:'1px solid #252830', color:'#eef0f6',
                    fontSize:'0.85rem', padding:'4px 8px', outline:'none',
                    fontFamily:"'DM Mono',monospace"
                  }}
                />
              </div>
              <span className={styles.righeCount}>{righe.length} VOCI</span>
            </div>
            <div className={styles.righeList}>
              {righe.length === 0 && (
                <div className={styles.righeEmpty}>
                  <div style={{fontSize:'2rem'}}>🧾</div>
                  <div>Digita un importo e seleziona un reparto</div>
                  <div style={{fontSize:'0.75rem',marginTop:4}}>oppure clicca direttamente su un prodotto</div>
                </div>
              )}
              {righe.map((r, i) => (
                <div key={r.id} className={`${styles.riga} ${i === righe.length-1 ? styles.rigaLast : ''}`}>
                  <div className={styles.rigaIcona} style={{background:r.colore+'22'}}>{ICONE[r.icona]||'📦'}</div>
                  <div className={styles.rigaInfo}>
                    <div className={styles.rigaNome}>
                      {r.nome}
                      {r.quantita > 1 && <span className={styles.rigaQty}>×{r.quantita}</span>}
                    </div>
                    {r.nota && (
                      <div style={{fontSize:'0.82rem', color: r.nota.startsWith('+') ? 'yellow' : 'red', marginTop:2}}>
                        📝 {r.nota}{r.nota.startsWith('+') && r.importoBase ? ` +€${((r.importo - r.importoBase)/100).toFixed(2).replace('.',',')}` : ''}
                      </div>
                    )}
                    <div className={styles.rigaMeta}>IVA {r.iva}% · €{fmt(r.importo)} cad.</div>
                  </div>







                  <div className={styles.rigaDestra}>
  <div className={styles.rigaTotale}>€ {fmt(r.totaleRiga)}</div>
  
  {/* Bottoni quantità */}
  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
    <button
      onClick={() => aggiornaQuantita(r.id, -1)}
      style={{ width:24, height:24, borderRadius:6, background:'#252830', border:'none', color:'#eef0f6', cursor:'pointer', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}
    >−</button>
    <span style={{ fontSize:'0.82rem', color:'#eef0f6', minWidth:16, textAlign:'center', fontFamily:"'DM Mono',monospace" }}>
      {r.quantita}
    </span>
    <button
      onClick={() => aggiornaQuantita(r.id, 1)}
      style={{ width:24, height:24, borderRadius:6, background:'#252830', border:'none', color:'#eef0f6', cursor:'pointer', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}
    >+</button>
  </div>

  <button onClick={() => { setNotaModal(r.id); setNotaTesto(r.nota || '') }}
    title="Aggiungi nota"
    style={{ background:'transparent', border:'none', cursor:'pointer', color: r.nota ? '#ffb830' : '#5a5d6e', fontSize:'1rem', padding:'4px' }}>
    ✏️
  </button>
  <button className={styles.rigaDelete} onClick={() => eliminaRiga(r.id)} title="Elimina voce">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>
</div>











                </div>
              ))}
            </div>
          </div>

          {/* PRODOTTI REPARTO - metà inferiore */}
          {repartoAttivo && (
            <div className={styles.colCenterBottom}>
              {(() => {
                const rep = reparti.find(r => r.id === repartoAttivo)
                const prodotti = rep?.sottoreparti?.filter(s => s.abilitato) || []
                return (
                  <>
                    <div className={styles.prodottiHeader}>
                      <span style={{color: rep?.colore}}>{ICONE[rep?.icona]||'📦'}</span>
                      <span>{rep?.nome}</span>
                      <span className={styles.righeCount}>{prodotti.length} prodotti</span>
                    </div>
                    {prodotti.length === 0 ? (
                      <div className={styles.righeEmpty} style={{padding:20}}>
                        <div style={{fontSize:'0.8rem', color:'#5a5d6e'}}>Nessun prodotto — digita importo e premi il reparto</div>
                      </div>
                    ) : (
                      <div className={styles.prodottiGrid}>
                       {prodotti.map(sr => {
  const qtaInScontrino = righe
    .filter(r => r.nome === sr.nome && r.importo === sr.prezzoFisso)
    .reduce((s, r) => s + r.quantita, 0)

  return (
    <button key={sr.id}
      className={styles.prodottoCard}
      style={{borderColor: rep?.colore + '66', position:'relative'}}
      onClick={() => handleSottorepartoClick(rep, sr)}
    >
      {qtaInScontrino > 0 && (
        <div style={{
          position:'absolute', top:-8, right:-8,
          background: rep?.colore,
          color:'#08090c',
          borderRadius:'50%',
          width:22, height:22,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'0.72rem', fontWeight:700,
          fontFamily:"'DM Mono',monospace",
          boxShadow:`0 0 8px ${rep?.colore}88`,
          zIndex:1,
        }}>
          {qtaInScontrino}
        </div>
      )}
      <div className={styles.prodottoNome}>{sr.nome}</div>
      <div className={styles.prodottoPrezzo} style={{color: rep?.colore}}>
        € {fmt(sr.prezzoFisso)}
      </div>
    </button>
  )
})}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>

        {/* DESTRA */}
        <div className={styles.colRight}>
          <div className={styles.repartiHeader}>REPARTI</div>
          <div className={styles.repartiList}>
          {reparti.map(r => {
  const qtaReparto = righe
    .filter(riga => riga.repartoId === r.id)
    .reduce((s, riga) => s + riga.quantita, 0)

  return (
    <button key={r.id}
      className={`${styles.repartoBtn} ${repartoAttivo === r.id ? styles.repartoActive : ''}`}
      style={{
        borderColor: repartoAttivo === r.id ? r.colore : 'transparent',
        background: repartoAttivo === r.id ? r.colore + '15' : 'transparent',
        position: 'relative',
      }}
      onClick={() => handleRepartoClick(r)}
    >
      {qtaReparto > 0 && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          background: r.colore,
          color: '#08090c',
          borderRadius: '50%',
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.68rem', fontWeight: 700,
          fontFamily: "'DM Mono',monospace",
          boxShadow: `0 0 6px ${r.colore}88`,
          zIndex: 1,
        }}>
          {qtaReparto}
        </div>
      )}
      <span className={styles.repartoIcn}>{ICONE[r.icona]||'📦'}</span>
      <span className={styles.repartoNm}>{r.nome}</span>
      {inputCents > 0 && (
        <span className={styles.repartoEuro} style={{background:r.colore+'22',color:r.colore}}>
          + €{fmt(inputCents)}
        </span>
      )}
    </button>
  )
})}
          </div>
        </div>
      </div>

      {/* MODAL CHIUSURA */}
      {showChiusura && scontrinoCorrente && (
        <ChiusuraModal
          scontrino={scontrinoCorrente}
          onAnnulla={handleAnnullaChiusura}
          onSuccesso={handleSuccesso}
          cortesiaAbilitato={impostazioni.cortesiaAbilitato}
        />
      )}

      {/* MODAL CONFERMA ANNULLA */}
      {showConfirmAnnulla && (
        <div className={styles.overlay} onClick={() => setShowConfirmAnnulla(false)}>
          <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmIcona}>🗑️</div>
            <div className={styles.confirmTitolo}>Annullare il conto?</div>
            <div className={styles.confirmSub}>
              Verranno eliminate {righe.length} voci per un totale di €{fmt(totale)}.<br/>
              Questa operazione non può essere annullata.
            </div>
            <div className={styles.confirmBtns}>
              <button className={styles.cancelBtn} onClick={() => setShowConfirmAnnulla(false)}>
                No, torna al conto
              </button>
              <button className={styles.confirmDangerBtn} onClick={handleConfermAnnulla}>
                Sì, annulla tutto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUCCESSO */}
      {showSuccesso && (
        <div className={styles.overlay} onClick={() => setShowSuccesso(null)}>
          <div className={styles.successModal} onClick={e => e.stopPropagation()}
            ref={el => { if(el) setTimeout(() => setShowSuccesso(null), 1500) }}>
            <div className={styles.successCircle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className={styles.successTitolo}>Scontrino inviato!</div>
            <div className={styles.successId}>{showSuccesso.id}</div>
            <div className={styles.successContatori}>
              <span>🧾 Scontrino n° {showSuccesso.numeroScontrino}</span>
              <span>🔒 Chiusura n° {showSuccesso.numeroChiusure}</span>
            </div>
            {showSuccesso.contatto && (
              <div className={styles.successContatto}>📨 Inviato a <strong>{showSuccesso.contatto}</strong></div>
            )}
            <div className={styles.successTotale}>€ {fmt(showSuccesso.totale)}</div>
            <div className={styles.successMeta}>
              {showSuccesso.metodo === 'carta' ? '💳 Carta / POS' : '💵 Contanti'}
              {showSuccesso.metodo === 'contanti' && showSuccesso.resto > 0 &&
                ` · Resto €${fmt(showSuccesso.resto)}`}
            </div>

          </div>
        </div>
      )}

      {/* AVVISO MEZZANOTTE */}
      {showAvvisoMezzanotte && (
        <div className={styles.overlay}>
          <div className={styles.avvisoModal}>
            <div className={styles.avvisoIcona}>⏰</div>
            <div className={styles.avvisoTitolo}>Chiusura tra 10 minuti!</div>
            <div className={styles.avvisoSub}>
              Sono le 23:50 — ricordati di effettuare la<br/>
              <strong>chiusura giornaliera</strong> prima della mezzanotte.
            </div>
            <div className={styles.avvisoContatori}>
              <div>Scontrini oggi: <strong>{contatori.scontrini}</strong></div>
              <div>Chiusure: <strong>{contatori.chiusure}</strong></div>
            </div>
            <button className={styles.avvisoBtn} onClick={() => setShowAvvisoMezzanotte(false)}>
              Ho capito, provvedo subito
            </button>
          </div>
        </div>
      )}

      {/* MODAL SCONTO */}
      {showSconto && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'2px solid #00e5a0',borderRadius:16,padding:28,maxWidth:380,width:'90%'}}>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'#00e5a0',marginBottom:8}}>✂️ Applica Sconto</div>
            <div style={{fontSize:'0.95rem',color:'#ffb830',marginBottom:20}}>
              Totale attuale: <strong style={{color:'#eef0f6'}}>€ {fmt(totale)}</strong>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              {['euro','percentuale'].map(t => (
                <button key={t} onClick={() => setTipoSconto(t)}
                  style={{flex:1,padding:'10px',borderRadius:8,border:'none',cursor:'pointer',
                    background: tipoSconto === t ? '#00e5a0' : '#1a1c24',
                    color: tipoSconto === t ? '#08090c' : '#eef0f6',
                    fontWeight: tipoSconto === t ? 700 : 400}}>
                  {t === 'euro' ? '€ Euro' : '% Percentuale'}
                </button>
              ))}
            </div>
            <input
              type="text" inputMode="decimal"
              value={valoreSconto}
              onChange={e => setValoreSconto(e.target.value)}
              placeholder={tipoSconto === 'euro' ? 'Es. 1,50' : 'Es. 10'}
              autoFocus
              style={{width:'100%',background:'#1a1c24',border:'1px solid #252830',borderRadius:10,
                padding:'12px',color:'#eef0f6',fontSize:'1.2rem',textAlign:'center',
                boxSizing:'border-box',outline:'none',marginBottom:16,
                fontFamily:"'DM Mono',monospace"}}
            />
            {valoreSconto && tipoSconto === 'euro' && (
              <div style={{textAlign:'center',color:'#00e5a0',marginBottom:12,fontSize:'0.85rem'}}>
                Sconto: € {fmt(parseInt(valoreSconto) || 0)} · Nuovo totale: € {fmt(totale - (parseInt(valoreSconto) || 0))}
              </div>
            )}
            {valoreSconto && tipoSconto === 'percentuale' && (
              <div style={{textAlign:'center',color:'#00e5a0',marginBottom:12,fontSize:'0.85rem'}}>
                Nuovo totale: € {fmt(totale - Math.round(totale * parseFloat(valoreSconto.replace(',','.') || 0) / 100))}
              </div>
            )}
            <div style={{display:'flex',gap:12}}>
              <button onClick={() => { setShowSconto(false); setValoreSconto('') }}
                style={{flex:1,padding:'12px',borderRadius:10,border:'1px solid #252830',
                  background:'transparent',color:'#eef0f6',cursor:'pointer'}}>
                Annulla
              </button>
              <button onClick={() => {
                  if (applicaSconto(tipoSconto, valoreSconto)) {
                    setShowSconto(false)
                    setValoreSconto('')
                  }
                }}
                style={{flex:1,padding:'12px',borderRadius:10,border:'none',
                  background:'#00e5a0',color:'#08090c',cursor:'pointer',fontWeight:700}}>
                ✓ Applica
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL NOTA */}
      {notaModal !== null && (
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{background:'#111318',border:'1px solid #252830',borderRadius:20,padding:24,width:420,maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontSize:'0.99rem',fontWeight:700,color:'#ffb830'}}>
        ✏️ Variante per: {righe.find(r => r.id === notaModal)?.nome}
      </div>

      {/* Tipo */}
      <div style={{display:'flex',gap:8}}>
      <button onClick={() => { setNotaTipo('rimozione'); setAggiunte([]) }}
          style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${notaTipo==='rimozione' ? '#ff4d6a' : '#252830'}`,
            background: notaTipo==='rimozione' ? 'rgba(255,77,106,0.15)' : 'transparent',
            color: notaTipo==='rimozione' ? '#ff4d6a' : '#5a5d6e', cursor:'pointer', fontWeight:700, fontSize:'0.9rem'}}>
          − Rimozione
        </button>
        <button onClick={() => setNotaTipo('aggiunta')}
          style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${notaTipo==='aggiunta' ? '#00e5a0' : '#252830'}`,
            background: notaTipo==='aggiunta' ? 'rgba(0,229,160,0.15)' : 'transparent',
            color: notaTipo==='aggiunta' ? '#00e5a0' : '#5a5d6e', cursor:'pointer', fontWeight:700, fontSize:'0.9rem'}}>
          + Aggiunta
        </button>
      </div>

      {/* Aggiunte rapide 
{notaTipo === 'aggiunta' && (  QUESTO SE VUOI FARE LA MODIFICHE SU TUTTI I CLIENTI*/}

 {/* QUESTO MODIFICA SOLO IL CLIENTE POESIA */}

{notaTipo === 'aggiunta' && negozio?.slug === 'poesia' && (  

  <div style={{display:'flex',flexDirection:'column',gap:8}}>
    <div style={{fontSize:'0.8rem',color:'#00ffb3',letterSpacing:1}}>AGGIUNTE RAPIDE</div>
    {[
      { gruppo: '€ 1,00', costo: 100, items: ['Olive','Ortaggi','Patatine','Wurstel','Funghi','Doppia mozzarella fiordilatte'] },
      { gruppo: '€ 1,50', costo: 150, items: ['Prosciutto cotto','Salsiccia fresca','Mortadella','Salamino piccante','Nduja','Stracciatella','Grana','Tonno'] },
      { gruppo: '€ 2,00', costo: 200, items: ['Bresaola','Prosciutto crudo','Speck','Granella di pistacchio','Mozzarella senza lattosio','Mozzarella di bufala','Impasti speciali'] },
    ].map(({ gruppo, costo, items }) => (
      <div key={gruppo}>
        <div style={{fontSize:'0.82rem',color:'#ffb830',marginBottom:4}}>{gruppo}</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {items.map(item => {
            const selected = aggiunte.some(a => a.nome === item && a.costo === costo)
            return (
              <button key={item}
                onClick={() => {
                  setAggiunte(prev => {
                    const esiste = prev.find(a => a.nome === item)
                    if (esiste) return prev.filter(a => a.nome !== item)
                    return [...prev, { nome: item, costo }]
                  })
                }}
                style={{
                  padding:'6px 12px', borderRadius:8, fontSize:'0.9rem', cursor:'pointer',
                  border: `1px solid ${selected ? '#00e5a0' : '#252830'}`,
                  background: selected ? 'rgba(0,229,160,0.15)' : '#1a1c24',
                  color: selected ? '#00e5a0' : '#eef0f6',
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
      <div style={{fontSize:'0.75rem',color:'#00e5a0',background:'rgba(0,229,160,0.1)',borderRadius:8,padding:'6px 10px'}}>
        💰 Totale aggiunte: +€{(aggiunte.reduce((s,a) => s + a.costo, 0)/100).toFixed(2).replace('.',',')}
        {' — '}{aggiunte.map(a => a.nome).join(', ')}
      </div>
    )}
  </div>
)}
      {/* Campo manuale */}
      <textarea value={notaTesto} onChange={e => { setNotaTesto(e.target.value) }}
        placeholder={notaTipo === 'rimozione' ? 'es. senza mozzarella...' : 'oppure scrivi una variante personalizzata...'}
        rows={2}
        style={{background:'#1a1c24',border:'1px solid #252830',borderRadius:10,padding:12,color:'#eef0f6',fontSize:'0.9rem',resize:'none',fontFamily:"'DM Sans',sans-serif"}}
      />

      <div style={{display:'flex',gap:10}}>
      <button onClick={() => { setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([]) }}
          style={{flex:1,padding:12,borderRadius:10,background:'transparent',border:'1px solid #252830',color:'#eef0f6',cursor:'pointer'}}>
          Annulla
        </button>
        <button onClick={() => {
    const tutteLeAggiunte = [
      ...aggiunte.map(a => a.nome),
      ...(notaTesto.trim() ? [notaTesto.trim()] : [])
    ]
    const costoTotale = aggiunte.length > 0
      ? aggiunte.reduce((s,a) => s + a.costo, 0)
      : (impostazioni.costoAggiunta ?? 50)
    const testoFinale = tutteLeAggiunte.join(', ')
    if (testoFinale) salvaNota(notaModal, testoFinale, notaTipo, costoTotale)
    setNotaModal(null); setNotaTesto(''); setNotaTipo('rimozione'); setAggiunte([])
  }}
  style={{flex:1,padding:12,borderRadius:10,background:'#00e5a0',border:'none',color:'#08090c',fontWeight:700,cursor:'pointer'}}>
  Salva
</button>
      </div>
    </div>
  </div>
)}
      {/* MODAL AVVISO SCORTE */}
      {avvisoMagazzino.length > 0 && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.8)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'2px solid #ffb830',borderRadius:16,padding:28,maxWidth:400,width:'90%'}}>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'#ffb830',marginBottom:16}}>⚠️ Scorte in esaurimento</div>
            {avvisoMagazzino.map((a,i) => (
              <div key={i} style={{padding:'8px 0',borderBottom:'1px solid #252830',fontSize:'0.85rem'}}>
                <strong>{a.nome}</strong>
                <div style={{fontSize:'0.78rem',color:'#5a5d6e',marginTop:4}}>
                  Rimasti: <strong style={{color:'#ffb830'}}>{a.giacenza}</strong> · Soglia minima: {a.minima}
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:12,marginTop:20}}>
              <button onClick={() => { setAvvisoMagazzino([]); router.push('/magazzino') }}
                style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'#ffb830',color:'#08090c',cursor:'pointer',fontWeight:700}}>
                📦 Vai al magazzino
              </button>
              <button onClick={() => setAvvisoMagazzino([])}
                style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid #252830',background:'transparent',color:'#eef0f6',cursor:'pointer'}}>
                Ignora
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL GIACENZA INSUFFICIENTE */}
      {giacenzaInsuff.length > 0 && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.8)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#111318',border:'2px solid #ff4d6a',borderRadius:16,padding:28,maxWidth:400,width:'90%'}}>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'#ff4d6a',marginBottom:16}}>⚠️ Giacenza insufficiente</div>
            {giacenzaInsuff.map((r,i) => (
              <div key={i} style={{padding:'8px 0',borderBottom:'1px solid #252830',fontSize:'0.85rem'}}>
                <strong>{r.nome}</strong>
                <div style={{fontSize:'0.78rem',color:'#5a5d6e',marginTop:4}}>
                  Disponibili: <strong style={{color:'#ff4d6a'}}>{r.giacenza}</strong> · Richiesti: <strong>{r.quantita}</strong>
                </div>
              </div>
            ))}
            <button onClick={() => setGiacenzaInsuff([])} style={{width:'100%',marginTop:20,padding:'12px',borderRadius:10,border:'none',background:'#ff4d6a',color:'white',cursor:'pointer',fontWeight:700}}>
              OK — Modifica lo scontrino
            </button>
          </div>
        </div>
      )}
<PannelloRT
  rtConfig={rtConfig}
  mappatura={rtMappatura}
  scontrino={righe.length > 0 ? { righe, metodo: 'contanti', totale, resto: 0, contatto: null } : null}
  onStampa={() => setShowChiusura(true)}
  onChiusura={() => {
    const c = resetScontrini()
    setContatori(c)
  }}
/>
    </div>
  )
}

function ChiusuraModal({ scontrino, onAnnulla, onSuccesso, cortesiaAbilitato }) {
  const [metodo, setMetodo] = useState('carta')
  const [datoCliente, setDatoCliente] = useState('')
  const [contanti, setContanti] = useState('')
  const [invio, setInvio] = useState('idle') // idle | sending | error
  const contantiCents = Math.round(parseFloat(contanti.replace(',', '.') || '0') * 100)
  const resto = metodo === 'contanti' ? Math.max(0, contantiCents - scontrino.totale) : 0

  async function handleInvia() {
    const negozio = (() => { try { return JSON.parse(localStorage.getItem('sd_negozio') || '{}') } catch { return {} } })()
    // Invia email solo se il contatto è un'email valida
    if (datoCliente && datoCliente.includes('@')) {
      setInvio('sending')
      try {
        const res = await fetch('/api/invia-scontrino', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinatario: datoCliente,
            scontrino: { ...scontrino, metodo, resto },
            negozio,
          })
        })
        if (!res.ok) throw new Error('Errore invio')
      } catch {
        setInvio('error')
        setTimeout(() => setInvio('idle'), 3000)
        return
      }
    }
    onSuccesso({ id:scontrino.id, totale:scontrino.totale, contatto:datoCliente||null, metodo, resto })
  }

  return (
    <div className={styles.overlay} onClick={onAnnulla}>
      <div className={styles.chiusuraModal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Chiudi Scontrino</div>
          <div className={styles.modalId}>{scontrino.id}</div>
        </div>
        <div className={styles.modalRighe}>
          {scontrino.righe.map(r => (
            <div key={r.id} className={styles.modalRiga} style={{flexDirection:'column', alignItems:'flex-start', gap:2}}>
              <div style={{display:'flex', justifyContent:'space-between', width:'100%'}}>
                <span>{r.nome}{r.quantita > 1 ? ` ×${r.quantita}` : ''}</span>
                <span>€ {fmt(r.totaleRiga)}</span>
              </div>
              {r.nota && (
                <div style={{fontSize:'0.72rem', color: r.nota.startsWith('+') ? '#00e5a0' : '#ffb830'}}>
                  {r.nota.startsWith('+') && r.importoBase
                    ? `📝 ${r.nota} +€${((r.importo - r.importoBase)/100).toFixed(2).replace('.',',')}`
                    : `📝 ${r.nota}`}
                </div>
              )}
            </div>
          ))}
          <div className={styles.modalTotale}>
            <span>TOTALE</span>
            <span>€ {fmt(scontrino.totale)}</span>
          </div>
        </div>
        <div className={styles.modalIva}>
          {Object.entries(
            scontrino.righe.reduce((acc,r) => {
              const k = String(r.iva)
              acc[k] = (acc[k]||0) + r.totaleRiga
              return acc
            }, {})
          ).map(([iva,imp]) => (
            <div key={iva} className={styles.modalIvaRow}>
              <span>IVA {iva}% su €{fmt(imp)}</span>
              <span>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</span>
            </div>
          ))}
        </div>
        <div className={styles.modalSection}>
          <div className={styles.modalLabel}>Metodo di pagamento</div>
          <div className={styles.metodoGroup}>
            <button className={`${styles.metodoBtn} ${metodo==='carta' ? styles.metodoActive : ''}`} onClick={() => setMetodo('carta')}>
              💳 Carta / POS
            </button>
            <button className={`${styles.metodoBtn} ${metodo==='contanti' ? styles.metodoActive : ''}`} onClick={() => setMetodo('contanti')}>
              💵 Contanti
            </button>
            {cortesiaAbilitato && (
            <button className={`${styles.metodoBtn1} ${metodo==='cortesia' ? styles.metodoActive : ''}`} onClick={() => setMetodo('cortesia')}>
              ��️ Fiscale + Cortesia
            </button>
            )}
          </div>
          {metodo === 'contanti' && (
            <div className={styles.contantiWrap}>
              <input type="text" inputMode="decimal" placeholder="Importo ricevuto €"
                value={contanti} onChange={e => setContanti(e.target.value)}
                className={styles.contantiInput} autoFocus />
              {contantiCents > 0 && (
                <div className={styles.restoBox}>Resto: <strong>€ {fmt(resto)}</strong></div>
              )}
            </div>
          )}
        </div>
        <div className={styles.modalSection}>
          <div className={styles.modalLabel}>Invia scontrino digitale (opzionale)</div>
          <input type="text" inputMode="email" placeholder="Email o numero di telefono"
            value={datoCliente} onChange={e => setDatoCliente(e.target.value)}
            className={styles.clienteInput} />
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onAnnulla}>← Torna al conto</button>
          <button className={styles.inviaBtn} onClick={handleInvia} disabled={invio === 'sending'}>
            {invio === 'sending' ? '⏳ Invio in corso...' : invio === 'error' ? '❌ Errore — riprova' : '✓ Conferma e invia'}
          </button>
        </div>
      </div>

    </div>
  )
}