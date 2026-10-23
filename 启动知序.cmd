@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 goto missing_node
node.exe "%~dp0scripts\serve.mjs" --open
if errorlevel 1 goto failed
exit /b 0

:missing_node
echo Node.js 20 or newer is required. Download: https://nodejs.org/
echo Install Node.js, then double-click this file again.
pause
exit /b 1

:failed
echo Startup failed. See the message above.
pause
exit /b 1
