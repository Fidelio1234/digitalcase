import { supabase } from './supabase'

// ─── NEGOZIO ──────────────────────────────────────────────────────────────

export async function getNegozioDb(negozioId) {
  const { data, error } = await supabase
    .from('negozi')
    .select('*')
    .eq('id', negozioId)
    .single()
  if (error) { console.log('saveRepartoDb error:', error); return null }
  return {
    ragioneSociale: data.ragione_sociale,
    indirizzo: data.indirizzo,
    partitaIva: data.partita_iva,
    telefono: data.telefono,
    sitoWeb: data.sito_web,
    numeroRt: data.numero_rt,
    email: data.email,
    id: data.id,
  }
}

export async function saveNegozioDb(negozioId, form) {
  const { error } = await supabase
    .from('negozi')
    .upsert({
      id: negozioId,
      ragione_sociale: form.ragioneSociale,
      indirizzo: form.indirizzo,
      partita_iva: form.partitaIva,
      telefono: form.telefono,
      sito_web: form.sitoWeb,
      numero_rt: form.numeroRt,
      email: form.email,
    })
  return !error
}

// ─── UTENTI ───────────────────────────────────────────────────────────────

export async function getUtentiDb(negozioId) {
  const { data, error } = await supabase
    .from('utenti')
    .select('*')
    .eq('negozio_id', negozioId)
    .order('created_at')
  if (error) return []
  return data.map(u => ({
    id: u.id,
    nome: u.nome,
    pin: u.pin,
    ruolo: u.ruolo,
    abilitato: u.abilitato,
    negozioId: u.negozio_id,
  }))
}

export async function saveUtenteDb(negozioId, utente) {
  const { error } = await supabase
    .from('utenti')
    .upsert({
      id: utente.id || undefined,
      negozio_id: negozioId,
      nome: utente.nome,
      pin: utente.pin,
      ruolo: utente.ruolo,
      abilitato: utente.abilitato,
    })
  return !error
}

export async function deleteUtenteDb(id) {
  const { error } = await supabase
    .from('utenti')
    .delete()
    .eq('id', id)
  return !error
}

// ─── REPARTI ──────────────────────────────────────────────────────────────

export async function getRepartiDb(negozioId) {
  const { data: reparti, error } = await supabase
    .from('reparti')
    .select('*, prodotti(*)')
    .eq('negozio_id', negozioId)
    .order('ordine')
  if (error) return []
  return reparti.map(r => ({
    id: r.id,
    nome: r.nome,
    colore: r.colore,
    icona: r.icona,
    iva: r.iva,
    minimoImporto: r.minimo_importo,
    massimoImporto: r.massimo_importo,
    abilitato: r.abilitato,
    ordine: r.ordine,
    sottoreparti: (r.prodotti || []).map(p => ({
      id: p.id,
      nome: p.nome,
      prezzoFisso: p.prezzo_fisso,
      ivaOverride: p.iva_override,
      minimoImporto: p.minimo_importo,
      massimoImporto: p.massimo_importo,
      barcode: p.barcode || null,
      giacenza: p.giacenza ?? null,
      giacenzaMinima: p.giacenza_minima ?? null,
      abilitato: p.abilitato,
      ordine: p.ordine,
    })).sort((a,b) => a.ordine - b.ordine)
  }))
}

export async function saveRepartoDb(negozioId, reparto) {
  const { data, error } = await supabase
    .from('reparti')
    .upsert({
      id: reparto.id && reparto.id.includes('-') ? reparto.id : undefined,
      negozio_id: negozioId,
      nome: reparto.nome,
      colore: reparto.colore,
      icona: reparto.icona,
      iva: reparto.iva,
      minimo_importo: reparto.minimoImporto || 0,
      massimo_importo: reparto.massimoImporto,
      natura_iva: reparto.natura_iva || '',
      uscita: reparto.uscita || 1,
      abilitato: reparto.abilitato,
      ordine: reparto.ordine,
    })
    .select()
    .single()
  if (error) return null
  return data.id
}

export async function saveProdottoDb(negozioId, repartoId, prodotto) {
  const { error } = await supabase
    .from('prodotti')
    .upsert({
      id: prodotto.id && prodotto.id.includes('-') ? prodotto.id : undefined,
      negozio_id: negozioId,
      reparto_id: repartoId,
      nome: prodotto.nome,
      prezzo_fisso: prodotto.prezzoFisso,
      iva_override: prodotto.ivaOverride,
      minimo_importo: prodotto.minimoImporto,
      massimo_importo: prodotto.massimoImporto,
      abilitato: prodotto.abilitato,
      ordine: prodotto.ordine,
      barcode: prodotto.barcode || null,
      giacenza: prodotto.giacenza ?? null,
      giacenza_minima: prodotto.giacenzaMinima ?? null,
    })
  return !error
}

