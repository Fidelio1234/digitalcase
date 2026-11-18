function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  }
  const eur = (cents) => (cents / 100).toFixed(2)
  









  function buildXml(f, ced) {
  const cli = f.cliente_snapshot || {}
  const forfettario = (ced.regime || '').toUpperCase() === 'RF19'

  const righe = (f.righe || []).map((r, i) => {
    const qty = r.quantita || 1
    const grossLine = (r.prezzo_cents || 0) * qty
    const a = forfettario ? 0 : (r.aliquota_iva || 0)
    const netLineCents = forfettario ? grossLine : Math.round(grossLine / (1 + a / 100))
    return { n: i + 1, descr: r.descrizione || '', qty, a, netLineCents }
  })

  const perA = {}
  for (const r of righe) perA[r.a] = (perA[r.a] || 0) + r.netLineCents
  const riepilogo = Object.keys(perA).map(a => {
    const aNum = parseFloat(a)
    const imp = perA[a]
    return { a: aNum, imp, imposta: forfettario ? 0 : Math.round(imp * aNum / 100) }
  })
  const imponibileTot = riepilogo.reduce((s, x) => s + x.imp, 0)
  const impostaTot = riepilogo.reduce((s, x) => s + x.imposta, 0)
  const totDoc = imponibileTot + impostaTot
  const applicaBollo = forfettario && imponibileTot > 7747 && (f.tipo_documento || 'TD01') !== 'TD04'

  const isAz = (cli.tipo || 'azienda') === 'azienda'
  const codDest = (cli.codice_destinatario && cli.codice_destinatario.length === 7) ? cli.codice_destinatario : '0000000'
  const pec = (cli.pec || '').trim()
  const pecLine = (codDest === '0000000' && pec) ? `\n      <PECDestinatario>${esc(pec)}</PECDestinatario>` : ''

  const idIvaCli = cli.partita_iva
    ? `<IdFiscaleIVA><IdPaese>${esc(cli.nazione || 'IT')}</IdPaese><IdCodice>${esc(cli.partita_iva)}</IdCodice></IdFiscaleIVA>` : ''
  const cfCli = cli.codice_fiscale ? `<CodiceFiscale>${esc(cli.codice_fiscale)}</CodiceFiscale>` : ''
  const anagCli = isAz
    ? `<Anagrafica><Denominazione>${esc(cli.denominazione || '')}</Denominazione></Anagrafica>`
    : `<Anagrafica><Nome>${esc(cli.nome || '')}</Nome><Cognome>${esc(cli.cognome || '')}</Cognome></Anagrafica>`

  const righeXml = righe.map(r => `      <DettaglioLinee>
        <NumeroLinea>${r.n}</NumeroLinea>
        <Descrizione>${esc(r.descr)}</Descrizione>
        <Quantita>${r.qty.toFixed(2)}</Quantita>
        <PrezzoUnitario>${(r.netLineCents / r.qty / 100).toFixed(8)}</PrezzoUnitario>
        <PrezzoTotale>${eur(r.netLineCents)}</PrezzoTotale>
        <AliquotaIVA>${r.a.toFixed(2)}</AliquotaIVA>${forfettario ? '\n        <Natura>N2.2</Natura>' : ''}
      </DettaglioLinee>`).join('\n')

  const riepilogoXml = riepilogo.map(x => forfettario
    ? `      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N2.2</Natura>
        <ImponibileImporto>${eur(x.imp)}</ImponibileImporto>
        <Imposta>0.00</Imposta>
      </DatiRiepilogo>`
    : `      <DatiRiepilogo>
        <AliquotaIVA>${x.a.toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${eur(x.imp)}</ImponibileImporto>
        <Imposta>${eur(x.imposta)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`).join('\n')

  const bolloXml = applicaBollo ? `
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>2.00</ImportoBollo>
        </DatiBollo>` : ''
        const causaleXml = forfettario ? `
        <Causale>Operazione senza applicazione IVA - regime forfettario ex art.1 c.54-89 L.190/2014</Causale>` : ''

  const MP = { contanti: 'MP01', carta: 'MP08', bonifico: 'MP05' }
  const mp = MP[f.metodo_pagamento]
  const datiPagamentoXml = mp ? `
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${mp}</ModalitaPagamento>
        <ImportoPagamento>${eur(totDoc)}</ImportoPagamento>
      </DettaglioPagamento>
      </DatiPagamento>` : ''

      const coll = f.fattura_collegata
      const collegateXml = coll ? `
          <DatiFattureCollegate>
            <IdDocumento>${esc(String(coll.numero))}</IdDocumento>
            <Data>${esc(coll.data)}</Data>
          </DatiFattureCollegate>` : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
    <IdTrasmittente><IdPaese>${esc(ced.trasmittentePaese || 'IT')}</IdPaese><IdCodice>${esc(ced.trasmittenteCodice || ced.piva)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${esc(String(f.numero))}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${esc(codDest)}</CodiceDestinatario>${pecLine}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(ced.piva)}</IdCodice></IdFiscaleIVA>
        ${ced.cf ? `<CodiceFiscale>${esc(ced.cf)}</CodiceFiscale>` : ''}
        <Anagrafica><Denominazione>${esc(ced.denominazione)}</Denominazione></Anagrafica>
        <RegimeFiscale>${esc(ced.regime)}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(ced.indirizzo)}</Indirizzo>
        <CAP>${esc(ced.cap)}</CAP>
        <Comune>${esc(ced.comune)}</Comune>
        <Provincia>${esc(ced.provincia)}</Provincia>
        <Nazione>${esc(ced.nazione || 'IT')}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${idIvaCli}
        ${cfCli}
        ${anagCli}
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(cli.indirizzo || '')}</Indirizzo>
        <CAP>${esc(cli.cap || '')}</CAP>
        <Comune>${esc(cli.comune || '')}</Comune>
        <Provincia>${esc(cli.provincia || '')}</Provincia>
        <Nazione>${esc(cli.nazione || 'IT')}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${esc(f.tipo_documento || 'TD01')}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${esc(f.data)}</Data>
        <Numero>${esc(String(f.numero))}</Numero>${bolloXml}
        <ImportoTotaleDocumento>${eur(totDoc)}</ImportoTotaleDocumento>${causaleXml}
        </DatiGeneraliDocumento>${collegateXml}
        </DatiGenerali>
    <DatiBeniServizi>
