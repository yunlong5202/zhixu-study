import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const normalized=text=>String(text).normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();
export function auditBank({questions,topics,chapters,coverage}){
 const errors=[],warnings=[],ids=new Set(),stems=new Map(),topicMap=new Map(topics.map(t=>[t.id,t]));
 const indexed=questions.filter(q=>q.topicIds?.length),chapterIds=new Set(chapters.map(c=>c.id));
 if(indexed.length<600)errors.push(`考点训练题不足600道：${indexed.length}`);
 if(topics.length<140)errors.push(`细分专题不足140个：${topics.length}`);
 if(topicMap.size!==topics.length)errors.push('知识专题ID重复');
 const answerDistribution=[0,0,0,0];
 for(const q of questions){
  if(ids.has(q.id))errors.push(`重复题目ID ${q.id}`);ids.add(q.id);
  if(!chapterIds.has(q.chapterId))errors.push(`未知章节 ${q.id}`);
  if(q.courseId!=='15042')errors.push(`课程代码错误 ${q.id}`);
  if(!q.stem||!q.explanation)errors.push(`题干或解析缺失 ${q.id}`);
  if([q.stem,q.explanation,q.sampleAnswer,...(q.options||[])].some(t=>typeof t==='string'&&(/\?{3,}|\uFFFD/u.test(t))))errors.push(`题目含编码占位或替换字符 ${q.id}`);
  if(!q.topicIds?.length)continue; // v0.1情境题保留旧ID，单独计数。
  const key=normalized(q.stem);
  if(stems.has(key))errors.push(`重复题干 ${stems.get(key)} / ${q.id}`);else stems.set(key,q.id);
  for(const id of q.topicIds){if(!topicMap.has(id))errors.push(`未知考点 ${q.id} -> ${id}`);else if(topicMap.get(id).chapterId!==q.chapterId)errors.push(`题目与考点跨章 ${q.id} -> ${id}`);}
  if(!['recall','understand','apply'].includes(q.level))errors.push(`能力层次缺失 ${q.id}`);
  if(q.origin!=='original')errors.push(`未标注原创属性 ${q.id}`);
  if(q.type==='single'){
   if(!Array.isArray(q.options)||q.options.length!==4||new Set(q.options.map(normalized)).size!==4)errors.push(`单选选项不完整或重复 ${q.id}`);
   if(!Number.isInteger(q.answer)||q.answer<0||q.answer>3)errors.push(`答案索引错误 ${q.id}`);else answerDistribution[q.answer]++;
  }else if(['short','essay'].includes(q.type)){
   if(!Array.isArray(q.keyPoints)||q.keyPoints.length<2||!q.sampleAnswer)errors.push(`笔试参考要点或答案不足 ${q.id}`);
   if((q.sampleAnswer||'').length<(q.type==='essay'?100:50))warnings.push(`参考作答较短，请人工复核 ${q.id}`);
  }else errors.push(`未知题型 ${q.id}`);
 }
 const topicStats=topics.map(t=>{
  const qs=indexed.filter(q=>q.topicIds.includes(t.id)),single=qs.filter(q=>q.type==='single').length,written=qs.filter(q=>q.type!=='single').length;
  if(!t.summary||!t.commonMistake||!Array.isArray(t.keyPoints)||t.keyPoints.length<2||!t.outlineRef||!t.sourceIds?.length)errors.push(`考点讲解不完整 ${t.id}`);
  if([t.title,t.summary,t.commonMistake,...(t.keyPoints||[])].some(x=>/\?{3,}|\uFFFD/u.test(x)))errors.push(`专题含编码占位或替换字符 ${t.id}`);
  if(single<3||written<1)errors.push(`考点配套题不足(需3单选1书写) ${t.id} -> ${single}/${written}`);
  return {id:t.id,chapterId:t.chapterId,single,written};
 });
 const chapterStats=chapters.map(c=>{
  const qs=indexed.filter(q=>q.chapterId===c.id),ts=topics.filter(t=>t.chapterId===c.id);
  const data={id:c.id,title:c.title,topics:ts.length,questions:qs.length,single:qs.filter(q=>q.type==='single').length,short:qs.filter(q=>q.type==='short').length,essay:qs.filter(q=>q.type==='essay').length,recallSingle:qs.filter(q=>q.type==='single'&&q.level==='recall').length,understandShort:qs.filter(q=>q.type==='short'&&q.level==='understand').length};
  if(data.essay<3||data.recallSingle<8||data.understandShort<3)errors.push(`章节题型或能力池不足 ${c.id}`);
  return data;
 });
 let mappedRequirements=0;const mappedChapters=new Set(),coveredTopicIds=new Set();
 for(const batch of coverage){
  if(!Array.isArray(batch.chapters))errors.push(`覆盖清单缺少chapters ${batch.batch}`);
  for(const c of batch.chapters||[]){
   mappedChapters.add(c.chapterId);
   if(!Number.isInteger(c.pdfPage)||c.pdfPage<1)errors.push(`缺少大纲物理页码 ${c.chapterId}`);
   for(const req of c.requirements||[]){
    mappedRequirements++;
    if(!req.requirement||!req.topicIds?.length)errors.push(`未映射的大纲要求 ${c.chapterId} ${req.requirement}`);
    if(/\?{3,}|\uFFFD/u.test(req.requirement||''))errors.push(`大纲映射含编码占位 ${c.chapterId}`);
    for(const id of req.topicIds||[]){coveredTopicIds.add(id);if(!topicMap.has(id))errors.push(`大纲要求指向不存在考点 ${id}`);else if(topicMap.get(id).chapterId!==c.chapterId)errors.push(`大纲要求指向其他章节 ${id}`);}
    const levelQuestions=indexed.filter(q=>q.level===req.level&&q.topicIds.some(id=>req.topicIds?.includes(id)));
    if(!levelQuestions.length)errors.push(`大纲要求缺少对应能力层次的练习 ${c.chapterId} ${req.requirement}`);
   }
  }
 }
 for(const c of chapters)if(!mappedChapters.has(c.id))errors.push(`章节缺少覆盖映射 ${c.id}`);
 for(const t of topics)if(!t.supplemental&&!coveredTopicIds.has(t.id))warnings.push(`专题未出现在大纲要求映射中 ${t.id}`);
 const totalSingle=answerDistribution.reduce((a,b)=>a+b,0);
 if(answerDistribution.some(n=>n/totalSingle<0.15||n/totalSingle>0.4))errors.push(`正确选项位置分布失衡 ${answerDistribution.join('/')}`);
 return {generatedAt:new Date().toISOString(),scope:'数据结构、题量、稳定ID、重复题干、专题与大纲要求映射审计；不替代人工内容核验',passed:errors.length===0,counts:{questions:questions.length,indexedQuestions:indexed.length,legacyQuestions:questions.length-indexed.length,topics:topics.length,mappedRequirements,single:totalSingle,short:indexed.filter(q=>q.type==='short').length,essay:indexed.filter(q=>q.type==='essay').length},answerDistribution,chapterStats,topicStats,errors,warnings};
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
 const {questions,topics,chapters}=await import('../src/data/curriculum.js');
 const coverage=await Promise.all(['foundations','ethics','law'].map(async batch=>JSON.parse(await readFile(new URL(`../research/coverage-${batch}.json`,import.meta.url),'utf8'))));
 const report=auditBank({questions,topics,chapters,coverage});
 await writeFile(new URL('../research/bank-audit.json',import.meta.url),JSON.stringify(report,null,2));
 const md=`# 15042题库结构与覆盖审计\n\n生成：${report.generatedAt}\n\n${report.scope}\n\n- 题库共${report.counts.questions}题，其中${report.counts.indexedQuestions}道考点训练题，${report.counts.legacyQuestions}道兼容旧ID的情境题。\n- ${report.counts.topics}个专题，映射${report.counts.mappedRequirements}项知识要求。\n- 结构审计：${report.passed?'通过':'未通过'}。\n\n| 单元 | 专题 | 单选 | 简答 | 论述 |\n|---|---:|---:|---:|---:|\n${report.chapterStats.map(c=>`| ${c.title} | ${c.topics} | ${c.single} | ${c.short} | ${c.essay} |`).join('\n')}\n\n## 错误\n\n${report.errors.length?report.errors.map(x=>'- '+x).join('\n'):'无。'}\n\n## 人工核验提示\n\n${report.warnings.length?report.warnings.map(x=>'- '+x).join('\n'):'无结构性提示；答案准确性仍需独立内容审查。'}\n`;
 await writeFile(new URL('../research/bank-audit.md',import.meta.url),md);
 console.log(JSON.stringify({passed:report.passed,counts:report.counts,errors:report.errors,warnings:report.warnings},null,2));
 if(!report.passed)process.exitCode=1;
}
