/**
 * /api/ditron.js — API Next.js per comunicazione con Ditron RT
 * Protocollo: WEC Streaming via HTTP POST su /cmd/wec
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' })
  }

  const { ip, porta = 1471, azione, dati } = req.body

  if (!ip) {
    return res.status(400).json({ error: 'IP cassa mancante' })
  }

  try {
    let comando = ''

    switch (azione) {
      case 'scontrino': {
        const { righe, metodo, totale, contatto } = dati
        const lines = []
        if (contatto) lines.push(`cfis cf='${contatto}'`)
        for (const riga of righe) {
          const rep = riga.numeroRepartoRt || 1
          const prezzo = (riga.importo / 100).toFixed(2)
          const qty = riga.quantita || 1
          const des = (riga.nome || '').substring(0, 24).replace(/'/g, ' ')
          if (qty > 1) lines.push(`vend rep=${rep}, pre=${prezzo}, qty=${qty}, des='${des}'`)
          else lines.push(`vend rep=${rep}, pre=${prezzo}, des='${des}'`)
        }
        const totEuro = (totale / 100).toFixed(2)
        if (metodo === 'contanti') lines.push(`chius t=1, imp=${totEuro}`)
        else lines.push(`chius t=5, imp=${totEuro}`)
        comando = lines.join('\n')
        break
      }
      case 'chiusura_fiscale':
        comando = `azzgio tipo=${dati?.tipo || 1}`
        break
      case 'lettura_x':
        comando = `report num=${dati?.tipo || 2}`
        break
      case 'annullo': {
        const { matricola, numeroAzzeramento, numeroDocumento, data } = dati
        comando = `docannullo mat='${matricola}', nazz=${numeroAzzeramento}, ndoc=${numeroDocumento}, data=${data}`
        break
      }
      case 'ristampa': {
        const { dataInizio, dataFine, dalNumero = 0, alNumero = 0 } = dati
        comando = `dgfe tipo=160, datada=${dataInizio}, dataa=${dataFine}, nda=${dalNumero}, na=${alNumero}`
        break
      }
      case 'ping':
        comando = `report num=2`
        break
      default:
        return res.status(400).json({ error: `Azione non riconosciuta: ${azione}` })
    }

    // Invia via HTTP POST al Ditron WEC
    const url = `http://${ip}:${porta}/cmd/wec`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: comando,
      signal: AbortSignal.timeout(8000)
    })

    const testo = await response.text()
    return res.json({ ok: true, risposta: testo || 'OK', comando })

  } catch (err) {
    console.error('Errore Ditron:', err.message)
    let messaggio = err.message
    if (err.message.includes('ECONNREFUSED')) messaggio = 'Cassa non raggiungibile — verifica che sia accesa e connessa alla rete'
    else if (err.message.includes('timeout') || err.message.includes('Timeout')) messaggio = 'Timeout — la cassa non risponde'
    else if (err.message.includes('ENOTFOUND')) messaggio = 'IP cassa non trovato sulla rete'
    return res.status(200).json({ ok: false, error: messaggio })
  }
}
