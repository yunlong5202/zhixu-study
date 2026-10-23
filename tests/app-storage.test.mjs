import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as study from '../src/lib/study.js';
import * as preparation from '../src/lib/preparation.js';
import * as views from '../src/views/preparation.js';
import * as options from '../src/lib/options.js';
import * as catalog from '../src/data/catalog.js';

// Execute the actual app handlers with independent tab memory and shared
// storage. No browser profile, user data, network, or live server is involved.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const stateKey=id=>id==='15042'?study.STORAGE_KEY:`${study.STORAGE_KEY}-${id}`;
const examKey=id=>id==='15042'?'zhixu-active-exam':`zhixu-active-exam-${id}`;

function paper(courseId,status='submitted') {
 const data=catalog.getCourseData(courseId),ex=preparation.createBalancedExam(data.questions,data.chapters,study.createInitialState(),()=>0.31,data.sourceInfo.examPattern);
 const selected=ex.essayIds.slice(0,ex.pattern.essayRequired);
 return {...ex,index:0,status,deadline:Date.now()+ex.durationMinutes*60000,selectedEssayIds:selected,
  answers:Object.fromEntries(ex.singleIds.map(id=>[id,data.questions.find(q=>q.id===id).answer])),
  selfScores:status==='submitted'?Object.fromEntries([...ex.shortIds,...selected].map(id=>[id,data.questions.find(q=>q.id===id).type==='short'?ex.pattern.shortPoints:ex.pattern.essayPoints])):{},
  statsRecorded:status==='submitted'};
}

function browser(deliverEvents=true) {
 const data=new Map(),tabs=[];
 const read=key=>JSON.parse(data.get(key)||'null');
 function tab(courseId){
  data.set('zhixu-selected-course',courseId);
  const elements=new Map(),events={},windowEvents={},owner={};
  const classes=()=>({add(){},remove(){},toggle(){}});
  const el=id=>elements.get(id)||elements.set(id,{innerHTML:'',textContent:'',open:false,classList:classes(),parentElement:{classList:classes()},addEventListener(){},close(){this.open=false;},showModal(){this.open=true;}}).get(id);
  const location={_hash:'#home',get hash(){return this._hash;},set hash(value){this._hash=value.startsWith('#')?value:'#'+value;}};
  const context=vm.createContext({...study,...preparation,...views,...options,...catalog,console,Date,Math,JSON,Object,Array,Set,String,Number,Error,
   localStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>{
    const changed=data.get(key)!==value;data.set(key,value);
    if(changed&&deliverEvents)for(const other of tabs)if(other!==owner)other.windowEvents.storage?.({key});
   }},
   document:{querySelector:el,querySelectorAll:()=>[],addEventListener:(name,callback)=>events[name]=callback,title:''},location,
   window:{addEventListener:(name,callback)=>windowEvents[name]=callback,scrollTo(){},scrollY:0},
   setInterval(){},setTimeout(){},clearTimeout(){}});
  const run=code=>vm.runInContext(code,context);
  Object.assign(owner,{windowEvents,run});tabs.push(owner);run(source);
  return {run,element:el,
   click(action,id){events.click({target:{closest:()=>({dataset:{action,id}})}});run('render();');},
   async score(id,value){await events.change({target:{id:'score-'+id,dataset:{selfScore:id},value:String(value)}});},
  };
 }
 return {data,read,tab,seed(id,ex,state=study.createInitialState()){data.set(examKey(id),JSON.stringify(ex));data.set(stateKey(id),JSON.stringify(state));}};
}

