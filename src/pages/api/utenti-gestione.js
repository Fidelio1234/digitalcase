import { COOKIE_TECH, tokenValido } from '@/lib/techSession'
import {
  supabaseAdmin, negozioDaSlug, leggiSessione, utenteDaSessione,
  hashPin, verificaPin, pinFormatoValido,
} from '@/lib/serverAuth'

const RUOLI = ['owner', 'staff']
const CAMPI = 'id, nome, ruolo, abilitato, created_at'

// Autorizzato: area tecnica (cookie tecnico) oppure titolare con sessione valida
async function autorizza(req, slug) {
  if (tokenValido(req.cookies?.[COOKIE_TECH])) {
    const n = await negozioDaSlug(slug)
    return n ? { negozioId: n.id } : null
  }
  if (!leggiSessione(req)) return null
  const u = await utenteDaSessione(req)
  if (!u || u.ruolo !== 'owner') return null
  return { negozioId: u.negozio_id }
}

async function elenco(db, negozioId) {
  const { data } = await db.from('utenti').select(CAMPI).eq('negozio_id', negozioId).order('created_at')
  return [...(data || [])].sort((a, b) =>
    a.ruolo === 'owner' ? -1 : b.ruolo === 'owner' ? 1 : a.nome.localeCompare(b.nome))
}

async function pinGiaUsato(db, negozioId, pin, escludiId) {
  const { data } = await db.from('utenti').select('id, nome, pin_hash').eq('negozio_id', negozioId)
  for (const u of data || []) {
    if (u.id === escludiId || !u.pin_hash) continue
    if (await verificaPin(pin, u.pin_hash)) return u.nome
  }
  return null
}

function titolariAbilitati(lista, escludiId) {
  return lista.filter(u => u.ruolo === 'owner' && u.abilitato && u.id !== escludiId).length
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })

  try {
    const { azione, slug, id, nome, ruolo, pin, abilitato } = req.body || {}
    const auth = await autorizza(req, slug)
    if (!auth) return res.status(401).json({ error: 'Non autorizzato' })

    const db = supabaseAdmin()
    const negozioId = auth.negozioId

    if (azione === 'lista') {
      return res.status(200).json({ ok: true, utenti: await elenco(db, negozioId) })
    }

    if (azione === 'salva') {
      const lista = await elenco(db, negozioId)
      const esistente = id ? lista.find(u => u.id === id) : null
      if (id && !esistente) return res.status(404).json({ error: 'Utente non trovato' })

      const nomePulito = nome === undefined ? undefined : String(nome).trim()
      if (!esistente && !nomePulito) return res.status(400).json({ error: 'Inserisci il nome' })
      if (nomePulito !== undefined && (nomePulito.length < 1 || nomePulito.length > 40)) {
        return res.status(400).json({ error: 'Nome non valido' })
      }
      if (ruolo !== undefined && !RUOLI.includes(ruolo)) return res.status(400).json({ error: 'Ruolo non valido' })

      const pinPresente = pin !== undefined && pin !== null && pin !== ''
      if (!esistente && !pinPresente) return res.status(400).json({ error: 'Inserisci il PIN' })
      if (pinPresente && !pinFormatoValido(pin)) {
        return res.status(400).json({ error: 'Il PIN deve essere di 8 cifre' })
      }

      const ruoloFinale = ruolo ?? esistente?.ruolo ?? 'staff'
      const abilitatoFinale = abilitato ?? esistente?.abilitato ?? true
      if (esistente && esistente.ruolo === 'owner' && (ruoloFinale !== 'owner' || !abilitatoFinale)
          && titolariAbilitati(lista, esistente.id) < 1) {
        return res.status(400).json({ error: 'Deve esserci almeno un titolare attivo' })
      }

      if (pinPresente) {
        const doppio = await pinGiaUsato(db, negozioId, pin, esistente?.id)
        if (doppio) return res.status(400).json({ error: `PIN già usato da ${doppio}` })
      }

      const campi = {}
      if (nomePulito !== undefined) campi.nome = nomePulito
      campi.ruolo = ruoloFinale
      campi.abilitato = abilitatoFinale
      if (pinPresente) {
        campi.pin_hash = await hashPin(pin)
        campi.tentativi_falliti = 0
        campi.bloccato_fino = null
      }

      const q = esistente
        ? db.from('utenti').update(campi).eq('id', esistente.id).eq('negozio_id', negozioId)
        : db.from('utenti').insert({ ...campi, negozio_id: negozioId })
      const { error } = await q
      if (error) return res.status(500).json({ error: 'Errore salvataggio' })
      return res.status(200).json({ ok: true, utenti: await elenco(db, negozioId) })
    }

    if (azione === 'abilita') {
      const lista = await elenco(db, negozioId)
      const u = lista.find(x => x.id === id)
      if (!u) return res.status(404).json({ error: 'Utente non trovato' })
      if (u.ruolo === 'owner' && u.abilitato && titolariAbilitati(lista, u.id) < 1) {
        return res.status(400).json({ error: 'Deve esserci almeno un titolare attivo' })
      }
      const { error } = await db.from('utenti').update({ abilitato: !u.abilitato })
        .eq('id', u.id).eq('negozio_id', negozioId)
      if (error) return res.status(500).json({ error: 'Errore salvataggio' })
      return res.status(200).json({ ok: true, utenti: await elenco(db, negozioId) })
    }

    if (azione === 'elimina') {
      const lista = await elenco(db, negozioId)
      const u = lista.find(x => x.id === id)
      if (!u) return res.status(404).json({ error: 'Utente non trovato' })
      if (u.ruolo === 'owner' && titolariAbilitati(lista, u.id) < 1) {
        return res.status(400).json({ error: 'Deve esserci almeno un titolare attivo' })
      }
      const { error } = await db.from('utenti').delete().eq('id', u.id).eq('negozio_id', negozioId)
      if (error) return res.status(500).json({ error: 'Errore eliminazione' })
      return res.status(200).json({ ok: true, utenti: await elenco(db, negozioId) })
    }

    return res.status(400).json({ error: 'Azione non valida' })
  } catch (e) {
    console.error('api/utenti-gestione:', e.message)
    return res.status(500).json({ error: 'Errore del server' })
  }
}
