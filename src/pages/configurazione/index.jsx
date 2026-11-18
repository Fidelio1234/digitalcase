import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import styles from '@/styles/Negozio.module.css'
import { applicaTema, temaAttuale } from '@/lib/tema'

function InterruttoreTema() {
  const [chiaro, setChiaro] = useState(false)
  useEffect(() => { setChiaro(temaAttuale() === 'light') }, [])
  function cambia(e) {
    const v = e.target.checked
    setChiaro(v)
    applicaTema(v ? 'light' : 'dark')
  }
  return (
    <label style={{ display:'flex', alignItems:'center', gap:14, marginTop:14, padding:'16px 18px', background:'var(--dc-surface)', border:'1px solid var(--dc-border)', borderRadius:12, cursor:'pointer', color:'var(--dc-text)', fontFamily:"'DM Mono',monospace" }}>
      <span style={{ fontSize:'1.4rem' }}>🌓</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'0.95rem' }}>Tema chiaro</div>
        <div style={{ fontSize:'0.75rem', color:'var(--dc-muted)' }}>Vale solo per questo dispositivo</div>
      </div>
      <input type="checkbox" checked={chiaro} onChange={cambia} style={{ width:24, height:24, accentColor:'var(--dc-verde)' }} />
    </label>
  )
}


export default function ConfigurazioneIndex() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user && !loading) { router.replace('/login'); return }
    if (user?.role !== 'owner') { router.replace('/cassa'); return }
  }, [user, router])

  if (!user) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.replace('/cassa')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Cassa
        </button>
        <div className={styles.headerTitle}>
          <span>Configurazione</span>
          <span className={styles.headerSub}>Impostazioni generali</span>
        </div>
        <div style={{width:90}} />
      </header>

      <div className={styles.content}>
        <div className={styles.navCards}>

<button className={styles.navCard} onClick={() => router.push('/configurazione/reparti')}>
            <span>🗂️</span>
            <div>
              <div className={styles.navCardTitle}>Reparti e Prodotti</div>
              <div className={styles.navCardSub}>Gestisci reparti, IVA e prezzi fissi</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          <button className={styles.navCard} onClick={() => router.push('/configurazione/utenti')}>
            <span>👥</span>
            <div>
              <div className={styles.navCardTitle}>Utenti e PIN</div>
              <div className={styles.navCardSub}>Gestisci cassieri e accessi</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

        </div>

        <InterruttoreTema />
      </div>
    </div>
  )
}
