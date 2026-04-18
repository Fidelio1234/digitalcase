#!/bin/bash

clear
echo ""
echo "🧾 DIGITALCASE 🧾"
echo "================================"
echo "🖨️  Sistema Stampa Comande"
echo "================================"
echo ""
echo "📍 Servizio stampa: http://localhost:3002"
echo "🔄 Polling Supabase: ogni 5 secondi"
echo ""
echo "⚠️  NON CHIUDERE QUESTA FINESTRA!"
echo "================================"
echo ""

# Vai nella cartella del progetto
cd "$(dirname "$0")"

echo "🚀 Avvio servizi..."
echo ""

# Avvia service stampante
echo "🖨️  Avvio servizio stampante..."
node service.js &
SERVICE_PID=$!
sleep 1

# Avvia polling
echo "🔄 Avvio polling comande..."
node service-polling.js &
POLLING_PID=$!

echo ""
echo "✅ Servizi avviati!"
echo "⏳ In attesa di comande..."
echo "================================"
echo ""

cleanup() {
    echo "🛑 Fermazione servizi..."
    kill $SERVICE_PID 2>/dev/null
    kill $POLLING_PID 2>/dev/null
    echo "✅ Servizi fermati."
    exit 0
}

trap cleanup SIGINT
wait
