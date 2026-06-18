import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const router = useRouter()

  // 👉 MOSTRA SOLO SU /ordini
  if (router.pathname !== '/ordini') return null

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()

    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setVisible(false)
    }

    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    <div style={styles.wrapper}>
      <button onClick={handleInstall} style={styles.button}>
        📲 Installa App
      </button>
    </div>
  )
}

const styles = {
  wrapper: {
    position: 'fixed',
    bottom: 20,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 9999
  },
  button: {
    background: 'linear-gradient(135deg, #00e5a0, #00b37a)',
    color: '#0a0e1a',
    border: 'none',
    padding: '14px 22px',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 600,
    fontFamily: "'DM Mono', monospace",
    boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
    cursor: 'pointer'
  }
}