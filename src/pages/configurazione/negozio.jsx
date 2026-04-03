import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import { getNegozio, saveNegozio } from '@/lib/storage'
import styles from '@/styles/Negozio.module.css'

const CAMPI = [
  { key: 'ragioneSociale', label: 'Ragione Sociale', placeholder: 'Es. Bar Centrale di Rossi Mario', icona: '🏪', required: true },
  { key: 'indirizzo',      label: 'Indirizzo',        placeholder: 'Es. Via Dante 12, 20121 Milano', icona: '📍', required: true },
  { key: 'partitaIva',     label: 'Partita IVA',      placeholder: 'Es. IT02341870154',              icona: '🏛️', required: true },
  { key: 'telefono',       label: 'Telefono',          placeholder: 'Es. +39 02 1234567',            icona: '📞', required: false },
  { key: 'sitoWeb',        label: 'Sito Web',          placeholder: 'Es. www.mionegozio.it',         icona: '🌐', required: false },
  { key: 'numeroRt',       label: 'Numero RT',         placeholder: 'Es. EPSR04-00123456',           icona: '🖨️', required: true },
]

export default function NegozioPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    ragioneSociale: '', indirizzo: '', partitaIva: '',
    telefono: '', sitoWeb: '', numeroRt: '',
  })
  const [saved, setSaved] = useState(false)
  const [errori, setErrori] = useState({})

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    if (user?.role !== 'owner') { router.push('/configurazione'); return }
    setForm(getNegozio())
  }, [user, router])

  function valida() {
    const e = {}
    CAMPI.filter(c => c.required).forEach(c => {
      if (!form[c.key]?.trim()) e[c.key] = 'Campo obbligatorio'
    })
    if (form.partitaIva && !/^\d{11}$|^IT\d{11}$/i.test(form.partitaIva.replace(/\s/g,''))) {
      e.partitaIva = 'Formato non valido (11 cifre)'
    }
    return e
  }

  function handleSave() {
    const e = valida()
    if (Object.keys(e).length > 0) { setErrori(e); return }
    saveNegozio(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/configurazione')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          ← Configurazione
        </button>
        <div className={styles.headerTitle}>
          <span>Impostazioni Negozio</span>
          <span className={styles.headerSub}>Dati per intestazione scontrino e email</span>
        </div>
        <button className={styles.saveBtn} onClick={handleSave}>
          {saved ? '✓ Salvato!' : 'Salva'}
        </button>
      </header>

      <div className={styles.content}>

        {/* Anteprima intestazione */}
        <div className={styles.preview}>
          <div className={styles.previewLabel}>ANTEPRIMA INTESTAZIONE SCONTRINO</div>
          <div className={styles.previewBox}>
            {form.ragioneSociale
              ? <div className={styles.previewRagione}>{form.ragioneSociale}</div>
              : <div className={styles.previewPlaceholder}>Ragione Sociale</div>}
            {form.indirizzo && <div className={styles.previewRiga}>{form.indirizzo}</div>}
            {form.partitaIva && <div className={styles.previewRiga}>P.IVA {form.partitaIva}</div>}
            {form.telefono && <div className={styles.previewRiga}>Tel. {form.telefono}</div>}
            {form.sitoWeb && <div className={styles.previewRiga}>{form.sitoWeb}</div>}
            {form.numeroRt && <div className={styles.previewRigaMuted}>RT: {form.numeroRt}</div>}
          </div>
        </div>

        {/* Form campi */}
        <div className={styles.formCard}>
          {CAMPI.map(campo => (
            <div key={campo.key} className={styles.field}>
              <label>
                <span className={styles.fieldIcona}>{campo.icona}</span>
                {campo.label}
                {campo.required && <span className={styles.required}>*</span>}
              </label>
              <input
                type="text"
                placeholder={campo.placeholder}
                value={form[campo.key] || ''}
                onChange={e => {
                  setForm(f => ({ ...f, [campo.key]: e.target.value }))
                  setErrori(ev => ({ ...ev, [campo.key]: '' }))
                }}
                className={errori[campo.key] ? styles.inputError : ''}
              />
              {errori[campo.key] && (
                <div className={styles.errMsg}>{errori[campo.key]}</div>
              )}
            </div>
          ))}
        </div>

        {/* Link a configurazione reparti */}
        <div className={styles.navCards}>
          <button className={styles.navCard} onClick={() => router.push('/configurazione/reparti')}>
            <span>🗂️</span>
            <div>
              <div className={styles.navCardTitle}>Reparti e Prodotti</div>
              <div className={styles.navCardSub}>Gestisci reparti, IVA e prezzi</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

      </div>
    </div>
  )
}
