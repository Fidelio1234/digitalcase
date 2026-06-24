/*const net = require('net')

async function inviaTCP3i(ip, porta, comandi) {
  // Per 3i mandiamo comandi separati con pausa
  let rispostaFinale = ''
  for (const cmd of comandi) {
    const risposta = await new Promise((resolve, reject) => {
      const client = new net.Socket()
      let risposta = ''
      client.setTimeout(3000)
      client.connect(parseInt(porta), ip, () => {
        client.write(cmd + '\r')
      })
      client.on('data', d => risposta += d.toString())
      client.on('end', () => { client.destroy(); resolve(risposta || 'OK') })
      client.on('close', () => { client.destroy(); resolve(risposta || 'OK') })
      client.on('error', err => {
        client.destroy()
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') resolve(risposta || 'OK')
        else reject(err)
      })
      client.on('timeout', () => { client.destroy(); resolve(risposta || 'OK') })
    })
    rispostaFinale = risposta
    await new Promise(r => setTimeout(r, 200))
  }
  return rispostaFinale
}

async function inviaTCP(ip, porta, comando, marca = 'ditron') {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let risposta = ''

    client.setTimeout(8000)

    client.connect(parseInt(porta), ip, () => {
      const terminatore = marca === '3i' ? '\r' : '\r\n'
      client.write(comando + terminatore)
    })

    client.on('data', (data) => {
      risposta += data.toString()
    })

    client.on('end', () => {
      client.destroy()
      resolve(risposta || 'OK')
    })

    client.on('close', () => {
      client.destroy()
      resolve(risposta || 'OK')
    })

    client.on('timeout', () => {
      client.destroy()
      reject(new Error('Timeout cassa'))
    })

    client.on('error', (err) => {
      client.destroy()
      // ECONNRESET è normale per casse 3i che chiudono dopo la risposta
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        resolve(risposta || 'OK')
      } else {
        reject(err)
      }
    })

    // Chiudi dopo 2 secondi se non arriva end
    setTimeout(() => {
      if (risposta) {
        client.destroy()
        resolve(risposta)
      }
    }, 2000)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })

  const { ip, porta = 1471, azione, dati, marca = 'ditron', modalita = 'MF' } = req.body
  if (!ip) return res.status(400).json({ error: 'IP mancante' })

  try {
    let comando = ''

    switch (azione) {
      case 'ping':
        comando = marca === '3i' ? 'K' : 'report num=2'
        break
      case 'lettura_x':
        comando = marca === '3i' ? '1F' : 'report num=2'
        break
      case 'chiusura_fiscale':
        comando = marca === '3i' ? '9F' : `azzgio tipo=${dati?.tipo || 1}`
        break
      case 'scontrino': {
        const lines = []
        if (dati.contatto) lines.push(`cfis cf='${dati.contatto}'`)
        for (const riga of (dati.righe || [])) {
          const rep = riga.numeroRepartoRt || 1
          const prezzo = (riga.importo / 100).toFixed(2)
          const qty = riga.quantita || 1
          const des = (riga.nome || '').substring(0, 24).replace(/'/g, ' ')
          if (qty > 1) lines.push(`vend rep=${rep}, pre=${prezzo}, qty=${qty}, des='${des}'`)
          else lines.push(`vend rep=${rep}, pre=${prezzo}, des='${des}'`)
        }
        const tot = (dati.totale / 100).toFixed(2)
        lines.push(dati.metodo === 'contanti' ? `chius t=1, imp=${tot}` : `chius t=5, imp=${tot}`)
        comando = lines.join('\n')
        break
      }
      case 'annullo':
  if (marca === '3i') {
    const nazz = String(dati.numeroAzzeramento).padStart(4, '0')
    const ndoc = String(dati.numeroDocumento).padStart(4, '0')
    comando = `"${nazz}-${ndoc}"52F`
  } else {
    comando = `docannullo mat='${dati.matricola}', nazz=${dati.numeroAzzeramento}, ndoc=${dati.numeroDocumento}, data=${dati.data}`
  }
  break
      case 'ristampa':
        if (marca === '3i') {
          // Formato 3i: "aammggNNNNNNNNNN"15F
          // dataInizio/dataFine formato gg/mm/aaaa -> aammgg
          const fmtData3i = (d) => {
            if (!d) return '000000'
            // Arriva già come DDMMYY (6 chars) dal pannello
            if (d.length === 6) return d.slice(4,6) + d.slice(2,4) + d.slice(0,2) // DDMMYY -> YYMMDD
            const parts = d.split('/')
            if (parts.length === 3) return parts[2].slice(2) + parts[1] + parts[0]
            return d.replace(/-/g, '').slice(2)
          }
          const d1 = fmtData3i(dati.dataInizio)
          const d2 = fmtData3i(dati.dataFine)
          const n1 = String(dati.dalNumero || 1).padStart(5, '0')
          const n2 = String(dati.alNumero || 1).padStart(5, '0')
          comando = `"${d1}${n1}${n2}"15F`
          console.log('3i ristampa comando:', comando, 'lunghezza descrittore:', (d1+n1+n2).length)
        } else {
          comando = `dgfe tipo=160, datada=${dati.dataInizio}, dataa=${dati.dataFine}, nda=${dati.dalNumero}, na=${dati.alNumero}`
        }
        break
      default:
      case 'raw': {
        // Comando grezzo per 3i XON/XOFF
        const cmd = dati?.cmd || ''
        if (!cmd) return res.status(400).json({ error: 'Comando raw mancante' })
        const risposta = await inviaTCP(ip, porta, cmd, marca)
        return res.json({ ok: true, risposta })
      }
        return res.status(400).json({ error: `Azione non riconosciuta: ${azione}` })
    }

    // Per 3i RT chiusura usa comandi separati
    let risposta
    if (marca === '3i' && (azione === 'chiusura_fiscale' || azione === 'lettura_x')) {
      const cmds = azione === 'chiusura_fiscale' 
        ? (modalita === 'RT' ? ['z', '1F', 'c'] : ['z', '1F', 'c'])
        : ['x', '1F', 'c']
      risposta = await inviaTCP3i(ip, porta, cmds)
    } else {
      console.log('Ditron comando inviato:', JSON.stringify(comando))
      risposta = await inviaTCP(ip, porta, comando, marca)
    }
    return res.json({ ok: true, risposta, comando })

  } catch (err) {
    console.error('Errore Ditron:', err.message)
    let msg = err.message
    if (err.message.includes('ECONNREFUSED')) msg = 'Cassa non raggiungibile'
    else if (err.message.includes('ETIMEDOUT') || err.message.includes('Timeout')) msg = 'Timeout — la cassa non risponde'
    return res.status(200).json({ ok: false, error: msg })
  }
}
*/


