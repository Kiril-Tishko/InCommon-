@echo off
REM Runs InCommon on this PC and opens it in your browser.
REM Needs Node.js (https://nodejs.org). Close this window to stop InCommon.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing InCommon the first time. This takes a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run local
pause