test('two tabs save and revise one self review without counting another attempt',async()=>{
 for(const deliverEvents of [true,false]){
  const b=browser(deliverEvents),ex=paper('15040'),id=ex.shortIds[0];ex.selfScores[id]=0;b.seed('15040',ex);
  const a=b.tab('15040'),other=b.tab('15040');
  a.click('save-review');
  const initial=b.read(stateKey('15040'));
  assert.equal(initial.records[id].attempts,1);assert.equal(initial.records[id].wrong,1);
  // A score change writes the exam before the Save button is clicked. It must
  // retain the first tab's receipt rather than reintroducing an empty receipt.
  await other.score(id,6);
  assert.equal(b.read(examKey('15040')).recordedResults[id].result,false);
  other.click('save-review');a.click('save-review');
  const revised=b.read(stateKey('15040'));
  assert.equal(revised.records[id].attempts,1);assert.equal(revised.records[id].correct,1);assert.equal(revised.records[id].wrong,0);
  assert.deepEqual(revised.daily,initial.daily);assert.equal(Object.keys(revised.records).length,6);
  await a.score(id,0);a.click('save-review');
  const reversed=b.read(stateKey('15040'));
  assert.equal(reversed.records[id].attempts,1);assert.equal(reversed.records[id].wrong,1);assert.deepEqual(reversed.daily,initial.daily);
 }
});

test('two tabs confirming one running exam record objective answers only once',()=>{
 for(const deliverEvents of [true,false]){
  const b=browser(deliverEvents),ex=paper('15041','running');b.seed('15041',ex);
  const a=b.tab('15041'),other=b.tab('15041');
  a.click('submit-exam');other.click('submit-exam');a.click('confirm-submit');other.click('confirm-submit');
  const state=b.read(stateKey('15041'));
  assert.equal(b.read(examKey('15041')).status,'submitted');assert.equal(state.history.length,1);
  assert.equal(Object.keys(state.records).length,25);
  assert.ok(Object.values(state.records).every(record=>record.attempts===1));
  assert.equal(Object.values(state.daily).reduce((sum,day)=>sum+day.count,0),25);
 }
});

test('a stale tab cannot overwrite or revive a paper replaced in another tab',async()=>{
 const b=browser(false),ex=paper('15040');b.seed('15040',ex);
 const a=b.tab('15040'),other=b.tab('15040');
 a.click('new-exam');a.click('confirm-new-exam');
 const replacement=b.read(examKey('15040'));assert.notEqual(replacement.id,ex.id);
 await other.score(ex.shortIds[0],0);other.click('save-review');other.click('select-course','15041');
 assert.equal(b.read(examKey('15040')).id,replacement.id);
 assert.deepEqual(b.read(examKey('15040')).selfScores,{});
 assert.equal(Object.keys(b.read(stateKey('15040')).records).length,0);
 assert.match(other.element('#toast').textContent,/其他页面更新/);
});

test('legacy 15042 receipts and a second course stay independent across tabs',()=>{
 const b=browser(),old=paper('15042'),modern=paper('15041');delete old.pattern;old.subjectiveRecorded=true;
 const legacyIds=[...old.shortIds,...old.selectedEssayIds];let legacyState=study.createInitialState();
 for(const id of legacyIds)legacyState=study.recordAnswer(legacyState,id,true,'written on paper',new Date('2026-10-22T08:00:00Z'));
 legacyState=study.toggleFavorite(legacyState,old.singleIds[0]);legacyState.drafts[old.shortIds[0]]='old draft';
 b.seed('15042',old,legacyState);b.seed('15041',modern);
 const a=b.tab('15042'),other=b.tab('15041');a.click('save-review');other.click('save-review');
 assert.deepEqual(b.read(stateKey('15042')).records,legacyState.records);
 assert.deepEqual(b.read(stateKey('15042')).daily,legacyState.daily);
 assert.deepEqual(b.read(stateKey('15042')).favorites,legacyState.favorites);
 assert.deepEqual(b.read(stateKey('15042')).drafts,legacyState.drafts);
 const modernState=b.read(stateKey('15041'));assert.equal(Object.keys(modernState.records).length,6);
 assert.ok(Object.keys(modernState.records).every(id=>id.startsWith('mg-')));
 assert.equal(b.read(examKey('15042')).id,old.id);assert.equal(b.read(examKey('15041')).id,modern.id);
 assert.equal(b.read(stateKey('15042')).history[0].total,100);
});
