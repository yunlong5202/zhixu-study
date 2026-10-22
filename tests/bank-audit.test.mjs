import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {questions,topics,chapters} from '../src/data/curriculum.js';
import {auditBank} from '../scripts/audit-bank.mjs';
import {createBalancedExam,getPreparationReport} from '../src/lib/preparation.js';
import {createInitialState,recordAnswer} from '../src/lib/study.js';

test('the shipped bank satisfies all syllabus mappings and distinct training pools',async()=>{
  const coverage=await Promise.all(['foundations','ethics','law'].map(async name=>JSON.parse(await readFile(new URL(`../research/coverage-${name}.json`,import.meta.url),'utf8'))));
  const audit=auditBank({questions,topics,chapters,coverage});
  assert.deepEqual(audit.errors,[]);
  assert.equal(audit.passed,true);
  assert.equal(audit.counts.mappedRequirements,239);
});

test('the actual bank can produce broad unseen mocks and reach every training check',()=>{
  let state=createInitialState();
  const first=createBalancedExam(questions,chapters,state,()=>0.2);
  assert.equal(first.chapterCoverage,9);
  for(const id of first.questionIds)state=recordAnswer(state,id,true,'已核对');
  const second=createBalancedExam(questions,chapters,state,()=>0.2);
  assert.equal(second.chapterCoverage,9);
  assert.equal(second.singleIds.some(id=>first.singleIds.includes(id)),false);
  const map=new Map(questions.map(q=>[q.id,q]));
  for(const id of second.singleIds)assert.equal(map.get(id).level,'recall');
  for(const id of second.shortIds)assert.equal(map.get(id).level,'understand');
  for(const id of second.essayIds)assert.equal(map.get(id).level,'apply');
  for(const q of questions)state=recordAnswer(state,q.id,true,q.type==='single'?q.answer:'独立作答后核对');
  state.history=[first,second].map((exam,i)=>({id:exam.id,createdAt:new Date(Date.now()+i).toISOString(),total:80,objectiveScore:44,subjectiveScore:36,needsSelfReview:false,bankMode:'balanced',selfReviewSaved:true,singleIds:exam.singleIds}));
  const report=getPreparationReport(questions,topics,chapters,state);
  assert.equal(report.ready,true);
});
