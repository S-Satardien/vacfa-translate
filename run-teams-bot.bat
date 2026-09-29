@echo off
title VACFA Translate — Teams Bot v2 (Audio Capture)
echo =============================================================================
echo   VACFA Translate — Teams Bot v2
echo   Architecture: WebRTC Audio Capture + Gemini STT + Translation
echo =============================================================================
echo.
echo Starting bot runner...
echo.
node "%~dp0scripts\teams-bot-runner.js" %*
echo.
echo Bot stopped.
pause
