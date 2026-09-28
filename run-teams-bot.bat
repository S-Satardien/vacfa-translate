@echo off
setlocal
cd /d "%~dp0"
node scripts\teams-bot-runner.js %*