${righeXml}
${riepilogoXml}
</DatiBeniServizi>${datiPagamentoXml}
</FatturaElettronicaBody>
</p:FatturaElettronica>`
}











  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
    const { fattura } = req.body || {}
    if (!fattura) return res.status(400).json({ error: 'Dati fattura mancanti' })
  
    const ced = {
      denominazione: process.env.CEDENTE_DENOMINAZIONE,
      piva: process.env.CEDENTE_PIVA,
      cf: process.env.CEDENTE_CF || '',
      regime: process.env.CEDENTE_REGIME || 'RF01',
      indirizzo: process.env.CEDENTE_INDIRIZZO,
      cap: process.env.CEDENTE_CAP,
      comune: process.env.CEDENTE_COMUNE,
      provincia: process.env.CEDENTE_PROVINCIA,
      nazione: process.env.CEDENTE_NAZIONE || 'IT',
      trasmittentePaese: process.env.FATTURA_ID_TRASMITTENTE_PAESE || 'IT',
      trasmittenteCodice: process.env.FATTURA_ID_TRASMITTENTE || '01879020517',
    }
    const mancanti = ['denominazione','piva','indirizzo','cap','comune','provincia'].filter(k => !ced[k])
    if (mancanti.length) return res.status(500).json({ error: 'Dati cedente mancanti in env: ' + mancanti.join(', ') })
  
    try {
      const xml = buildXml(fattura, ced)
      const prog = String(fattura.numero).padStart(5, '0').slice(-5)
      return res.status(200).json({ xml, nomeFile: `${ced.trasmittentePaese}${ced.trasmittenteCodice}_${prog}.xml` })
    } catch (e) {
      return res.status(500).json({ error: 'Errore generazione XML: ' + e.message })
    }
  }
