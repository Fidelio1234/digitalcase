import {
  supabaseAdmin, utenteDaSessione, verificaPin, pinFormatoValido,
  limiteIp, MAX_TENTATIVI, BLOCCO_SECONDI,
} from '@/lib/serverAuth'

// Verifica il PIN del titolare già loggato (cookie di sessione). Il PIN non resta mai nel browser.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'Metodo non consentito' })

  try {
    if (!limiteIp(req)) {
      return res.status(429).json({ ok: false, reason: 'Troppi tentativi, riprova tra qualche minuto' })
    }

    const sess = await utenteDaSessione(req)
    if (!sess || sess.ruolo !== 'owner') {
      return res.status(401).json({ ok: false, reason: 'Non autorizzato' })
    }

    const { pin } = req.body || {}
    if (!pinFormatoValido(pin)) {
      return res.status(401).json({ ok: false, reason: 'PIN errato' })
    }

    const db = supabaseAdmin()
    const { data: u } = await db
      .from('utenti')
      .select('id, pin_hash, tentativi_falliti, bloccato_fino')
      .eq('id', sess.id)
      .eq('negozio_id', sess.negozio_id)
      .maybeSingle()
    if (!u) return res.status(401).json({ ok: false, reason: 'Non autorizzato' })

    if (u.bloccato_fino && new Date(u.bloccato_fino).getTime() > Date.now()) {
      const resto = Math.ceil((new Date(u.bloccato_fino).getTime() - Date.now()) / 1000)
      return res.status(429).json({ ok: false, reason: `Bloccato, riprova tra ${resto}s` })
    }

    const corretto = await verificaPin(pin, u.pin_hash)
    if (!corretto) {
      const n = (u.tentativi_falliti || 0) + 1
      if (n >= MAX_TENTATIVI) {
        await db.from('utenti').update({
          tentativi_falliti: 0,
          bloccato_fino: new Date(Date.now() + BLOCCO_SECONDI * 1000).toISOString(),
        }).eq('id', u.id)
        return res.status(429).json({ ok: false, reason: `Troppi tentativi, riprova tra ${BLOCCO_SECONDI}s` })
      }
      await db.from('utenti').update({ tentativi_falliti: n }).eq('id', u.id)
      return res.status(401).json({ ok: false, reason: 'PIN errato' })
    }

    if (u.tentativi_falliti || u.bloccato_fino) {
      await db.from('utenti').update({ tentativi_falliti: 0, bloccato_fino: null }).eq('id', u.id)
    }
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('verifica-pin-titolare', e?.message)
    return res.status(500).json({ ok: false, reason: 'Errore del server' })
  }
}
