@echo off
setlocal
cd /d "%~dp0"
title VACFA AI Teams Bot Runner
echo =============================================================================
echo   VACFA Translate - Microsoft Teams Bot Runner
echo =============================================================================
echo.
node scripts\teams-bot-runner.js %*
if %errorlevel% neq 0 (
    echo.
    echo [VACFA Bot] Process exited with code %errorlevel%.
    pause
)
