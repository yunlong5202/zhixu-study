import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 5173);
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
server.listen(port, '0.0.0.0', () => console.log(`知序自考已启动: http://localhost:${port}\n手机访问：同一局域网下使用本机IP与端口 ${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
