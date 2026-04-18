@echo off
title DigitalCase - Servizio Stampa
color 0A
cls
echo.
echo  ================================
echo   DIGITALCASE - Servizio Stampa
echo  ================================
echo.
echo  Servizio stampa: http://localhost:3002
echo  Polling Supabase: ogni 5 secondi
echo.
echo  NON CHIUDERE QUESTA FINESTRA!
echo  ================================
echo.

cd /d "%~dp0"

echo  Avvio servizio stampante...
start /b node service.js

timeout /t 1 /nobreak > nul

echo  Avvio polling comande...
start /b node service-polling.js

echo.
echo  Servizi avviati! In attesa di comande...
echo  ================================
echo.
echo  Per fermare: premi Ctrl+C
echo.

:loop
timeout /t 60 /nobreak > nul
goto loop
