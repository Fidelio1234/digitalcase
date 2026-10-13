// Crea il primo titolare (owner) di un negozio già inserito nella tabella "negozi".
// Uso, dalla cartella principale del progetto:
//   node scripts/crea-titolare.mjs <slug> [NOME]
// Esempio: node scripts/crea-titolare.mjs barcentrale TITOLARE
// Il PIN viene chiesto a video (nascosto) e salvato solo come hash. Non viene mai stampato.
import fs from 'fs'
import crypto from 'crypto'
import readline from 'readline'
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

const slug = (process.argv[2] || '').trim().toLowerCase()
const nome = (process.argv[3] || 'TITOLARE').trim()
if (!/^[a-z0-9-]{1,40}$/.test(slug)) { console.error('Uso: node scripts/crea-titolare.mjs <slug> [NOME]'); process.exit(1) }

function chiediNascosto(domanda) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = s => { if (s.includes(domanda)) process.stdout.write(s); else if (s === '\r\n' || s === '\n') process.stdout.write(s) }
    rl.question(domanda, risposta => { rl.close(); resolve(risposta.trim()) })
  })
}

function pinDebole(pin) {
  if (/^(\d)\1{7}$/.test(pin)) return true
  const cifre = [...pin].map(Number)
  const crescente = cifre.every((c, i) => i === 0 || c === cifre[i - 1] + 1)
  const decrescente = cifre.every((c, i) => i === 0 || c === cifre[i - 1] - 1)
  return crescente || decrescente
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(16)
  const k = await scrypt(pin, salt, 64)
  return `s1$${salt.toString('hex')}$${k.toString('hex')}`
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: negozio, error: e1 } = await db.from('negozi').select('id, slug').eq('slug', slug).maybeSingle()
if (e1 || !negozio) { console.error(`Negozio con slug "${slug}" non trovato. Inseriscilo prima nella tabella negozi.`); process.exit(1) }

const { data: esistenti } = await db.from('utenti').select('id, nome, ruolo').eq('negozio_id', negozio.id)
if (esistenti?.length) {
  console.log(`Attenzione: questo negozio ha già ${esistenti.length} utente/i: ${esistenti.map(u => `${u.nome} (${u.ruolo})`).join(', ')}`)
  const conferma = await chiediNascosto('Aggiungere comunque un nuovo titolare? (scrivi si): ')
  if (conferma.toLowerCase() !== 'si') { console.log('Annullato.'); process.exit(0) }
}

const pin = await chiediNascosto('PIN del titolare (8 cifre): ')
if (!/^\d{8}$/.test(pin)) { console.error('Il PIN deve essere di 8 cifre.'); process.exit(1) }
if (pinDebole(pin)) { console.error('PIN troppo semplice (cifre uguali o in sequenza). Scegline un altro.'); process.exit(1) }
const conferma = await chiediNascosto('Ripeti il PIN: ')
if (pin !== conferma) { console.error('I PIN non coincidono.'); process.exit(1) }

const { error: e2 } = await db.from('utenti').insert({
  negozio_id: negozio.id, nome, ruolo: 'owner', abilitato: true, pin_hash: await hashPin(pin),
})
if (e2) { console.error('Errore salvataggio:', e2.message); process.exit(1) }
console.log(`✓ Titolare "${nome}" creato per il negozio "${slug}".`)