export async function deleteRepartoDb(id) {
  const { error } = await supabase.from('reparti').delete().eq('id', id)
  return !error
}

export async function deleteProdottoDb(id) {
  const { error } = await supabase.from('prodotti').delete().eq('id', id)
  return !error
}

// ─── SCONTRINI ────────────────────────────────────────────────────────────

export async function salvaScontrinoDb(negozioId, scontrino) {
  const { data, error } = await supabase
    .from('scontrini')
    .insert({
      negozio_id: negozioId,
      numero_scontrino: scontrino.numeroScontrino,
      totale: scontrino.totale,
      metodo: scontrino.metodo,
      resto: scontrino.resto || 0,
      contatto: scontrino.contatto,
      timestamp_emissione: scontrino.timestamp,
      operatore_id: scontrino.operatoreId || null,
      operatore_nome: scontrino.operatoreNome || null,
    })
    .select()
    .single()
  if (error || !data) return null

  // Salva righe
  if (scontrino.righe?.length > 0) {
    await supabase.from('righe_scontrino').insert(
      scontrino.righe.map(r => ({
        scontrino_id: data.id,
        nome: r.nome,
        importo: r.importo,
        quantita: r.quantita || 1,
        totale_riga: r.totaleRiga,
        iva: r.iva,
        nota: r.nota || null,
        importo_base: r.importoBase || null,
      }))
    )
  }
  return data.id
}

export async function getStoricoDb(negozioId, filtri = {}) {
  let query = supabase
    .from('scontrini')
    .select('*, righe_scontrino(*)')
    .eq('negozio_id', negozioId)
    .order('timestamp_emissione', { ascending: false })

  if (filtri.data) {
    query = query
      .gte('timestamp_emissione', filtri.data + 'T00:00:00')
      .lte('timestamp_emissione', filtri.data + 'T23:59:59')
  }
  if (filtri.metodo && filtri.metodo !== 'tutti') {
    query = query.eq('metodo', filtri.metodo)
  }

  const { data, error } = await query
  if (error) return []

  return data.map(s => ({
    id: s.id,
    numeroScontrino: s.numero_scontrino,
    totale: s.totale,
    metodo: s.metodo,
    resto: s.resto,
    contatto: s.contatto,
    timestamp: s.timestamp_emissione,
    operatoreNome: s.operatore_nome || null,
    annullato: s.annullato || false,
    annullatoDa: s.annullato_da || null,
    annullatoAlle: s.annullato_alle || null,
    righe: (s.righe_scontrino || []).map(r => ({
      nome: r.nome,
      importo: r.importo,
      quantita: r.quantita,
      totaleRiga: r.totale_riga,
      iva: r.iva,
      nota: r.nota || null,
      importoBase: r.importo_base || null,
    }))
  }))
}

// ─── CHIUSURE ─────────────────────────────────────────────────────────────

export async function salvaChiusuraDb(negozioId, chiusura) {
  const { error } = await supabase
    .from('chiusure')
    .insert({
      negozio_id: negozioId,
      numero_chiusura: chiusura.numeroChiusura,
      numero_scontrini: chiusura.numeroScontrini,
      totale_giornaliero: chiusura.totaleGiornaliero,
      totale_carte: chiusura.totaleCarte,
      totale_contanti: chiusura.totaleContanti,
      totale_iva: chiusura.totaleIva,
      timestamp_chiusura: chiusura.timestamp,
    })
  return !error
}

export async function getChiusureDb(negozioId) {
  const { data, error } = await supabase
    .from('chiusure')
    .select('*')
    .eq('negozio_id', negozioId)
    .order('timestamp_chiusura', { ascending: false })
  if (error) return []
  return data.map(c => ({
    id: c.id,
    numeroChiusura: c.numero_chiusura,
    numeroScontrini: c.numero_scontrini,
    totaleGiornaliero: c.totale_giornaliero,
    totaleCarte: c.totale_carte,
    totaleContanti: c.totale_contanti,
    totaleIva: c.totale_iva,
    timestamp: c.timestamp_chiusura,
    stato: c.stato || 'inviata',
  }))
}

