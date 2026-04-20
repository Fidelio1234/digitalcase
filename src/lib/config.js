// NEGOZIO_ID viene ora risolto dinamicamente dal NegozioContext
// Questo fallback serve solo per compatibilità durante la migrazione
export const NEGOZIO_ID = process.env.NEXT_PUBLIC_NEGOZIO_ID || 'd7861145-dfb7-4b28-ae10-b35166231128'
export const NEGOZIO_SLUG = process.env.NEXT_PUBLIC_NEGOZIO_SLUG || 'dmi'
