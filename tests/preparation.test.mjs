import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, recordAnswer, writeState, readState, scoreExam } from '../src/lib/study.js';
import { getTopicProgress, getReviewQueue, makeStudyTasks, getPreparationReport, createBalancedExam } from '../src/lib/preparation.js';

const topics=[{id:'t1',chapterId:'c1',importance:'core'},{id:'t2',chapterId:'c2',importance:'standard'}];
const base=[{id:'s1',chapterId:'c1',topicIds:['t1'],type:'single'},{id:'s2',chapterId:'c1',topicIds:['t1'],type:'single'},{id:'w1',chapterId:'c1',topicIds:['t1'],type:'short'},{id:'s3',chapterId:'c2',topicIds:['t2'],type:'single'}];
const start=new Date('2026-10-20T09:00:00+08:00');

test('topic progress requires different questions and independently reviewed writing',()=>{
  let state=createInitialState();
  state=recordAnswer(state,'s1',true,0,start);
  state=recordAnswer(state,'s1',true,0,start);
  assert.equal(getTopicProgress(topics[0],base,state).covered,false);
  state=recordAnswer(state,'s2',true,0,start);
  assert.equal(getTopicProgress(topics[0],base,state).covered,true);
  assert.equal(getTopicProgress(topics[0],base,state).mastered,false);
  state=recordAnswer(state,'w1',true,'独立书写后对照自评',start);
  assert.equal(getTopicProgress(topics[0],base,state).mastered,true);
  state=recordAnswer(state,'s2',false,2,start);
  assert.equal(getTopicProgress(topics[0],base,state).status,'weak');
});

test('review scheduling spaces correct answers and immediately returns weak questions',()=>{
  let state=recordAnswer(createInitialState(),'s1',true,0,start);
  assert.equal(getReviewQueue(base,state,start).length,0);
  assert.equal(getReviewQueue(base,state,new Date(start.getTime()+86400000)).length,1);
  state=recordAnswer(state,'s1',true,0,new Date(start.getTime()+86400000));
  assert.equal(state.records.s1.correctStreak,2);
  assert.equal(getReviewQueue(base,state,new Date(start.getTime()+2*86400000)).length,0);
  state=recordAnswer(state,'s2',false,2,start);
  assert.equal(getReviewQueue(base,state,start)[0].id,'s2');
  const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};
  writeState(state,storage);
  assert.deepEqual(readState(storage).records.s1,state.records.s1);
});

test('blank submitted mock answers remain due mistakes but never earn practice coverage',()=>{
  let state=createInitialState();
  state=recordAnswer(state,'s1',false,'',start);
  state=recordAnswer(state,'s2',false,'',start);
  const progress=getTopicProgress(topics[0],base,state);
  assert.equal(progress.covered,false);
  assert.equal(progress.objectiveCount,0);
  assert.equal(progress.attempted,0);
  assert.equal(progress.status,'weak');
  assert.equal(getReviewQueue(base,state,start).length,2);
  const report=getPreparationReport(base,topics,[{id:'c1',title:'章1'},{id:'c2',title:'章2'}],state,start);
  assert.equal(report.chapters[0].objectiveCount,0);
  assert.equal(report.chapters[0].accuracy,0);
  assert.equal(report.checks.find(c=>c.id==='objective').passed,false);
});

test('daily tasks prioritize actual weak topics and never treat reading as completion',()=>{
  const state=recordAnswer(createInitialState(),'s1',false,1,start);
  const tasks=makeStudyTasks(base,topics,state,start);
  assert.equal(tasks.review[0].id,'s1');
  assert.equal(tasks.newQuestions[0].id,'s2');
  assert.equal(tasks.written[0].id,'w1');
  const report=getPreparationReport(base,topics,[{id:'c1',title:'章1'},{id:'c2',title:'章2'}],state,start);
  assert.equal(report.ready,false);
  assert.equal(report.checks.every(c=>!c.passed),true);
});

const chapters=Array.from({length:9},(_,i)=>({id:'c'+i,title:'章'+i}));
const bank=chapters.flatMap(c=>[
  ...Array.from({length:12},(_,i)=>({id:`${c.id}-s${i}`,chapterId:c.id,type:'single',topicIds:['t'+c.id],level:'recall',options:['甲','乙','丙','丁'],answer:0})),
  ...Array.from({length:4},(_,i)=>({id:`${c.id}-w${i}`,chapterId:c.id,type:'short',topicIds:['t'+c.id],level:'understand'})),
  ...Array.from({length:3},(_,i)=>({id:`${c.id}-e${i}`,chapterId:c.id,type:'essay',topicIds:['t'+c.id],level:'apply'}))
]);