// ─── CONTATORI ────────────────────────────────────────────────────────────

export async function getContatoriDb(negozioId) {
  const oggi = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('contatori')
    .select('*')
    .eq('negozio_id', negozioId)
    .eq('data', oggi)
    .single()
  if (error) return { scontrini: 0, chiusure: 0 }
  return { scontrini: data.scontrini, chiusure: data.chiusure }
}

export async function incrementaContatore(negozioId, campo) {
  const oggi = new Date().toISOString().split('T')[0]
  const contatori = await getContatoriDb(negozioId)
  const nuovoValore = (contatori[campo] || 0) + 1
  await supabase
    .from('contatori')
    .upsert({
      negozio_id: negozioId,
      data: oggi,
      scontrini: campo === 'scontrini' ? nuovoValore : contatori.scontrini,
      chiusure: campo === 'chiusure' ? nuovoValore : contatori.chiusure,
    })
  return { ...contatori, [campo]: nuovoValore }
}

// ─── TAVOLI ──────────────────────────────────────────────────────────────────

export async function getTavoliDb(negozioId) {
  const { data, error } = await supabase
    .from('tavoli')
    .select('*')
    .eq('negozio_id', negozioId)
    .order('numero')
  if (error) return []
  return data.map(t => ({
    id: t.id,
    numero: t.numero,
    stato: t.stato,
    coperti: t.coperti || 0,
    righe: t.righe || [],
    ultimoOrdine: t.ultimo_ordine,
    apertoAlle: t.aperto_alle,
    divisione: t.divisione || null,
  }))
}

export async function salvaTavoloDb(negozioId, tavolo) {
  const payload = {
    negozio_id: negozioId,
    numero: tavolo.numero,
    stato: tavolo.stato,
    coperti: tavolo.coperti || 0,
    righe: tavolo.righe || [],
    ultimo_ordine: tavolo.ultimoOrdine || null,
    aperto_alle: tavolo.apertoAlle || null,
  }

  // Prova UPDATE prima, se non trova righe fa INSERT
  const { data: updated, error: updateError } = await supabase
    .from('tavoli')
    .update(payload)
    .eq('negozio_id', negozioId)
    .eq('numero', tavolo.numero)
    .select('id')

  let error = updateError
  if (!updateError && (!updated || updated.length === 0)) {
    const res = await supabase.from('tavoli').insert({ ...payload })
    error = res.error
  }
  return !error
}

export async function salvaStoricoTavolo(negozioId, tavolo) {
  const totale = (tavolo.righe || []).reduce((s, r) => s + (r.totaleRiga || 0), 0)
  const { error } = await supabase
    .from('storico_tavoli')
    .insert({
      negozio_id: negozioId,
      numero_tavolo: tavolo.numero,
      aperto_alle: tavolo.apertoAlle || null,
      chiuso_alle: new Date().toISOString(),
      coperti: tavolo.coperti || 0,
      righe: tavolo.righe || [],
      totale,
    })
    if (error) { console.error('Errore storico tavolo:', error); return false }
  return true
}

export async function chiudiTavoloDb(negozioId, numero) {
  const { error } = await supabase
    .from('tavoli')
    .update({
      stato: 'libero',
      coperti: 0,
      righe: [],
      ultimo_ordine: null,
      aperto_alle: null,
      divisione: null,
    })
    .eq('negozio_id', negozioId)
    .eq('numero', numero)
  return !error
}


// Toglie dal tavolo le quantità incassate, rileggendo il tavolo DAL DB.
// Chiude il tavolo solo se non resta nulla. pagate = [{ id, quantita }]
export async function scalaRigheTavoloDb(negozioId, numero, pagate) {
  const { data: t, error } = await supabase
    .from('tavoli').select('righe')
    .eq('negozio_id', negozioId).eq('numero', numero).maybeSingle()
  if (error || !t) return { ok: false, chiuso: false, tolte: 0 }

  const daTogliere = new Map()
  for (const p of pagate || []) {
    const k = String(p.id)
    daTogliere.set(k, (daTogliere.get(k) || 0) + (p.quantita || 0))
  }
  let tolte = 0
  const rimaste = []
  for (const r of t.righe || []) {
    const qta = r.quantita || 0
    const rimosse = Math.min(qta, daTogliere.get(String(r.id)) || 0)
    tolte += rimosse
    if (qta - rimosse > 0) rimaste.push({ ...r, quantita: qta - rimosse, totaleRiga: r.importo * (qta - rimosse) })
  }
  if (tolte === 0) return { ok: true, chiuso: false, tolte: 0 }
  if (rimaste.length === 0) {
    const ok = await chiudiTavoloDb(negozioId, numero)
    return { ok, chiuso: true, tolte }
  }
  const { error: e2 } = await supabase.from('tavoli').update({ righe: rimaste })
    .eq('negozio_id', negozioId).eq('numero', numero)
  return { ok: !e2, chiuso: false, tolte }
}




