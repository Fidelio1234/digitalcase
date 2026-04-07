export default function Debug() {
  return (
    <div style={{padding:20, fontFamily:'monospace', background:'#000', color:'#0f0', minHeight:'100vh'}}>
      <h2>Debug ENV</h2>
      <p>NEGOZIO_ID: {process.env.NEXT_PUBLIC_NEGOZIO_ID || 'NON TROVATO'}</p>
      <p>SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL || 'NON TROVATO'}</p>
    </div>
  )
}
