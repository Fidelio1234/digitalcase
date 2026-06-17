// components/InstallButton.jsx
import React, { useState, useEffect } from 'react';

const InstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      setShowFallback(false);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // TIMER DI FALLBACK: se l'evento non arriva entro 5 secondi...
    const timer = setTimeout(() => {
      if (!isInstallable) {
        setShowFallback(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, [isInstallable]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        console.log('App installata!');
        setIsInstallable(false);
        setShowFallback(false);
      }
      setDeferredPrompt(null);
    }
  };

  // Se è disponibile il prompt standard, lo mostriamo
  if (isInstallable) {
    return (
      <button onClick={handleInstall} style={buttonStyle}>
        📲 Installa DigitalCase
      </button>
    );
  }

  // Se è scattato il fallback, mostriamo un pulsante con le istruzioni
  if (showFallback) {
    return (
      <button 
        onClick={() => {
          alert(
            'Per installare DigitalCase:\n\n' +
            '1. Apri il menu di Chrome (⋮)\n' +
            '2. Seleziona "Installa app" o "Aggiungi alla schermata Home"\n' +
            '3. Segui le istruzioni'
          );
        }} 
        style={{...buttonStyle, backgroundColor: '#ffb830'}}
      >
        📲 Come installare DigitalCase
      </button>
    );
  }

  return null;
};

const buttonStyle = {
  position: 'fixed',
  bottom: '20px',
  left: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: '#00e5a0',
  color: '#0a0e1a',
  border: 'none',
  padding: '12px 24px',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: 'bold',
  cursor: 'pointer',
  zIndex: 1000,
  boxShadow: '0 4px 12px rgba(0,229,160,0.3)',
};

export default InstallButton;