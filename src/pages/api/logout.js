import { cookieSessioneCancella } from '@/lib/serverAuth'

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Set-Cookie', cookieSessioneCancella())
  return res.status(200).json({ ok: true })
}
