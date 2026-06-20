import Head from 'next/head'

export default function QuizPage() {
  return (
    <>
      <Head>
        <title>Scopri se DigitalCase fa per te — Quiz</title>
        <meta name="description" content="Rispondi a poche domande e scopri come DigitalCase può semplificare la gestione del tuo locale: cassa, comande, magazzino e tavoli in un'unica app." />
        <meta property="og:title" content="Scopri se DigitalCase fa per te" />
        <meta property="og:description" content="Rispondi a poche domande e scopri come DigitalCase può semplificare la gestione del tuo locale." />
        <meta property="og:image" content="https://digitalcase.it/quiz-preview.png" />
        <meta property="og:url" content="https://digitalcase.it/quiz" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Scopri se DigitalCase fa per te" />
        <meta name="twitter:description" content="Rispondi a poche domande e scopri come DigitalCase può semplificare la gestione del tuo locale." />
        <meta name="twitter:image" content="https://digitalcase.it/quiz-preview.png" />
      </Head>
      <iframe
        src="/quiz-bundle.html"
        style={{
          width: '100vw', height: '100vh',
          border: 'none', display: 'block',
        }}
        title="DigitalCase Quiz"
      />
    </>
  )
}