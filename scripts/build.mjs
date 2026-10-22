import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist'), { recursive:true });
for (const name of ['index.html','src','public']) await cp(resolve(root,name), resolve(root,'dist',name), { recursive:true });
await writeFile(resolve(root,'dist','404.html'), await readFile(resolve(root,'index.html')));
console.log('已生成 dist/，可部署到任意静态网站服务器。');
