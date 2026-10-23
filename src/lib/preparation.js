import { createExam, getLocalDateKey, shuffle, normalizeExamPattern } from './study.js';

const DAY = 86400000;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const ratio = (n,d) => d ? Math.round(n/d*100) : 0;
const reaches = (n,d,percent) => d > 0 && n * 100 >= d * percent;
const answeredSingle = (q,record) => Number.isInteger(record?.lastAnswer) && record.lastAnswer >= 0 && record.lastAnswer < (q.options?.length || 4);

export function getTopicProgress(topic, questions, state) {
  const related = questions.filter(q => q.topicIds?.includes(topic.id));
  const recorded = related.filter(q => state.records[q.id]?.attempts > 0);
  const completed = recorded.filter(q=>q.type!=='single'||answeredSingle(q,state.records[q.id]));
  const objective = completed.filter(q => q.type === 'single');
  const correct = objective.filter(q => state.records[q.id].lastResult === 'correct');
  const written = completed.filter(q => q.type !== 'single');
  const writtenPassed = written.filter(q => state.records[q.id].lastResult === 'correct');
  const wrong = recorded.filter(q => state.records[q.id].lastResult === 'wrong');
  // Independent questions matter: repeatedly guessing the same answer does not
  // establish coverage, and reading a card alone is never treated as mastery.
  const covered = objective.length >= Math.min(2, related.filter(q=>q.type==='single').length) && objective.length > 0;
  const mastered = correct.length >= 2 && writtenPassed.length >= 1 && wrong.length === 0;
  return {id:topic.id,total:related.length,attempted:completed.length,objectiveCount:objective.length,correctCount:correct.length,writtenCount:written.length,writtenPassed:writtenPassed.length,wrongCount:wrong.length,covered,mastered,status:wrong.length?'weak':mastered?'mastered':completed.length?'learning':'new'};
}

export function getReviewQueue(questions, state, now = new Date()) {
  const time = now.getTime();
  return questions.filter(q => {
    const record=state.records[q.id];
    if(!record) return false;
    if(record.lastResult==='wrong') return true;
    const due=validTime(record.nextReviewAt) ? Date.parse(record.nextReviewAt) : Date.parse(record.updatedAt)+DAY;
    return Number.isFinite(due) && due<=time;
  }).sort((a,b) => {
    const ra=state.records[a.id],rb=state.records[b.id];
    const wrongA=ra.lastResult==='wrong',wrongB=rb.lastResult==='wrong';
    if(wrongA!==wrongB) return wrongA?-1:1;
    return Date.parse(ra.nextReviewAt||ra.updatedAt)-Date.parse(rb.nextReviewAt||rb.updatedAt);
  });
}

export function makeStudyTasks(questions, topics, state, now=new Date()) {
  const progress=topics.map(t=>getTopicProgress(t,questions,state));
  const weakIds=new Set(progress.filter(p=>p.status==='weak').map(p=>p.id));
  const coreIds=new Set(topics.filter(t=>t.importance==='core').map(t=>t.id));
  const due=getReviewQueue(questions,state,now);
  const priority = q => (q.topicIds?.some(id=>weakIds.has(id))?4:0)+(q.topicIds?.some(id=>coreIds.has(id))?2:0);
  const unseen=questions.filter(q=>q.type==='single'&&q.topicIds?.length&&!state.records[q.id]).sort((a,b)=>priority(b)-priority(a));
  const written=questions.filter(q=>q.type!=='single'&&q.topicIds?.length&&state.records[q.id]?.lastResult!=='correct').sort((a,b)=>priority(b)-priority(a));
  return {review:due.slice(0,20),newQuestions:unseen.slice(0,20),written:written.slice(0,3),dueTotal:due.length,unseenTotal:unseen.length,writtenTotal:written.length,day:getLocalDateKey(now)};
}

