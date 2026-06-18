import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (!router.asPath.startsWith('/ordini')) return

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [mounted, router.asPath])

  const installApp = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') setVisible(false)
    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      zIndex: 99999
    }}>
      <button onClick={installApp} style={{
        background: '#00e5a0',
        color: '#000',
        padding: '12px 18px',
        borderRadius: 12,
        fontWeight: 600,
        border: 'none'
      }}>
        📲 Installa App
      </button>
    </div>
  )
}