// Registra il pagamento di una quota alla romana. Chiude il tavolo solo quando
// l'incassato copre il conto. Se chiude, restituisce le righe per lo storico.
export async function registraQuotaRomanaDb(negozioId, numero, { persone, quote, importo }) {
  const { data: t, error } = await supabase
    .from('tavoli').select('righe, divisione')
    .eq('negozio_id', negozioId).eq('numero', numero).maybeSingle()
  if (error || !t) return { ok: false, chiuso: false, righe: [] }

  const div = t.divisione || { persone, quotePagate: 0, importoPagato: 0 }
  const nuova = {
    persone: div.persone,
    quotePagate: div.quotePagate + quote,
    importoPagato: div.importoPagato + importo,
  }
  const totale = (t.righe || []).reduce((s, r) => s + (r.totaleRiga || 0), 0)
  if (nuova.importoPagato >= totale) {
    const ok = await chiudiTavoloDb(negozioId, numero)
    return { ok, chiuso: true, righe: t.righe || [] }
  }
  const { error: e2 } = await supabase.from('tavoli').update({ divisione: nuova })
    .eq('negozio_id', negozioId).eq('numero', numero)
  return { ok: !e2, chiuso: false, righe: [] }
}




export async function getImpostazioniDb(negozioId) {
  const { data } = await supabase
    .from('impostazioni_negozio')
    .select('*')
    .eq('negozio_id', negozioId)
    .single()
  return {
    copertoAbilitato: data?.coperto_abilitato || false,
    copertoImporto: data?.coperto_importo || 200,
    numeroTavoli: data?.numero_tavoli || 10,
    tavoliAbilitati: data?.tavoli_abilitati !== false,
    magazzinoAbilitato: data?.magazzino_abilitato || false,
    cortesiaAbilitato: data?.cortesia_abilitato || false,
    asportoAbilitato: data?.asporto_abilitato || false,
    nonRiscossoAbilitato: data?.non_riscosso_abilitato || false,
    agendaAbilitato: data?.agenda_abilitato || false,
    costoAggiunta: data?.costo_aggiunta ?? 50,
    aggiunteRapide: data?.aggiunte_rapide || [],
    fidelityAbilitato: data?.fidelity_abilitato || false,
    fidelityCentesimiPerPunto: data?.fidelity_centesimi_per_punto ?? 100,
    fidelitySogliaPunti: data?.fidelity_soglia_punti ?? 100,
    fidelityValoreOmaggio: data?.fidelity_valore_omaggio ?? 500,
    fidelityAvvisoPunti: data?.fidelity_avviso_punti ?? 0,
  }
}



// Lettura/scrittura DEDICATA per le aggiunte rapide, isolata dal resto delle
// impostazioni. NON usare salvaImpostazioniDb per salvare solo le aggiunte:
// quella funzione applica default (?? 50, || false) a tutti i campi non
// passati esplicitamente, sovrascrivendo silenziosamente le altre impostazioni
// del negozio (es. costoAggiunta tornerebbe a 50, magazzinoAbilitato a false).
export async function getAggiunteRapideDb(negozioId) {
  const { data } = await supabase
    .from('impostazioni_negozio')
    .select('aggiunte_rapide')
    .eq('negozio_id', negozioId)
    .maybeSingle() // niente riga ancora per questo negozio = nessun errore, torna []
  return data?.aggiunte_rapide || []
}

export async function salvaAggiunteRapideDb(negozioId, lista) {
  const { error } = await supabase
    .from('impostazioni_negozio')
    .upsert({ negozio_id: negozioId, aggiunte_rapide: lista }, { onConflict: 'negozio_id' })
  return !error
}





