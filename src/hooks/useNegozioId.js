import { useNegozio } from '@/context/NegozioContext'
import { NEGOZIO_ID as NEGOZIO_ID_DEFAULT } from '@/lib/config'

export function useNegozioId() {
  const ctx = useNegozio()
  return ctx?.negozio?.id || NEGOZIO_ID_DEFAULT
}
