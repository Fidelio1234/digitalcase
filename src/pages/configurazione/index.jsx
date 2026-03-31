import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/context/AuthContext'
import styles from '@/styles/Negozio.module.css'

export default function ConfigurazioneIndex() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'owner') { router.replace('/cassa'); return }
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
      </div>
    </div>
  )
}