export async function salvaImpostazioniDb(negozioId, imp) {
  const { error } = await supabase
    .from('impostazioni_negozio')
    .upsert({
      negozio_id: negozioId,
      coperto_abilitato: imp.copertoAbilitato,
      coperto_importo: imp.copertoImporto,
      numero_tavoli: imp.numeroTavoli,
      tavoli_abilitati: imp.tavoliAbilitati !== false,
      magazzino_abilitato: imp.magazzinoAbilitato || false,
      cortesia_abilitato: imp.cortesiaAbilitato || false,
      asporto_abilitato: imp.asportoAbilitato || false,
      agenda_abilitato: imp.agendaAbilitato || false,
      costo_aggiunta: imp.costoAggiunta ?? 50,
      fidelity_abilitato: imp.fidelityAbilitato || false,
      fidelity_centesimi_per_punto: imp.fidelityCentesimiPerPunto ?? 100,
      fidelity_soglia_punti: imp.fidelitySogliaPunti ?? 100,
      fidelity_valore_omaggio: imp.fidelityValoreOmaggio ?? 500,
    }, { onConflict: 'negozio_id' })
  return !error
}

// ─── TAVOLI ──────────────────────────────────────────────────────────────────



// ─── MAGAZZINO ────────────────────────────────────────────────────────────────

export async function getProdottiConGiacenza(negozioId) {
  const { data } = await supabase
    .from('prodotti')
    .select('id, nome, giacenza, giacenza_minima, reparto_id')
    .eq('negozio_id', negozioId)
    .not('giacenza', 'is', null)
    .order('nome')
  return data || []
}

export async function aggiornaGiacenza(negozioId, prodottoId, prodottoNome, tipo, quantita, giacenzaDopo) {
  // Aggiorna giacenza prodotto
  await supabase
    .from('prodotti')
    .update({ giacenza: giacenzaDopo })
    .eq('id', prodottoId)

  // Salva movimento
  await supabase
    .from('movimenti_magazzino')
    .insert({
      negozio_id: negozioId,
      prodotto_id: prodottoId,
      prodotto_nome: prodottoNome,
      tipo,
      quantita,
      giacenza_dopo: giacenzaDopo,
    })
}

