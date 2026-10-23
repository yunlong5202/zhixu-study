import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error('请先安装 Node.js 20 或更新版本，然后重新启动。');
  process.exit(1);
}
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必须是 1 到 65535 之间的整数，默认端口为 5173。');
  process.exit(1);
}
const url = `http://127.0.0.1:${port}`;
const autoOpen = process.argv.includes('--open');
function openBrowser() {
  const [command, args] = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/c', 'start', url]]
    : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  const browser = spawn(command, args, { stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log(`请在浏览器中打开 ${url}`));
  browser.on('exit', code => { if (code) console.log(`请在浏览器中打开 ${url}`); });
}
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    const publicFile = file === resolve(root, 'index.html') || ['src','public'].some(dir => file.startsWith(resolve(root,dir) + sep));
    if (!file.startsWith(root + sep) || !publicFile || !(await stat(file)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    if (autoOpen) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        const expected = await readFile(resolve(root, 'index.html'), 'utf8');
        if (response.ok && await response.text() === expected) {
          console.log(`知序自考已经在运行，正在打开 ${url}`);
          openBrowser();
          return;
        }
      } catch {}
    }
    console.error(`端口 ${port} 已被占用。请关闭原来的启动窗口或占用端口的程序后重试。`);
  } else {
    console.error(`启动失败：${error.message}`);
  }
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  console.log(`知序自考已启动: ${url}\n请保留此窗口，关闭窗口即可停止服务。\n手机访问：同一局域网下使用本机 IP 与端口 ${port}`);
  if (autoOpen) openBrowser();
});
