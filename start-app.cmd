@echo off
setlocal
cd /d "%~dp0app"
echo Building and running PhoneDeck (Windows desktop)
call flutter run -d windows
