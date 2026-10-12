// Converte i PIN in chiaro (colonna "pin") in hash (colonna "pin_hash").
// Uso, dalla cartella principale del progetto:  node scripts/migra-pin.mjs
// Legge NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY da .env.local. Non stampa mai i PIN.
import fs from 'fs'
import crypto from 'crypto'
import { promisify } from 'util'
import { createClient } from '@supabase/supabase-js'

const scrypt = promisify(crypto.scrypt)

for (const riga of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) { console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY in .env.local'); process.exit(1) }

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function hashPin(pin) {
  const salt = crypto.randomBytes(16)
  const k = await scrypt(pin, salt, 64)
  return `s1$${salt.toString('hex')}$${k.toString('hex')}`
}

const { data, error } = await db.from('utenti').select('id, nome, negozio_id, pin, pin_hash')
if (error) { console.error('Errore lettura:', error.message); process.exit(1) }

let fatti = 0, saltati = 0
const daCorreggere = []
for (const u of data) {
  if (u.pin_hash) { saltati++; continue }
  if (!u.pin) { daCorreggere.push(`${u.nome} (nessun PIN)`); continue }
  if (!/^\d{8}$/.test(String(u.pin))) { daCorreggere.push(`${u.nome} (PIN non di 8 cifre)`); continue }
  const { error: e2 } = await db.from('utenti').update({ pin_hash: await hashPin(String(u.pin)) }).eq('id', u.id)
  if (e2) { console.error('Errore su', u.nome, e2.message); continue }
  fatti++
}
console.log(`Convertiti: ${fatti} — già pronti: ${saltati}`)
if (daCorreggere.length) {
  console.log('ATTENZIONE: questi utenti NON potranno entrare finché non imposti un PIN di 8 cifre dalla gestione utenti:')
  daCorreggere.forEach(x => console.log(' -', x))
}