const net = require('net')

async function inviaTCP3i(ip, porta, comandi) {
  let rispostaFinale = ''
  for (const cmd of comandi) {
    const risposta = await new Promise((resolve, reject) => {
      const client = new net.Socket()
      let risposta = ''
      client.setTimeout(3000)
      client.connect(parseInt(porta), ip, () => {
        client.write(cmd + '\r')
      })
      client.on('data', d => risposta += d.toString())
      client.on('end', () => { client.destroy(); resolve(risposta || 'OK') })
      client.on('close', () => { client.destroy(); resolve(risposta || 'OK') })
      client.on('error', err => {
        client.destroy()
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') resolve(risposta || 'OK')
        else reject(err)
      })
      client.on('timeout', () => { client.destroy(); resolve(risposta || 'OK') })
    })
    rispostaFinale = risposta
    await new Promise(r => setTimeout(r, 200))
  }
  return rispostaFinale
}

async function inviaTCPDitron(ip, porta, righe) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let risposta = ''
    client.setTimeout(10000)
    client.connect(parseInt(porta), ip, async () => {
      for (const cmd of righe) {
        client.write(cmd + '\r\n')
        await new Promise(r => setTimeout(r, 200))
      }
    })
    client.on('data', d => risposta += d.toString())
    client.on('end', () => { client.destroy(); resolve(risposta || 'OK') })
    client.on('close', () => { client.destroy(); resolve(risposta || 'OK') })
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout cassa')) })
    client.on('error', err => {
      client.destroy()
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') resolve(risposta || 'OK')
      else reject(err)
    })
    setTimeout(() => { if (risposta) { client.destroy(); resolve(risposta) } }, 5000)
  })
}

