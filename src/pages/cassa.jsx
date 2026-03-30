import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getReparti } from '@/lib/storage'
import { useCassa } from '@/hooks/useCassa'
import styles from '@/styles/Cassa.module.css'

const ICONE = {
  coffee:'☕', cake:'🍰', food:'🍽️', drink:'🥤', beer:'🍺',
  wine:'🍷', pizza:'🍕', sandwich:'🥪', ice_cream:'🍦', candy:'🍬',
  bread:'🥐', fruit:'🍎', salad:'🥗', fish:'🐟', meat:'🥩',
  shopping:'🛍️', gift:'��', star:'⭐', tag:'🏷️', box:'📦',
}

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export default function CassaPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [reparti, setReparti] = useState([])
  const [repartoAttivo, setRepartoAttivo] = useState(null)
  const [showChiusura, setShowChiusura] = useState(false)
  const [showConfirmAnnulla, setShowConfirmAnnulla] = useState(false)
  const [showSuccesso, setShowSuccesso] = useState(null)
  const [scontrinoCorrente, setScontrinoCorrente] = useState(null)
  const [righeBackup, setRigheBackup] = useState([]) // FIX 1: backup righe

  const {
    inputCents, righe, ultimaChiusa, errore, totale, subtotalePerIva,
    pressDigit, pressDoubleZero, pressClear,
    aggiungiRiga, annullaUltima, annullaTutto, chiudiScontrino,
    ripristinaRighe
  } = useCassa()

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    const r = getReparti().filter(r => r.abilitato)
    setReparti(r)
    if (r.length > 0) setRepartoAttivo(r[0].id)
  }, [user, router])

  useEffect(() => {
    const handler = (e) => {
      if (showChiusura || showConfirmAnnulla || showSuccesso) return
      if (e.key >= '0' && e.key <= '9') pressDigit(e.key)
      else if (e.key === 'Backspace') pressClear()
      else if (e.key === 'Escape') {
        if (righe.length > 0) setShowConfirmAnnulla(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showChiusura, showConfirmAnnulla, showSuccesso, pressDigit, pressClear, righe])

  function handleRepartoClick(reparto) {
    if (inputCents > 0) { aggiungiRiga(reparto); return }
    setRepartoAttivo(prev => prev === reparto.id ? null : reparto.id)
  }

  function handleSottorepartoClick(reparto, sr) {
    aggiungiRiga(reparto, sr)
  }

  // FIX 1: salva backup righe prima di aprire chiusura
  function handleChiudi() {
    if (righe.length === 0) return
    setRigheBackup([...righe])
    const sc = chiudiScontrino()
    setScontrinoCorrente(sc)
    setShowChiusura(true)
  }

  // FIX 1: se annulla chiusura, ripristina le righe
  function handleAnnullaChiusura() {
    ripristinaRighe(righeBackup)
    setRigheBackup([])
    setShowChiusura(false)
  }

  // FIX 2: conferma annulla tutto
  function handleConfermAnnulla() {
    annullaTutto()
    setShowConfirmAnnulla(false)
  }

  // FIX 3: successo invio
  function handleSuccesso(info) {
    setShowChiusura(false)
    setShowSuccesso(info)
    setRigheBackup([])
  }

  const repartoEspanso = reparti.find(r => r.id === repartoAttivo)

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoMark}>🧾</div>
          <div>
            <div className={styles.logoName}>ScontrinoDigitale</div>
            <div className={styles.headerUser}>{user?.name} · {user?.role === 'owner' ? 'Titolare' : 'Cassiere'}</div>
          </div>
        </div>
        <div className={styles.headerCenter}>
          {errore && <div className={styles.errore}>⚠ {errore}</div>}
        </div>
        <div className={styles.headerRight}>
          {user?.role === 'owner' && (
            <button className={styles.cfgBtn} onClick={() => router.push('/configurazione/reparti')}>
              ⚙️ Config
            </button>
          )}
          <button className={styles.logoutBtn} onClick={() => { logout(); router.replace('/login') }}>
            Esci
          </button>
        </div>
      </header>

      <div className={styles.main}>

        {/* SINISTRA */}
        <div className={styles.colLeft}>
          <div className={styles.displayImporto}>
            <div className={styles.displayLabel}>IMPORTO</div>
            <div className={styles.displayValue}>€ {fmt(inputCents)}</div>
            {ultimaChiusa && righe.length === 0 && (
              <div className={styles.ultimaChiusa}>
                Ultimo: {ultimaChiusa.nome} €{fmt(ultimaChiusa.importo)}
              </div>
            )}
          </div>

          <div className={styles.numpad}>
            {['7','8','9','4','5','6','1','2','3'].map(n => (
              <button key={n} className={styles.key} onClick={() => pressDigit(n)}>{n}</button>
            ))}
            <button className={styles.key} onClick={pressClear}>C</button>
            <button className={styles.key} onClick={() => pressDigit('0')}>0</button>
            <button className={styles.key} onClick={pressDoubleZero}>00</button>
          </div>

          <div className={styles.funzioni}>
            <button className={styles.fnBtn} onClick={annullaUltima} disabled={righe.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
              Ann. ultima
            </button>
            <button className={`${styles.fnBtn} ${styles.fnDanger}`}
              onClick={() => righe.length > 0 && setShowConfirmAnnulla(true)}
              disabled={righe.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
              Ann. tutto
            </button>
          </div>

          {righe.length > 0 && (
            <div className={styles.subtotale}>
              <div className={styles.subtotaleRow}>
                <span>Subtotale</span>
                <span>€ {fmt(totale)}</span>
              </div>
              {Object.entries(subtotalePerIva).map(([iva, imp]) => (
                <div key={iva} className={styles.subtotaleIva}>
                  <span>IVA {iva}%</span>
                  <span>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</span>
                </div>
              ))}
            </div>
          )}

          <button className={styles.chiudiBtn} onClick={handleChiudi} disabled={righe.length === 0}>
            Chiudi scontrino
            {righe.length > 0 && <span className={styles.chiudiBadge}>€ {fmt(totale)}</span>}
          </button>
        </div>

        {/* CENTRO */}
        <div className={styles.colCenter}>
          <div className={styles.displayHeader}>
            <span className={styles.displayTitle}>Scontrino in corso</span>
            <span className={styles.righeCount}>{righe.length} voci</span>
          </div>
          <div className={styles.righeList}>
            {righe.length === 0 && (
              <div className={styles.righeEmpty}>
                <div style={{fontSize:'2rem'}}>🧾</div>
                <div>Digita un importo e seleziona un reparto</div>
                <div style={{fontSize:'0.75rem',marginTop:4}}>oppure clicca direttamente su un prodotto</div>
              </div>
            )}
            {righe.map((r, i) => (
              <div key={r.id} className={`${styles.riga} ${i === righe.length-1 ? styles.rigaLast : ''}`}>
                <div className={styles.rigaIcona} style={{background:r.colore+'22'}}>{ICONE[r.icona]||'📦'}</div>
                <div className={styles.rigaInfo}>
                  <div className={styles.rigaNome}>
                    {r.nome}
                    {r.quantita > 1 && <span className={styles.rigaQty}>×{r.quantita}</span>}
                  </div>
                  <div className={styles.rigaMeta}>IVA {r.iva}% · €{fmt(r.importo)} cad.</div>
                </div>
                <div className={styles.rigaTotale}>€ {fmt(r.totaleRiga)}</div>
              </div>
            ))}
          </div>
          {righe.length > 0 && (
            <div className={styles.totaleBanner}>
              <span>TOTALE</span>
              <span className={styles.totaleVal}>€ {fmt(totale)}</span>
            </div>
          )}
        </div>

        {/* DESTRA */}
        <div className={styles.colRight}>
          <div className={styles.repartiHeader}>REPARTI</div>
          <div className={styles.repartiList}>
            {reparti.map(r => (
              <div key={r.id}>
                <button
                  className={`${styles.repartoBtn} ${repartoAttivo === r.id ? styles.repartoActive : ''}`}
                  style={{borderColor: repartoAttivo === r.id ? r.colore : 'transparent'}}
                  onClick={() => handleRepartoClick(r)}
                >
                  <span className={styles.repartoIcn}>{ICONE[r.icona]||'📦'}</span>
                  <span className={styles.repartoNm}>{r.nome}</span>
                  {inputCents > 0 && (
                    <span className={styles.repartoEuro} style={{background:r.colore+'22',color:r.colore}}>
                      + €{fmt(inputCents)}
                    </span>
                  )}
                </button>
                {repartoAttivo === r.id && r.sottoreparti.filter(s=>s.abilitato).length > 0 && (
                  <div className={styles.srList}>
                    {r.sottoreparti.filter(s=>s.abilitato).map(sr => (
                      <button key={sr.id} className={styles.srBtn}
                        style={{borderLeft:`3px solid ${r.colore}`}}
                        onClick={() => handleSottorepartoClick(r, sr)}>
                        <span className={styles.srNm}>{sr.nome}</span>
                        <span className={styles.srPrezzo} style={{color:r.colore}}>€ {fmt(sr.prezzoFisso)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL CHIUSURA */}
      {showChiusura && scontrinoCorrente && (
        <ChiusuraModal
          scontrino={scontrinoCorrente}
          onAnnulla={handleAnnullaChiusura}
          onSuccesso={handleSuccesso}
        />
      )}

      {/* FIX 2: MODAL CONFERMA ANNULLA TUTTO */}
      {showConfirmAnnulla && (
        <div className={styles.overlay} onClick={() => setShowConfirmAnnulla(false)}>
          <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmIcona}>🗑️</div>
            <div className={styles.confirmTitolo}>Annullare il conto?</div>
            <div className={styles.confirmSub}>
              Verranno eliminate {righe.length} voci per un totale di €{fmt(totale)}.<br/>
              Questa operazione non può essere annullata.
            </div>
            <div className={styles.confirmBtns}>
              <button className={styles.cancelBtn} onClick={() => setShowConfirmAnnulla(false)}>
                No, torna al conto
              </button>
              <button className={styles.confirmDangerBtn} onClick={handleConfermAnnulla}>
                Sì, annulla tutto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX 3: MODAL SUCCESSO */}
      {showSuccesso && (
        <div className={styles.overlay} onClick={() => setShowSuccesso(null)}>
          <div className={styles.successModal} onClick={e => e.stopPropagation()}>
            <div className={styles.successCircle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className={styles.successTitolo}>Scontrino inviato!</div>
            <div className={styles.successId}>{showSuccesso.id}</div>
            {showSuccesso.contatto && (
              <div className={styles.successContatto}>
                📨 Inviato a <strong>{showSuccesso.contatto}</strong>
              </div>
            )}
            <div className={styles.successTotale}>
              € {fmt(showSuccesso.totale)}
            </div>
            <div className={styles.successMeta}>
              {showSuccesso.metodo === 'carta' ? '💳 Carta / POS' : '�� Contanti'}
              {showSuccesso.metodo === 'contanti' && showSuccesso.resto > 0 &&
                ` · Resto €${fmt(showSuccesso.resto)}`}
            </div>
            <button className={styles.successBtn} onClick={() => setShowSuccesso(null)}>
              Nuovo scontrino
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChiusuraModal({ scontrino, onAnnulla, onSuccesso }) {
  const [metodo, setMetodo] = useState('carta')
  const [datoCliente, setDatoCliente] = useState('')
  const [contanti, setContanti] = useState('')

  const contantiCents = Math.round(parseFloat(contanti.replace(',','.') || '0') * 100)
  const resto = metodo === 'contanti' ? Math.max(0, contantiCents - scontrino.totale) : 0

  function handleInvia() {
    onSuccesso({
      id: scontrino.id,
      totale: scontrino.totale,
      contatto: datoCliente || null,
      metodo,
      resto,
    })
  }

  return (
    <div className={styles.overlay} onClick={onAnnulla}>
      <div className={styles.chiusuraModal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Chiudi Scontrino</div>
          <div className={styles.modalId}>{scontrino.id}</div>
        </div>

        <div className={styles.modalRighe}>
          {scontrino.righe.map(r => (
            <div key={r.id} className={styles.modalRiga}>
              <span>{r.nome}{r.quantita > 1 ? ` ×${r.quantita}` : ''}</span>
              <span>€ {fmt(r.totaleRiga)}</span>
            </div>
          ))}
          <div className={styles.modalTotale}>
            <span>TOTALE</span>
            <span>€ {fmt(scontrino.totale)}</span>
          </div>
        </div>

        <div className={styles.modalIva}>
          {Object.entries(
            scontrino.righe.reduce((acc,r) => {
              const k = String(r.iva)
              acc[k] = (acc[k]||0) + r.totaleRiga
              return acc
            }, {})
          ).map(([iva,imp]) => (
            <div key={iva} className={styles.modalIvaRow}>
              <span>IVA {iva}% su €{fmt(imp)}</span>
              <span>€ {fmt(Math.round(imp * parseInt(iva) / (100 + parseInt(iva))))}</span>
            </div>
          ))}
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalLabel}>Metodo di pagamento</div>
          <div className={styles.metodoGroup}>
            <button className={`${styles.metodoBtn} ${metodo==='carta' ? styles.metodoActive : ''}`} onClick={() => setMetodo('carta')}>
              💳 Carta / POS
            </button>
            <button className={`${styles.metodoBtn} ${metodo==='contanti' ? styles.metodoActive : ''}`} onClick={() => setMetodo('contanti')}>
              💵 Contanti
            </button>
          </div>
          {metodo === 'contanti' && (
            <div className={styles.contantiWrap}>
              <input type="text" inputMode="decimal" placeholder="Importo ricevuto €"
                value={contanti} onChange={e => setContanti(e.target.value)}
                className={styles.contantiInput} autoFocus />
              {contantiCents > 0 && (
                <div className={styles.restoBox}>
                  Resto: <strong>€ {fmt(resto)}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalLabel}>Invia scontrino digitale (opzionale)</div>
          <input type="text" inputMode="email" placeholder="Email o numero di telefono"
            value={datoCliente} onChange={e => setDatoCliente(e.target.value)}
            className={styles.clienteInput} />
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onAnnulla}>
            ← Torna al conto
          </button>
          <button className={styles.inviaBtn} onClick={handleInvia}>
            ✓ Conferma e invia
          </button>
        </div>
      </div>
    </div>
  )
}