export async function getMovimentiMagazzino(negozioId, limit = 50) {
  const { data } = await supabase
    .from('movimenti_magazzino')
    .select('*')
    .eq('negozio_id', negozioId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

export async function salvaAnnulloDb(negozioId, dati) {
  const { error } = await supabase
    .from('scontrini')
    .insert({
      negozio_id: negozioId,
      numero_scontrino: 0,
      totale: dati.totale,
      metodo: 'annullato',
      resto: 0,
      timestamp_emissione: new Date().toISOString(),
      operatore_id: dati.operatoreId || null,
      operatore_nome: dati.operatoreNome || null,
      annullato: true,
      annullato_da: dati.operatoreNome || null,
      annullato_alle: new Date().toISOString(),
    })
  if (dati.righe?.length > 0 && !error) {
    // Non salviamo le righe per gli annulli
  }
  return !error
}

// ─── ASPORTI ────────────────────────────────────────────────────────────────

export async function getAsportiDb(negozioId) {
  const { data } = await supabase
    .from('asporti')
    .select('*')
    .eq('negozio_id', negozioId)
    .eq('stato', 'aperto')
    .order('numero', { ascending: true })
  return data || []
}

export async function nuovoAsportoDb(negozioId, nomeCliente, numero) {
  const { data, error } = await supabase
    .from('asporti')
    .insert({
      negozio_id: negozioId,
      numero,
      nome_cliente: nomeCliente,
      stato: 'aperto',
      righe: [],
      aperto_alle: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return null
  return data
}

export async function salvaAsportoDb(negozioId, id, righe) {
  const totale = righe.reduce((s, r) => s + (r.totaleRiga || 0), 0)
  const { error } = await supabase
    .from('asporti')
    .update({ righe, totale })
    .eq('id', id)
    .eq('negozio_id', negozioId)
  return !error
}

export async function chiudiAsportoDb(negozioId, id) {
  const { error } = await supabase
    .from('asporti')
    .update({ stato: 'chiuso', chiuso_alle: new Date().toISOString() })
    .eq('id', id)
    .eq('negozio_id', negozioId)
  return !error
}

export async function eliminaAsportoDb(negozioId, id) {
  const { error } = await supabase
    .from('asporti')
    .delete()
    .eq('id', id)
    .eq('negozio_id', negozioId)
  return !error
}

export async function getContatoraAsportoDb(negozioId) {
  const { data } = await supabase
    .from('impostazioni_negozio')
    .select('asporto_contatore')
    .eq('negozio_id', negozioId)
    .single()
  return data?.asporto_contatore || 0
}

export async function incrementaContatoraAsportoDb(negozioId) {
  const corrente = await getContatoraAsportoDb(negozioId)
  const nuovo = corrente + 1
  await supabase
    .from('impostazioni_negozio')
    .update({ asporto_contatore: nuovo })
    .eq('negozio_id', negozioId)
  return nuovo
}

export async function resetContatoraAsportoDb(negozioId) {
  await supabase
    .from('impostazioni_negozio')
    .update({ asporto_contatore: 0 })
    .eq('negozio_id', negozioId)
}



// ─── AGENDA ──────────────────────────────────────────────────────────────────

export async function getClientiAgendaDb(negozioId, ricerca = '') {
  let query = supabase.from('clienti_agenda').select('*').eq('negozio_id', negozioId).order('nome')
  if (ricerca) {
    const q = ricerca.replace(/[,()]/g, '').trim()
    if (q) query = query.or(`nome.ilike.%${q}%,telefono.ilike.%${q}%`)
  }
  const { data, error } = await query.limit(20)
  return error ? [] : data
}

export async function salvaClienteAgendaDb(negozioId, { nome, telefono }) {
  if (!telefono) {
    const { data, error } = await supabase.from('clienti_agenda')
      .insert({ negozio_id: negozioId, nome, telefono: null }).select().single()
    return error ? null : data
  }
  const { data, error } = await supabase.from('clienti_agenda')
    .upsert({ negozio_id: negozioId, nome, telefono }, { onConflict: 'negozio_id,telefono' })
    .select().single()
  return error ? null : data
}

export async function getPrenotazioniDb(negozioId, data) {
  const { data: rows, error } = await supabase.from('prenotazioni')
    .select('*').eq('negozio_id', negozioId).eq('data', data).order('ora')
  return error ? [] : rows
}

export async function salvaPrenotazioneDb(negozioId, p) {
  const payload = {
    id: p.id || undefined,
    negozio_id: negozioId,
    cliente_id: p.clienteId || null,
    cliente_nome: p.clienteNome,
    cliente_telefono: p.clienteTelefono || null,
    servizi: p.servizi || [],
    totale: p.totale || 0,
    data: p.data,
    ora: p.ora,
    num_slot: p.numSlot || 1,
    note: p.note || null,
    stato: p.stato || 'prenotato',
    operatore_id: p.operatoreId || null,
    operatore_nome: p.operatoreNome || null,
  }
  const { data, error } = await supabase.from('prenotazioni').upsert(payload).select().single()
  return error ? null : data
}

export async function eliminaPrenotazioneDb(id) {
  const { error } = await supabase.from('prenotazioni').delete().eq('id', id)
  return !error
}

export async function chiudiPrenotazioneDb(negozioId, id) {
  const { error } = await supabase.from('prenotazioni').update({ stato: 'completato' }).eq('id', id).eq('negozio_id', negozioId)
  return !error
}
// ─── SINCRONIZZA DATI NEGOZIO (database → browser) ────────────────────────
// Copia nel localStorage (chiave sd_negozio) i dati del negozio inseriti dal Pannello Tecnico.
// Legge solo le colonne necessarie. Un campo vuoto nel database non cancella quello locale.
export async function sincronizzaNegozioLocale(negozioId) {
  try {
    if (typeof window === 'undefined' || !negozioId) return false
    const { data, error } = await supabase
      .from('negozi')
      .select('ragione_sociale, indirizzo, partita_iva, telefono, sito_web, numero_rt')
      .eq('id', negozioId)
      .maybeSingle()
    if (error || !data) return false
    const dalDb = {
      ragioneSociale: data.ragione_sociale,
      indirizzo: data.indirizzo,
      partitaIva: data.partita_iva,
      telefono: data.telefono,
      sitoWeb: data.sito_web,
      numeroRt: data.numero_rt,
    }
    let locale = {}
    try { locale = JSON.parse(localStorage.getItem('sd_negozio') || '{}') || {} } catch {}
    const unito = { ...locale }
    for (const [k, v] of Object.entries(dalDb)) {
      if (typeof v === 'string' && v.trim() !== '') unito[k] = v.trim()
    }
    localStorage.setItem('sd_negozio', JSON.stringify(unito))
    return true
  } catch (e) {
    console.warn('sincronizzaNegozioLocale:', e && e.message)
    return false
  }
}
