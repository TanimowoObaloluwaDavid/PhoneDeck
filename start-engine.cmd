@echo off
setlocal
cd /d "%~dp0"
echo Starting PhoneDeck engine on http://127.0.0.1:8787
node engine\server.mjs