export function getPreparationReport(questions,topics,chapters,state,now=new Date()) {
  const topicProgress=topics.map(t=>({...getTopicProgress(t,questions,state),chapterId:t.chapterId,importance:t.importance}));
  const core=topicProgress.filter(t=>t.importance==='core');
  const objective=questions.filter(q=>q.type==='single'&&q.topicIds?.length&&state.records[q.id]);
  const objectiveAnswered=objective.filter(q=>answeredSingle(q,state.records[q.id]));
  const objectiveCorrect=objective.filter(q=>state.records[q.id].lastResult==='correct').length;
  const chapterReports=chapters.map(c=>{
    const ts=topicProgress.filter(t=>t.chapterId===c.id);
    const qs=objective.filter(q=>q.chapterId===c.id);
    const answered=qs.filter(q=>answeredSingle(q,state.records[q.id]));
    const essayCount=questions.filter(q=>q.chapterId===c.id&&q.type==='essay'&&state.records[q.id]?.lastResult==='correct').length;
    return {id:c.id,title:c.title,total:ts.length,covered:ts.filter(t=>t.covered).length,mastered:ts.filter(t=>t.mastered).length,weak:ts.filter(t=>t.status==='weak').length,objectiveCount:answered.length,accuracy:ratio(qs.filter(q=>state.records[q.id].lastResult==='correct').length,qs.length),essayCount};
  });
  const recent=[...state.history].filter(h=>!h.needsSelfReview&&Number.isFinite(h.total)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,2);
  const distinctExams=recent.length===2&&recent.every(h=>h.bankMode==='balanced'&&h.total>=75&&h.objectiveScore>=40&&h.selfReviewSaved===true)&&(() => {
    if(!Array.isArray(recent[0].singleIds)||!Array.isArray(recent[1].singleIds))return false;
    return recent[0].singleIds.filter(id=>recent[1].singleIds.includes(id)).length<=10;
  })();
  const coveredCount=topicProgress.filter(t=>t.covered).length;
  const writtenCore=core.filter(t=>t.writtenPassed>0).length;
  const checks=[
    {id:'coverage',title:'考点训练覆盖至少 90%',value:`${coveredCount}/${topics.length} 个考点`,passed:reaches(coveredCount,topics.length,90),description:'每个考点至少独立练过两道选择题；只看讲解不计入。'},
    {id:'objective',title:'选择题掌握达到 85%',value:`${objectiveAnswered.length} 题已练 · ${ratio(objectiveCorrect,objective.length)}% 最近结果正确`,passed:objectiveAnswered.length>=100&&reaches(objectiveCorrect,objective.length,85)&&chapterReports.every(c=>c.objectiveCount>=10),description:'至少实际作答 100 道不同题，每单元至少 10 道；模拟未答按错纳入正确率，但不计考点覆盖或已练题数。门槛按未取整比例判断。'},
    {id:'written',title:'核心考点笔试自评覆盖至少 80%',value:`${writtenCore}/${core.length} 个核心考点 · ${chapterReports.filter(c=>c.essayCount>0).length}/${chapters.length} 单元综合题`,passed:reaches(writtenCore,core.length,80)&&chapterReports.every(c=>c.essayCount>0),description:'先独立写，再对照要点自评；每个单元至少完成一道综合笔试题。自评不能替代老师阅卷。'},
    {id:'exams',title:'两套不同模拟训练均达到 75 分',value:recent.length?recent.map(h=>`${h.total} 分${h.selfReviewSaved?'':'（自评未保存）'}`).join(' / '):'尚未完成模拟',passed:distinctExams,description:'两套均须保存自评、客观题至少 40/50 分，且两套单选重复不超过 10 题。'}
  ];
  return {topicProgress,chapters:chapterReports,totalTopics:topics.length,coveredCount,masteredCount:topicProgress.filter(t=>t.mastered).length,coverage:ratio(coveredCount,topics.length),accuracy:ratio(objectiveCorrect,objective.length),checks,ready:checks.every(c=>c.passed),completedChecks:checks.filter(c=>c.passed).length,reviewDue:getReviewQueue(questions,state,now).length};
}

function balancedPick(pool,count,chapterIds,state,rng) {
  const buckets=new Map(chapterIds.map(id=>[id,[]]));
  for(const q of shuffle(pool,rng)) buckets.get(q.chapterId)?.push(q);
  // Prefer unseen questions within each chapter without losing whole-course
  // coverage. This keeps repeat practice from producing a misleading mock score.
  for(const items of buckets.values()) items.sort((a,b)=>Number(!!state.records[a.id])-Number(!!state.records[b.id]));
  const order=shuffle(chapterIds,rng),picked=[];
  while(picked.length<count) {
    let available=false;
    for(const id of order) {
      if(picked.length===count)break;
      const q=buckets.get(id).shift();
      if(q){picked.push(q);available=true;}
    }
    if(!available)throw new RangeError('当前题库不足以完成分章组卷');
  }
  return picked.map(q=>q.id);
}

export function createBalancedExam(questions, chapters, state, rng=Math.random, configuration) {
  const pattern = normalizeExamPattern(configuration);
  const indexed=questions.filter(q=>q.topicIds?.length);
  if(indexed.length===0) return {...createExam(questions,rng,pattern),bankMode:'legacy'};
  const chapterIds=chapters.map(c=>c.id);
  const forType=(type,level,count)=>{
    const preferred=indexed.filter(q=>q.type===type&&q.level===level);
    const available=preferred.length>=count&&chapterIds.every(id=>type!=='single'||preferred.some(q=>q.chapterId===id))?preferred:indexed.filter(q=>q.type===type);
    return balancedPick(available,count,chapterIds,state,rng);
  };
  const singleIds=forType('single','recall',pattern.singleCount),shortIds=forType('short','understand',pattern.shortCount),essayIds=forType('essay','apply',pattern.essayOffered);
  const all=[...singleIds,...shortIds,...essayIds];
  return {id:globalThis.crypto?.randomUUID?.()||`exam-${Date.now()}-${rng().toString(36).slice(2)}`,createdAt:new Date().toISOString(),questionIds:all,singleIds,shortIds,essayIds,durationMinutes:pattern.durationMinutes,pattern,bankMode:'balanced',chapterCoverage:new Set(singleIds.map(id=>questions.find(q=>q.id===id).chapterId)).size,newQuestionCount:all.filter(id=>!state.records[id]).length};
}
