import {
    supabaseAdmin, negozioDaSlug, verificaPin, pinFormatoValido, creaToken, cookieSessione,
    limiteIp, MAX_TENTATIVI, BLOCCO_SECONDI,
  } from '@/lib/serverAuth'
  
  export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'Metodo non consentito' })
  
    try {
      if (!limiteIp(req)) {
        return res.status(429).json({ ok: false, reason: 'Troppi tentativi, riprova tra qualche minuto' })
      }
  
      const { slug, userId, pin } = req.body || {}
      if (typeof userId !== 'string' || !pinFormatoValido(pin)) {
        return res.status(401).json({ ok: false, reason: 'PIN errato' })
      }
  
      const negozio = await negozioDaSlug(slug)
      if (!negozio) return res.status(401).json({ ok: false, reason: 'PIN errato' })
  
      const db = supabaseAdmin()
      const { data: u } = await db
        .from('utenti')
        .select('id, nome, ruolo, abilitato, pin_hash, tentativi_falliti, bloccato_fino')
        .eq('id', userId)
        .eq('negozio_id', negozio.id)
        .maybeSingle()
  
      if (!u || !u.abilitato) return res.status(401).json({ ok: false, reason: 'PIN errato' })
  
      if (u.bloccato_fino && new Date(u.bloccato_fino).getTime() > Date.now()) {
        const resto = Math.ceil((new Date(u.bloccato_fino).getTime() - Date.now()) / 1000)
        return res.status(429).json({ ok: false, reason: `Utente bloccato — riprova tra ${resto}s` })
      }
  
      const corretto = await verificaPin(pin, u.pin_hash)
  
      if (!corretto) {
        const n = (u.tentativi_falliti || 0) + 1
        if (n >= MAX_TENTATIVI) {
          await db.from('utenti').update({
            tentativi_falliti: 0,
            bloccato_fino: new Date(Date.now() + BLOCCO_SECONDI * 1000).toISOString(),
          }).eq('id', u.id)
          return res.status(429).json({ ok: false, reason: `Troppi tentativi — riprova tra ${BLOCCO_SECONDI}s` })
        }
        await db.from('utenti').update({ tentativi_falliti: n }).eq('id', u.id)
        return res.status(401).json({ ok: false, reason: 'PIN errato' })
      }
  
      if (u.tentativi_falliti || u.bloccato_fino) {
        await db.from('utenti').update({ tentativi_falliti: 0, bloccato_fino: null }).eq('id', u.id)
      }
  
      res.setHeader('Set-Cookie', cookieSessione(creaToken({ uid: u.id, nid: negozio.id, role: u.ruolo })))
      return res.status(200).json({
        ok: true,
        user: { id: u.id, name: u.nome, role: u.ruolo, initials: u.nome.substring(0, 2).toUpperCase() },
      })
    } catch (e) {
      console.error('api/login:', e.message)
      return res.status(500).json({ ok: false, reason: 'Errore del server' })
    }
  }
  