import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
async function checkDirectory(path){
 for(const item of await readdir(path,{withFileTypes:true})){
  const full=resolve(path,item.name);
  if(item.isDirectory())await checkDirectory(full);
  else if(item.name.endsWith('.js'))execFileSync(process.execPath,['--check',full],{stdio:'inherit'});
 }
}
await checkDirectory(resolve(root,'src'));
console.log('All application JavaScript files parsed successfully.');