test('balanced exams cover all chapters, follow training levels, and prefer new questions',()=>{
  const first=createBalancedExam(bank,chapters,createInitialState(),()=>0.3);
  assert.equal(first.chapterCoverage,9);
  assert.equal(first.singleIds.length,25);
  assert.equal(first.shortIds.length,5);
  assert.equal(first.essayIds.length,3);
  assert.equal(new Set(first.questionIds).size,33);
  let state=createInitialState();
  for(const id of first.questionIds)state=recordAnswer(state,id,true,0,start);
  const second=createBalancedExam(bank,chapters,state,()=>0.3);
  assert.equal(second.singleIds.some(id=>first.singleIds.includes(id)),false);
  const answers=Object.fromEntries(second.singleIds.map(id=>[id,0]));
  const essays=second.essayIds.slice(0,2);
  const scores=Object.fromEntries([...second.shortIds,...essays].map(id=>[id,bank.find(q=>q.id===id).type==='short'?6:10]));
  assert.equal(scoreExam(second,bank,answers,scores,essays).total,100);
});

test('readiness does not accept two duplicate papers or unsaved self reviews',()=>{
  const state=createInitialState();
  state.history=[1,2].map((v)=>({id:'e'+v,createdAt:new Date(start.getTime()+v).toISOString(),total:90,objectiveScore:48,subjectiveScore:42,needsSelfReview:false,bankMode:'balanced',selfReviewSaved:true,singleIds:Array.from({length:25},(_,i)=>'s'+i)}));
  let report=getPreparationReport(base,topics,[{id:'c1',title:'章1'}],state,start);
  assert.equal(report.checks.find(c=>c.id==='exams').passed,false);
  state.history[1].singleIds=Array.from({length:25},(_,i)=>'z'+i);
  report=getPreparationReport(base,topics,[{id:'c1',title:'章1'}],state,start);
  assert.equal(report.checks.find(c=>c.id==='exams').passed,true);
  state.history[1].selfReviewSaved=false;
  report=getPreparationReport(base,topics,[{id:'c1',title:'章1'}],state,start);
  assert.equal(report.checks.find(c=>c.id==='exams').passed,false);
});

test('the training checklist can be reached with broad accurate practice and two different completed mocks',()=>{
  const ts=chapters.map(c=>({id:'t'+c.id,chapterId:c.id,importance:'core'}));
  let state=createInitialState();
  for(const q of bank)state=recordAnswer(state,q.id,true,q.type==='single'?0:'先独立作答，再核对要点',start);
  state.history=[0,1].map(v=>({id:'e'+v,createdAt:new Date(start.getTime()+v).toISOString(),total:80,objectiveScore:44,subjectiveScore:36,needsSelfReview:false,bankMode:'balanced',selfReviewSaved:true,singleIds:bank.filter(q=>q.type==='single').slice(v*25,(v+1)*25).map(q=>q.id)}));
  const report=getPreparationReport(bank,ts,chapters,state,start);
  assert.equal(report.ready,true);
  assert.equal(report.completedChecks,4);
});

test('readiness thresholds use exact proportions rather than rounded display percentages',()=>{
  const ts=Array.from({length:162},(_,i)=>({id:'t'+i,chapterId:'c',importance:'core'}));
  const qs=ts.flatMap(t=>[0,1].map(i=>({id:t.id+'s'+i,type:'single',chapterId:'c',topicIds:[t.id]})));
  qs.push(...ts.map(t=>({id:t.id+'w',type:'short',chapterId:'c',topicIds:[t.id]})),{id:'essay',type:'essay',chapterId:'c'});
  let state=createInitialState();
  for(const q of qs.filter(q=>q.type==='single').slice(0,290))state=recordAnswer(state,q.id,true,0,start);
  let report=getPreparationReport(qs,ts,[{id:'c',title:'章'}],state,start);
  assert.equal(report.coverage,90);
  assert.equal(report.checks.find(c=>c.id==='coverage').passed,false);
  state=createInitialState();
  for(const [i,q] of qs.filter(q=>q.type==='single').entries())state=recordAnswer(state,q.id,i<274,0,start);
  for(const q of qs.filter(q=>q.type==='short').slice(0,129))state=recordAnswer(state,q.id,true,'独立作答',start);
  state=recordAnswer(state,'essay',true,'论述自评',start);
  report=getPreparationReport(qs,ts,[{id:'c',title:'章'}],state,start);
  assert.equal(report.accuracy,85);
  assert.equal(report.checks.find(c=>c.id==='objective').passed,false);
  assert.equal(report.checks.find(c=>c.id==='written').passed,false);
});
