@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 20 或更新版本。
  pause
  exit /b 1
)
echo 正在启动知序自考...
echo 请在浏览器中打开 http://127.0.0.1:5173
echo 使用完毕后关闭此窗口即可停止服务。
node scripts\serve.mjs
pause
