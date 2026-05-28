import { exec } from 'child_process'
import os from 'os'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost'
  if (!isLocal) return res.status(403).json({ error: 'Forbidden' })

  res.status(200).json({ ok: true })

  setTimeout(() => {
    const platform = os.platform()
    let cmd

    if (platform === 'win32') {
      cmd = 'shutdown /s /t 3'
    } else if (platform === 'darwin') {
      cmd = 'osascript -e \'tell app "System Events" to shut down\''
    } else {
      // Linux
      cmd = 'shutdown -h now'
    }

    exec(cmd, (err) => {
      if (err) console.error('Shutdown error:', err)
    })
  }, 500)
}