async function inviaTCP(ip, porta, comando, marca = 'ditron') {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let risposta = ''
    client.setTimeout(8000)
    client.connect(parseInt(porta), ip, () => {
      const terminatore = marca === '3i' ? '\r' : '\r\n'
      client.write(comando + terminatore)
    })
    client.on('data', (data) => { risposta += data.toString() })
    client.on('end', () => { client.destroy(); resolve(risposta || 'OK') })
    client.on('close', () => { client.destroy(); resolve(risposta || 'OK') })
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout cassa')) })
    client.on('error', (err) => {
      client.destroy()
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        resolve(risposta || 'OK')
      } else {
        reject(err)
      }
    })
    setTimeout(() => {
      if (risposta) { client.destroy(); resolve(risposta) }
    }, 2000)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })

  const { ip, porta = 1471, azione, dati, marca = 'ditron', modalita = 'MF' } = req.body
  if (!ip) return res.status(400).json({ error: 'IP mancante' })

  try {
    let comando = ''
    let comandoArray = null

    switch (azione) {
      case 'ping':
        comando = marca === '3i' ? 'K' : 'report num=0'
        break
      case 'lettura_x':
        comando = marca === '3i' ? '1F' : 'report num=2'
        break
      case 'chiusura_fiscale':
        comando = marca === '3i' ? '9F' : `azzgio tipo=${dati?.tipo || 1}`
        break
      case 'scontrino': {
        const lines = []
        if (dati.contatto) lines.push(`cfis cf='${dati.contatto}'`)
        for (const riga of (dati.righe || [])) {
          const rep = riga.numeroRepartoRt || 1
          const prezzo = (riga.importo / 100).toFixed(2)
          const qty = riga.quantita || 1
          const des = (riga.nome || '').substring(0, 24).replace(/'/g, ' ')
          if (qty > 1) lines.push(`vend rep=${rep}, pre=${prezzo}, qty=${qty}, des='${des}'`)
          else lines.push(`vend rep=${rep}, pre=${prezzo}, des='${des}'`)
        }
        const tot = (dati.totale / 100).toFixed(2)
        lines.push(dati.metodo === 'contanti' ? `chius t=1, imp=${tot}` : `chius t=5, imp=${tot}`)
        if (marca === 'ditron') {
          comandoArray = lines
        } else {
          comando = lines.join('\r\n')
        }
        break
      }
      case 'annullo':
        if (marca === '3i') {
          const nazz = String(dati.numeroAzzeramento).padStart(4, '0')
          const ndoc = String(dati.numeroDocumento).padStart(4, '0')
          comando = `"${nazz}-${ndoc}"52F`
        } else {
          comando = `docannullo mat='${dati.matricola}', nazz=${dati.numeroAzzeramento}, ndoc=${dati.numeroDocumento}, data=${dati.data}`
        }
        break
      case 'ristampa':
        if (marca === '3i') {
          const fmtData3i = (d) => {
            if (!d) return '000000'
            if (d.length === 6) return d.slice(4,6) + d.slice(2,4) + d.slice(0,2)
            const parts = d.split('/')
            if (parts.length === 3) return parts[2].slice(2) + parts[1] + parts[0]
            return d.replace(/-/g, '').slice(2)
          }
          const d1 = fmtData3i(dati.dataInizio)
          const n1 = String(dati.dalNumero || 1).padStart(5, '0')
          const n2 = String(dati.alNumero || 1).padStart(5, '0')
          comando = `"${d1}${n1}${n2}"15F`
        } else {
          comando = `dgfe tipo=160, datada=${dati.dataInizio}, dataa=${dati.dataFine}, nda=${dati.dalNumero}, na=${dati.alNumero}`
        }
        break
      case 'raw': {
        const cmd = dati?.cmd || ''
        if (!cmd) return res.status(400).json({ error: 'Comando raw mancante' })
        const risposta = await inviaTCP(ip, porta, cmd, marca)
        return res.json({ ok: true, risposta })
      }
      default:
        return res.status(400).json({ error: `Azione non riconosciuta: ${azione}` })
    }

    let risposta
    if (marca === '3i' && (azione === 'chiusura_fiscale' || azione === 'lettura_x')) {
      const cmds = azione === 'chiusura_fiscale' 
      ? (modalita === 'RT' ? ['z', '1F', 'c'] : ['z', '1F', 'c'])
      : ['x', '1F', 'c']
      risposta = await inviaTCP3i(ip, porta, cmds)
    } else if (comandoArray) {
      console.log('Ditron scontrino righe:', JSON.stringify(comandoArray))
      risposta = await inviaTCPDitron(ip, porta, comandoArray)
    } else {
      console.log('Ditron comando:', JSON.stringify(comando))
      risposta = await inviaTCP(ip, porta, comando, marca)
    }

    return res.json({ ok: true, risposta, comando: comandoArray || comando })

  } catch (err) {
    console.error('Errore Ditron:', err.message)
    let msg = err.message
    if (err.message.includes('ECONNREFUSED')) msg = 'Cassa non raggiungibile'
    else if (err.message.includes('ETIMEDOUT') || err.message.includes('Timeout')) msg = 'Timeout — la cassa non risponde'
    return res.status(200).json({ ok: false, error: msg })
  }
}