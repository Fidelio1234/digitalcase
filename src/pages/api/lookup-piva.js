function parseIndirizzoIT(address) {
    if (!address) return {}
    const full = address.split('\n').map(r => r.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const m = full.match(/^(.*?)\s*(\d{5})\s+(.+?)\s+([A-Za-z]{2})\.?$/)
    if (m) {
      return {
        indirizzo: m[1].replace(/,\s*$/, '').trim(),
        cap: m[2],
        comune: m[3].trim(),
        provincia: m[4].toUpperCase(),
      }
    }
    return { indirizzo: full }
  }
  
  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
    const piva = String(req.body?.partitaIva || '').replace(/\D/g, '')
    if (piva.length !== 11) return res.status(400).json({ error: 'La P.IVA deve avere 11 cifre' })
    try {
      const r = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode: 'IT', vatNumber: piva }),
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) return res.status(502).json({ error: 'Servizio VIES non raggiungibile, riprova' })
      const data = await r.json()
      if (!data.valid) return res.status(404).json({ error: 'P.IVA non iscritta al VIES — Inseriscila a Mano' })
      const nome = (data.name && data.name !== '---') ? data.name.trim() : ''
      const indir = parseIndirizzoIT((data.address && data.address !== '---') ? data.address : '')
      return res.status(200).json({ valid: true, denominazione: nome, ...indir })
    } catch (e) {
      return res.status(504).json({ error: 'Timeout nella verifica P.IVA' })
    }
  }