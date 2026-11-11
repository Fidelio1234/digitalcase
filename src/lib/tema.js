// Tema chiaro/scuro: si ricorda per dispositivo (localStorage), predefinito scuro.
const CHIAVE = 'dc_tema'

export function applicaTema(tema) {
  const t = tema === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(CHIAVE, t) } catch {}
}

export function temaAttuale() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}
