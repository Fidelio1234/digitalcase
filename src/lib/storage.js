// ─────────────────────────────────────────────────────────────────────────────
// storage.js — wrapper localStorage per reparti
// In futuro: sostituire con chiamate Supabase
// ─────────────────────────────────────────────────────────────────────────────

const KEY_REPARTI = 'sd_reparti'

// Reparti di esempio al primo avvio
const DEFAULT_REPARTI = [
  {
    id: 'r1',
    nome: 'Caffetteria',
    colore: '#00e5a0',
    icona: 'coffee',
    iva: 10,
    minimoImporto: 0,
    massimoImporto: 50,
    abilitato: true,
    ordine: 1,
    sottoreparti: [
      {
        id: 'sr1',
        nome: 'Caffè',
        prezzoFisso: 120, // centesimi → 1,20€
        ivaOverride: null, // null = eredita dal padre
        minimoImporto: 0,
        massimoImporto: 50,
        abilitato: true,
        ordine: 1,
      },
      {
        id: 'sr2',
        nome: 'Cappuccino',
        prezzoFisso: 160,
        ivaOverride: null,
        minimoImporto: 0,
        massimoImporto: 50,
        abilitato: true,
        ordine: 2,
      },
    ],
  },
  {
    id: 'r2',
    nome: 'Pasticceria',
    colore: '#ff9f43',
    icona: 'cake',
    iva: 10,
    minimoImporto: 0,
    massimoImporto: 100,
    abilitato: true,
    ordine: 2,
    sottoreparti: [
      {
        id: 'sr3',
        nome: 'Cornetto',
        prezzoFisso: 130,
        ivaOverride: null,
        minimoImporto: 0,
        massimoImporto: 100,
        abilitato: true,
        ordine: 1,
      },
    ],
  },
]

export function getReparti() {
  try {
    if (typeof window === "undefined") return DEFAULT_REPARTI
    const raw = localStorage.getItem(KEY_REPARTI)
    if (!raw) return DEFAULT_REPARTI
    return JSON.parse(raw)
  } catch {
    return DEFAULT_REPARTI
  }
}

export function saveReparti(reparti) {
  try {
    if (typeof window === "undefined") return false
    localStorage.setItem(KEY_REPARTI, JSON.stringify(reparti))
    return true
  } catch {
    return false
  }
}

export function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
}

// Formatta centesimi in stringa euro: 120 → "1,20"
export function formatEuro(centesimi) {
  if (!centesimi && centesimi !== 0) return '—'
  return (centesimi / 100).toFixed(2).replace('.', ',')
}

// Converte stringa euro in centesimi: "1,20" → 120
export function parseEuro(str) {
  if (!str) return 0
  const clean = str.replace(',', '.').replace(/[^\d.]/g, '')
  return Math.round(parseFloat(clean) * 100) || 0
}

// ─── IMPOSTAZIONI NEGOZIO ─────────────────────────────────────────────────
const KEY_NEGOZIO = 'sd_negozio'

const DEFAULT_NEGOZIO = {
  ragioneSociale: '',
  indirizzo: '',
  partitaIva: '',
  telefono: '',
  sitoWeb: '',
  numeroRt: '',
}

export function getNegozio() {
  try {
    if (typeof window === "undefined") return DEFAULT_NEGOZIO
    const raw = localStorage.getItem(KEY_NEGOZIO)
    if (!raw) return DEFAULT_NEGOZIO
    return { ...DEFAULT_NEGOZIO, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_NEGOZIO
  }
}

export function saveNegozio(data) {
  try {
    if (typeof window === "undefined") return false
    localStorage.setItem(KEY_NEGOZIO, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

// ─── CONTATORI GIORNALIERI ────────────────────────────────────────────────
const KEY_CONTATORI = 'sd_contatori'

export function getContatori() {
  try {
    if (typeof window === "undefined") return { data: new Date().toDateString(), scontrini: 0, chiusure: 0 }
    const raw = localStorage.getItem(KEY_CONTATORI)
    const oggi = new Date().toDateString()
    if (!raw) return { data: oggi, scontrini: 0, chiusure: 0 }
    const c = JSON.parse(raw)
    // reset se nuovo giorno
    if (c.data !== oggi) return { data: oggi, scontrini: 0, chiusure: 0 }
    return c
  } catch {
    return { data: new Date().toDateString(), scontrini: 0, chiusure: 0 }
  }
}

export function incrementaScontrino() {
  const c = getContatori()
  const updated = { ...c, scontrini: c.scontrini + 1 }
  if (typeof window !== "undefined") localStorage.setItem(KEY_CONTATORI, JSON.stringify(updated))
  return updated
}

export function incrementaChiusura() {
  const c = getContatori()
  const updated = { ...c, chiusure: c.chiusure + 1 }
  if (typeof window !== "undefined") localStorage.setItem(KEY_CONTATORI, JSON.stringify(updated))
  return updated
}

// ─── UTENTI ───────────────────────────────────────────────────────────────
const KEY_UTENTI = 'sd_utenti'

const DEFAULT_UTENTI = [
  { id: 'owner', nome: 'Titolare', pin: '1234', ruolo: 'owner', abilitato: true },
  { id: 'staff1', nome: 'Cassiere 1', pin: '0000', ruolo: 'staff', abilitato: true },
  { id: 'staff2', nome: 'Cassiere 2', pin: '1111', ruolo: 'staff', abilitato: true },
]

export function getUtenti() {
  if (typeof window === 'undefined') return DEFAULT_UTENTI
  try {
    const raw = localStorage.getItem(KEY_UTENTI)
    if (!raw) return DEFAULT_UTENTI
    return JSON.parse(raw)
  } catch {
    return DEFAULT_UTENTI
  }
}

export function saveUtenti(utenti) {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(KEY_UTENTI, JSON.stringify(utenti))
    return true
  } catch {
    return false
  }
}

// ─── STORICO SCONTRINI ────────────────────────────────────────────────────
const KEY_STORICO = 'sd_storico'

export function getStorico() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY_STORICO)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

export function salvaScontrino(scontrino) {
  if (typeof window === 'undefined') return
  try {
    const storico = getStorico()
    storico.unshift(scontrino) // più recente prima
    // max 1000 scontrini in localStorage
    if (storico.length > 1000) storico.pop()
    localStorage.setItem(KEY_STORICO, JSON.stringify(storico))
  } catch {}
}

// ─── CHIUSURE FISCALI ─────────────────────────────────────────────────────
const KEY_CHIUSURE = 'sd_chiusure'

export function getChiusure() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY_CHIUSURE)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

export function salvaChiusura(chiusura) {
  if (typeof window === 'undefined') return
  try {
    const chiusure = getChiusure()
    chiusure.unshift(chiusura)
    localStorage.setItem(KEY_CHIUSURE, JSON.stringify(chiusure))
  } catch {}
}
