export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })

  const { ip, porta = 80, comandi } = req.body

  if (!ip) return res.status(400).json({ error: 'IP cassa mancante' })
  if (!comandi?.length) return res.status(400).json({ error: 'Nessun comando' })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Service>\n${comandi.map(c => `  <cmd>${c}</cmd>`).join('\n')}\n</Service>`

  try {
    const response = await fetch(`http://${ip}:${porta}/service.cgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(xml) },
      body: xml,
      signal: AbortSignal.timeout(10000)
    })

    const testo = await response.text()

    // Parsa risposta XML
    const errorCode = testo.match(/<errorCode>(\d+)<\/errorCode>/)?.[1] || '0'
    const busy = testo.match(/<busy>(\d+)<\/busy>/)?.[1] || '0'
    const lastCmd = testo.match(/<lastCmd>(\d+)<\/lastCmd>/)?.[1] || '0'

    if (busy === '1') return res.json({ ok: false, error: 'Cassa occupata, riprovare' })
    if (errorCode !== '0') return res.json({ ok: false, error: `Errore cassa E${errorCode}`, errorCode })

    return res.json({ ok: true, lastCmd: parseInt(lastCmd) })
  } catch (err) {
    console.error('Errore RCH:', err.message)
    return res.status(200).json({ ok: false, error: err.message })
  }
}
