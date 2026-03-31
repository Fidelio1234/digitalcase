import { supabase } from './supabase'

// ─── NEGOZIO ──────────────────────────────────────────────────────────────

export async function getNegozioDb(negozioId) {
  const { data, error } = await supabase
    .from('negozi')
    .select('*')
    .eq('id', negozioId)
    .single()
  if (error) return null
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
      abilitato: p.abilitato,
      ordine: p.ordine,
    })).sort((a,b) => a.ordine - b.ordine)
  }))
}

export async function saveRepartoDb(negozioId, reparto) {
  const { data, error } = await supabase
    .from('reparti')
    .upsert({
      id: reparto.id || undefined,
      negozio_id: negozioId,
      nome: reparto.nome,
      colore: reparto.colore,
      icona: reparto.icona,
      iva: reparto.iva,
      minimo_importo: reparto.minimoImporto,
      massimo_importo: reparto.massimoImporto,
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
      id: prodotto.id || undefined,
      negozio_id: negozioId,
      reparto_id: repartoId,
      nome: prodotto.nome,
      prezzo_fisso: prodotto.prezzoFisso,
      iva_override: prodotto.ivaOverride,
      minimo_importo: prodotto.minimoImporto,
      massimo_importo: prodotto.massimoImporto,
      abilitato: prodotto.abilitato,
      ordine: prodotto.ordine,
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
    righe: (s.righe_scontrino || []).map(r => ({
      nome: r.nome,
      importo: r.importo,
      quantita: r.quantita,
      totaleRiga: r.totale_riga,
      iva: r.iva,
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
