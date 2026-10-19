import crypto from 'crypto'
import { COOKIE_TECH, tokenValido } from '@/lib/techSession'
import { supabaseAdmin, negozioDaSlug } from '@/lib/serverAuth'
import { hashCodice } from '@/lib/palmare'

// Niente 0 O 1 I L: si leggono male sul telefono
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const VALIDITA_MS = 10 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function nuovoCodice() {
  let c = ''
  for (let i = 0; i < 8; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)]
  return c
}

async function stato(db, negozioId) {
  const { data: lic } = await db.from('palmari_licenza').select('max_palmari').eq('negozio_id', negozioId).maybeSingle()
  const { data: lista } = await db.from('palmari')
    .select('id, nome, attivo, creato_il, ultimo_accesso').eq('negozio_id', negozioId).order('creato_il')
  return { max: lic?.max_palmari ?? 0, palmari: lista || [] }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
  try {
    if (!tokenValido(req.cookies?.[COOKIE_TECH])) return res.status(401).json({ error: 'Non autorizzato' })
    const { azione, slug } = req.body || {}
    const n = await negozioDaSlug(slug)
    if (!n) return res.status(404).json({ error: 'Negozio non trovato' })
    const db = supabaseAdmin()

    if (azione === 'stato') {
      return res.status(200).json(await stato(db, n.id))
    }

    if (azione === 'imposta_max') {
      const max = Number.parseInt(req.body.max, 10)
      if (!Number.isInteger(max) || max < 0 || max > 20) return res.status(400).json({ error: 'Valore non valido' })
      const { error } = await db.from('palmari_licenza').upsert({ negozio_id: n.id, max_palmari: max }, { onConflict: 'negozio_id' })
      if (error) throw error
      return res.status(200).json(await stato(db, n.id))
    }

    if (azione === 'genera_codice') {
      const st = await stato(db, n.id)
      const attivi = st.palmari.filter(p => p.attivo).length
      if (attivi >= st.max) {
        return res.status(409).json({ error: 'Licenza esaurita: disattiva un palmare o aumenta il massimo' })
      }
      // un solo codice valido alla volta per negozio
      await db.from('palmari_codici').delete().eq('negozio_id', n.id).is('usato_il', null)
      const codice = nuovoCodice()
      const scade = new Date(Date.now() + VALIDITA_MS).toISOString()
      const { error } = await db.from('palmari_codici').insert({ codice_hash: hashCodice(codice), negozio_id: n.id, scade_il: scade })
      if (error) throw error
      return res.status(200).json({ codice, scade_il: scade, ...(await stato(db, n.id)) })
    }

    if (azione === 'disattiva') {
      const id = req.body.id
      if (typeof id !== 'string' || !UUID.test(id)) return res.status(400).json({ error: 'Palmare non valido' })
      const { error } = await db.from('palmari').update({ attivo: false }).eq('id', id).eq('negozio_id', n.id)
      if (error) throw error
      return res.status(200).json(await stato(db, n.id))
    }

    return res.status(400).json({ error: 'Azione non valida' })
  } catch (e) {
    console.error('palmare-gestione:', e.message)
    return res.status(500).json({ error: 'Errore del server' })
  }
}