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
 function tab(courseId,initialHash='#home'){
  data.set('zhixu-selected-course',courseId);
  const elements=new Map(),events={},windowEvents={},owner={};
  const classes=()=>({add(){},remove(){},toggle(){}});
  const el=id=>elements.get(id)||elements.set(id,{innerHTML:'',textContent:'',open:false,classList:classes(),parentElement:{classList:classes()},addEventListener(){},close(){this.open=false;},showModal(){this.open=true;}}).get(id);
  const location={_hash:initialHash,get hash(){return this._hash;},set hash(value){this._hash=value.startsWith('#')?value:'#'+value;}};
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
   click(action,id,extra={}){const before=location.hash;events.click({target:{closest:()=>({dataset:{action,id,...extra}})}});if(location.hash!==before)run('render();');},
   async score(id,value){await events.change({target:{id:'score-'+id,dataset:{selfScore:id},value:String(value)}});},
   input(id,value,questionId){events.input({target:{id,value,dataset:{id:questionId}}});},
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

const hasPracticeReturn=html=>/class="[^\"]*\bpractice-return\b/.test(html)&&html.includes('返回当前答题');
const practiceSnapshot=tab=>JSON.parse(tab.run('JSON.stringify(session)'));

for(const course of catalog.courses){
 test(`${course.id} returns from a topic to the same unsubmitted choice and practice order after reload`,()=>{
  const data=catalog.getCourseData(course.id),pool=data.questions.filter(q=>q.type==='single');
  const index=pool.findIndex((q,i)=>i>0&&q.topicIds?.length),q=pool[index],choice=(q.answer+1)%q.options.length;
  assert.ok(index>0);
  const b=browser(),a=b.tab(course.id);a.click('start-sequence');a.click('jump',String(index));a.click('choose',String(choice));
  const before=practiceSnapshot(a);
  a.click('topic-view',q.topicIds[0]);assert.ok(hasPracticeReturn(a.element('#app').innerHTML));
  a.click('resume-practice');
  assert.equal(practiceSnapshot(a).index,index);assert.equal(practiceSnapshot(a).answers[q.id],choice);
  assert.deepEqual(practiceSnapshot(a).questionIds,before.questionIds);
  a.click('topic-view',q.topicIds[0]);
  const refreshed=b.tab(course.id,a.run('location.hash'));
  assert.ok(hasPracticeReturn(refreshed.element('#app').innerHTML));refreshed.click('resume-practice');
  const after=practiceSnapshot(refreshed);
  assert.deepEqual(after.questionIds,before.questionIds);assert.equal(after.index,index);assert.equal(after.answers[q.id],choice);
  assert.match(refreshed.element('#app').innerHTML,new RegExp(`class="option selected[^\"]*" data-action="choose" data-id="${choice}"`));
  assert.equal(b.read(stateKey(course.id)).records[q.id],undefined,'reading a topic must not submit the selected answer');
 });
}

test('a submitted practice answer stays revealed after topic reload and is not counted again',()=>{
 const courseId='15042',data=catalog.getCourseData(courseId),pool=data.questions.filter(q=>q.type==='single');
 const index=pool.findIndex((q,i)=>i>0&&q.topicIds?.length),q=pool[index];
 const b=browser(),a=b.tab(courseId);a.click('start-sequence');a.click('jump',String(index));a.click('choose',String(q.answer));a.click('reveal');
 const saved=b.read(stateKey(courseId));assert.equal(saved.records[q.id].attempts,1);
 a.click('topic-view',q.topicIds[0]);const refreshed=b.tab(courseId,a.run('location.hash'));refreshed.click('resume-practice');
 const snapshot=practiceSnapshot(refreshed);assert.equal(snapshot.revealed[q.id],true);assert.equal(snapshot.recorded[q.id],true);
 assert.match(refreshed.element('#app').innerHTML,/回答正确，继续保持/);
 refreshed.click('reveal');
 assert.equal(b.read(stateKey(courseId)).records[q.id].attempts,1);assert.deepEqual(b.read(stateKey(courseId)).daily,saved.daily);
});

test('written practice preserves the draft and pending self review when returning after reload',()=>{
 const courseId='15041',data=catalog.getCourseData(courseId),q=data.questions.filter(q=>q.type!=='single'&&q.topicIds?.length)[1];
 const b=browser(),a=b.tab(courseId),draft='先列观点，再结合材料说明。';
 a.click('open-question',q.id,{mode:'writing'});a.input('practice-answer',draft,q.id);a.click('reveal');
 a.click('topic-view',q.topicIds[0]);const refreshed=b.tab(courseId,a.run('location.hash'));refreshed.click('resume-practice');
 const snapshot=practiceSnapshot(refreshed);
 assert.equal(snapshot.questionIds[snapshot.index],q.id);assert.equal(snapshot.revealed[q.id],true);assert.notEqual(snapshot.recorded[q.id],true);
 assert.equal(refreshed.run(`state.drafts[${JSON.stringify(q.id)}]`),draft);
 assert.match(refreshed.element('#app').innerHTML,/请对照要点，完成自评/);assert.match(refreshed.element('#app').innerHTML,/先列观点，再结合材料说明。/);
 assert.equal(b.read(stateKey(courseId)).records[q.id],undefined);
 refreshed.click('assess-correct');assert.equal(b.read(stateKey(courseId)).records[q.id].attempts,1);
});

test('the knowledge directory offers only an existing practice and follows an explicitly started new round',()=>{
 const courseId='15040',data=catalog.getCourseData(courseId),topic=data.topics[0],b=browser(),a=b.tab(courseId);
 a.click('nav-knowledge');assert.equal(hasPracticeReturn(a.element('#app').innerHTML),false);
 a.click('start-sequence');a.click('jump','2');const old=practiceSnapshot(a);a.click('nav-knowledge');
 assert.ok(hasPracticeReturn(a.element('#app').innerHTML));a.click('resume-practice');assert.equal(practiceSnapshot(a).index,2);
 a.click('nav-knowledge');a.click('topic-view',topic.id);a.click('topic-single',topic.id);
 const fresh=practiceSnapshot(a);assert.equal(fresh.index,0);assert.deepEqual(fresh.answers,{});assert.deepEqual(fresh.revealed,{});assert.deepEqual(fresh.recorded,{});
 assert.notDeepEqual(fresh.questionIds,old.questionIds);
 assert.deepEqual(fresh.questionIds,data.questions.filter(q=>q.type==='single'&&q.topicIds?.includes(topic.id)).map(q=>q.id));
 a.click('nav-knowledge');assert.ok(hasPracticeReturn(a.element('#app').innerHTML));a.click('resume-practice');
 assert.deepEqual(practiceSnapshot(a).questionIds,fresh.questionIds);assert.equal(practiceSnapshot(a).index,0);
});

test('single answer preview needs no selection and preserves selections and learning records',()=>{
 const courseId='15042',data=catalog.getCourseData(courseId),q=data.questions.find(q=>q.type==='single'),b=browser();
 const wrong=data.questions.find(item=>item.type==='single'&&item.id!==q.id);
 const existing=study.recordAnswer(study.createInitialState(),wrong.id,false,(wrong.answer+1)%wrong.options.length,new Date('2026-10-22T08:00:00Z'));
 b.data.set(stateKey(courseId),JSON.stringify(existing));const a=b.tab(courseId);
 a.click('start-sequence');
 const snapshot=practiceSnapshot(a),saved=b.read(stateKey(courseId)),main=a.element('#app').innerHTML;
 a.click('preview-answer');
 assert.equal(a.element('#dialog').open,true);assert.match(a.element('#dialog').innerHTML,/不会计入练习记录/);
 assert.ok(a.element('#dialog').innerHTML.includes(`<strong>${options.answerLetter(q)}</strong>`),'the correct letter follows the displayed option order');
 assert.deepEqual(practiceSnapshot(a),snapshot);assert.deepEqual(b.read(stateKey(courseId)),saved);assert.equal(a.element('#app').innerHTML,main);
 a.click('close-dialog');assert.equal(a.element('#dialog').open,false);
 const chooseButtons=a.element('#app').innerHTML.match(/<button\b[^>]*data-action="choose"[^>]*>/g)||[];
 assert.equal(chooseButtons.length,q.options.length);assert.ok(chooseButtons.every(button=>!button.includes('disabled')));
 const choice=(q.answer+1)%q.options.length;a.click('choose',String(choice));
 const selected=practiceSnapshot(a),selectedState=b.read(stateKey(courseId));
 a.click('preview-answer');a.click('close-dialog');
 assert.deepEqual(practiceSnapshot(a),selected);assert.equal(practiceSnapshot(a).answers[q.id],choice);assert.deepEqual(b.read(stateKey(courseId)),selectedState);
 assert.equal(selectedState.records[q.id],undefined);assert.deepEqual(selectedState.records,saved.records);assert.deepEqual(selectedState.daily,saved.daily);
 assert.equal(selectedState.records[wrong.id].lastResult,'wrong','preview must not clear an existing wrong answer');
});

test('written answer preview preserves an empty or existing draft and leaves it editable',()=>{
 const courseId='15041',data=catalog.getCourseData(courseId),q=data.questions.find(q=>q.type==='essay'),b=browser(),a=b.tab(courseId);
 a.click('open-question',q.id,{mode:'writing'});
 const snapshot=practiceSnapshot(a),empty=b.read(stateKey(courseId));
 a.click('preview-answer');assert.match(a.element('#dialog').innerHTML,/参考作答/);a.click('close-dialog');
 assert.deepEqual(b.read(stateKey(courseId)),empty);assert.deepEqual(practiceSnapshot(a),snapshot);
 const textarea=a.element('#app').innerHTML.match(/<textarea\b[^>]*id="practice-answer"[^>]*>/)?.[0];
 assert.ok(textarea);assert.equal(textarea.includes('readonly'),false);
 a.input('practice-answer','先列答题框架。',q.id);const draft=b.read(stateKey(courseId));
 a.click('preview-answer');a.click('close-dialog');assert.deepEqual(b.read(stateKey(courseId)),draft);
 a.input('practice-answer','保留原观点，再补充材料分析。',q.id);
 assert.equal(b.read(stateKey(courseId)).drafts[q.id],'保留原观点，再补充材料分析。');
 assert.deepEqual(b.read(stateKey(courseId)).records,{});assert.deepEqual(b.read(stateKey(courseId)).daily,{});
 assert.notEqual(practiceSnapshot(a).revealed[q.id],true);assert.notEqual(practiceSnapshot(a).recorded[q.id],true);
});

test('previewing an answer does not replace explicit submission or self assessment',()=>{
 const courseId='15040',data=catalog.getCourseData(courseId),b=browser(),a=b.tab(courseId),single=data.questions.find(q=>q.type==='single');
 a.click('start-sequence');a.click('preview-answer');a.click('close-dialog');
 a.click('choose',String(single.answer));a.click('reveal');a.click('reveal');
 assert.equal(b.read(stateKey(courseId)).records[single.id].attempts,1);
 const written=data.questions.find(q=>q.type==='short');a.click('open-question',written.id,{mode:'writing'});
 a.click('preview-answer');a.click('close-dialog');a.input('practice-answer','按要点独立完成作答。',written.id);a.click('reveal');
 assert.equal(b.read(stateKey(courseId)).records[written.id],undefined,'revealing a written reference still requires an explicit self assessment');
 a.click('assess-correct');a.click('assess-correct');
 const saved=b.read(stateKey(courseId));assert.equal(saved.records[written.id].attempts,1);assert.equal(saved.records[single.id].attempts,1);
 assert.equal(Object.values(saved.daily).reduce((sum,day)=>sum+day.count,0),2);
});

test('answer preview is a practice action and has no entry during a mock exam',()=>{
 const courseId='15041',b=browser(),a=b.tab(courseId);a.click('start-sequence');
 assert.match(a.element('#app').innerHTML,/data-action="preview-answer"/);
 a.click('nav-exams');a.click('new-exam');
 assert.match(a.element('#app').innerHTML,/模拟训练进行中/);assert.doesNotMatch(a.element('#app').innerHTML,/data-action="preview-answer"/);
 assert.equal(a.element('#dialog').open,false);
});
