import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {questions,topics} from '../src/data/curriculum.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const files=['foundations','ethics','law','updates'];
const fingerprints=[];
for(const name of files){
  const path=`src/data/banks/${name}.js`,source=await read(path);
  const sha256=createHash('sha256').update(source).digest('hex');
  const review=await read(`research/review-${name}.md`);
  fingerprints.push({path,sha256,reviewMatches:review.includes(sha256)});
}
const samples=[];
for(const name of files.slice(0,3)){
  const data=JSON.parse(await read(`research/sample-validation-${name}.json`));
  samples.push(...(data.items||data.samples));
}
samples.sort((a,b)=>a.sampleNumber-b.sampleNumber);
const sampleSetComplete=samples.length===33&&new Set(samples.map(s=>s.sampleNumber)).size===33&&samples.every((s,i)=>s.sampleNumber===i+1);
const statusCounts={};for(const s of samples)statusCounts[s.status]=(statusCounts[s.status]||0)+1;
const report={generatedAt:new Date().toISOString(),questions:questions.length,indexedQuestions:questions.filter(q=>q.topicIds?.length).length,topics:topics.length,sampleSetComplete,statusCounts,fingerprints,limitations:['原创训练内容，非官方真题或评分细则。','样卷知识支持核查不等于考试作答实验，不推断命中率或通过率。','通过率未做考生群体实测；备考检查是软件训练标准，不能保证个人考试结果。']};
await writeFile(new URL('research/acceptance-report.json',root),JSON.stringify(report,null,2));
await writeFile(new URL('research/acceptance-report.md',root),`# 本轮备考版本验收记录\n\n生成：${report.generatedAt}\n\n- 共 ${report.questions} 道原创题，其中 ${report.indexedQuestions} 道专题训练题；${report.topics} 个专题。\n- 大纲知识要求的结构审计见 bank-audit.md；独立内容审查见 review-foundations.md、review-ethics.md、review-law.md、review-updates.md。\n- 官方参考样卷的 33 个题位检验集${sampleSetComplete?'完整且无重复':'存在缺项或重复'}；支持状态：${Object.entries(statusCounts).map(([k,v])=>`${k} ${v} 项`).join('，')}。版本或范围敏感项须阅读对应 JSON 的证据与限定，不能当作官方答案认定。\n- 软件逻辑复审见 review-software.md；浏览器流程和移动布局记录见 browser-validation.md。\n\n## 内容文件与最终审查指纹\n\n| 文件 | SHA-256 | 审查文档对应 |\n|---|---|---|\n${fingerprints.map(f=>`| ${f.path} | ${f.sha256} | ${f.reviewMatches?'一致':'待更新或复审'} |`).join('\n')}\n\n## 成果边界\n\n${report.limitations.map(s=>'- '+s).join('\n')}\n`);
console.log(JSON.stringify({sampleSetComplete,statusCounts,fingerprints},null,2));
if(!sampleSetComplete||fingerprints.some(f=>!f.reviewMatches))process.exitCode=1;
