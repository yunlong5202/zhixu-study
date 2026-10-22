import {readFile,writeFile} from 'node:fs/promises';
import {updateSources} from '../src/data/banks/updates.js';
const references=new Map();
for(const batch of ['foundations','ethics','law']){
 const data=JSON.parse(await readFile(new URL(`../research/coverage-${batch}.json`,import.meta.url),'utf8'));
 for(const source of data.sources||[])if(source.id&&source.url)references.set(source.id,{...source,verifiedAt:source.verifiedAt||data.reviewedAt||data.verifiedAt||'2026-10-22'});
}
for(const source of updateSources)references.set(source.id,source);
await writeFile(new URL('../src/data/sources.js',import.meta.url),'// Generated from the checked research source ledger.\nexport const references = '+JSON.stringify([...references.values()],null,2)+';\n');
console.log(`Synchronized ${references.size} source records.`);
