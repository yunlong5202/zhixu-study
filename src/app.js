import { displayedOptions, answerLetter } from './lib/options.js';
import { courses, getCourseData } from './data/catalog.js';
import { STORAGE_KEY, DEFAULT_EXAM_PATTERN, readState, writeState, recordAnswer, toggleFavorite, getStats, getWrongQuestions, getFavoriteQuestions, shuffle, scoreExam, parseBackup, applyExamSelfReview } from './lib/study.js';
import { createBalancedExam, makeStudyTasks } from './lib/preparation.js';
import { knowledgeView, preparationView, dailyTaskPanel } from './views/preparation.js';

const $ = (s) => document.querySelector(s);
const e = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 book:'<path d="M3 4h6a3 3 0 0 1 3 3v14a5 5 0 0 0-5-3H3z"/><path d="M21 4h-6a3 3 0 0 0-3 3v14a5 5 0 0 1 5-3h4z"/>',
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 pen:'<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/><path d="M14 20h7"/>',
 exam:'<rect x="5" y="4" width="15" height="18" rx="2"/><path d="M9 4V2h7v2M9 10h7M9 14h7M9 18h4"/>',
 star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.3-.9z"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 back:'<path d="m14 6-6 6 6 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 shuffle:'<path d="m17 3 4 4-4 4M3 7h3c5 0 7 10 12 10h3m-4 4 4-4-4-4M3 17h3c2 0 3-1 4-3m4-4c1-2 3-3 5-3h2"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 flame:'<path d="M12 3c2 5-1 6 2 9 1-1 2-3 2-5 4 4 5 7 3 11a8 8 0 0 1-14-1c-1-5 3-7 7-14z"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
 list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
 leaf:'<path d="M20 3C10 2 3 6 4 13c1 7 9 8 13 2 2-3 3-8 3-12zM5 20 16 8"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/>',
 chart:'<path d="M4 20h17M7 16v-5M12 16V5M17 16V8"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h3m4 0h3"/>'
};
const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const byId = (id) => questions.find(q => q.id === id);
const chapter = (id) => chapters.find(c => c.id === id);
const selectedCourseKey='zhixu-selected-course';
function localValue(key) { try { return localStorage.getItem(key); } catch { return null; } }
let courseId=courses.find(c=>c.id===localValue(selectedCourseKey)&&c.available)?.id||'15042';
let {course,chapters,questions,sourceInfo,topics}=getCourseData(courseId);
const examPattern=(ex)=>({...DEFAULT_EXAM_PATTERN,...sourceInfo.examPattern,...ex?.pattern});
const essayLabel=(ex)=>examPattern(ex).essayLabel||'论述题';
const typeName = (type) => ({single:'单选题',short:'简答题',essay:essayLabel()}[type]);
const courseStorageKey=()=>courseId==='15042'?STORAGE_KEY:`${STORAGE_KEY}-${courseId}`;
const examStorageKey=()=>courseId==='15042'?'zhixu-active-exam':`zhixu-active-exam-${courseId}`;
const courseStorage={getItem:()=>localStorage.getItem(courseStorageKey()),setItem:(_key,value)=>localStorage.setItem(courseStorageKey(),value)};
const dateKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
let state = readState(courseStorage);
let session = null;
function loadExam() {
 try {
  const ex=JSON.parse(localValue(examStorageKey())||'null');
  if(!ex)return null;
  const p=examPattern(ex);
  if(!Array.isArray(ex.questionIds)||!Number.isFinite(ex.deadline)||!Number.isInteger(ex.index)||ex.index<0||ex.index>=ex.questionIds.length||!['running','submitted'].includes(ex.status)||!Array.isArray(ex.selectedEssayIds)||ex.selectedEssayIds.length>p.essayRequired||new Set(ex.selectedEssayIds).size!==ex.selectedEssayIds.length||ex.selectedEssayIds.some(id=>!ex.essayIds?.includes(id)))throw new Error('Invalid saved exam');
  scoreExam(ex,questions,ex.answers,ex.selfScores,ex.selectedEssayIds.length===p.essayRequired?ex.selectedEssayIds:ex.essayIds.slice(0,p.essayRequired));
  return ex;
 } catch { return null; }
}
let activeExam = loadExam();
let notebookTab='wrong', writingType='all', searchText='', notebookType='all';
let writingChapter='all',writingSearch='';
let topicFilters={chapter:'all',search:'',status:'all',page:1};
const listPages={writing:1,wrong:1,favorites:1};
let toastTimer;
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2800); }
function save() { if(!writeState(state,courseStorage)) toast('本机存储空间不足，请导出学习记录备份'); }
function saveExam() { try { localStorage.setItem(examStorageKey(),JSON.stringify(activeExam)); } catch { toast('考试记录保存失败，请先导出备份'); } }
// A second tab may have submitted, reviewed, or replaced this paper since the
// current tab last rendered. Read its counting receipts before any exam write.
function refreshExamForAction(expectedStatus) {
 const previousId=activeExam?.id,previousIndex=activeExam?.index,latest=loadExam();
 state=readState(courseStorage);activeExam=latest;
 if(previousId!==latest?.id||(expectedStatus&&latest?.status!==expectedStatus)) {
  closeDialog();toast('模拟记录已在其他页面更新，请使用最新记录');
  go(latest?.status==='submitted'?'results':'exams');return false;
 }
 if(latest?.status==='running'&&Number.isInteger(previousIndex))activeExam.index=previousIndex;
 return true;
}
function route() { return (location.hash.slice(1) || 'home').split('/')[0]; }
function go(name) { if(location.hash.slice(1)===name) render(); else location.hash=name; window.scrollTo({top:0,behavior:'instant'}); }
function btn(label, action, cls='primary', attrs='') { return `<button class="button ${cls}" data-action="${action}" ${attrs}>${label}</button>`; }
function textParagraphs(text) { return e(text).split('\n').filter(Boolean).map(t=>`<p>${t}</p>`).join(''); }
function empty(iconName,title,description,action='start-sequence',label='去练几道题') { return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h3>${title}</h3><p>${description}</p>${btn(label,action)}</div>`; }
function shell(content) {
 const r=route(); const nav=[['home','home','学习首页'],['knowledge','book','考点精讲'],['chapters','grid','章节练习'],['writing','pen','笔试训练'],['exams','exam','模拟考试'],['notebook','star','错题 · 收藏']];
 $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar"><a class="brand" href="#home"><span class="brand-mark">${icon('book')}</span><span>知序<span class="brand-sub">自考，让知识有序</span></span></a><div class="sidebar-caption">我的学习空间</div><nav aria-label="主导航">${nav.map(([id,i,t])=>`<a href="#${id}" class="nav-item ${r===id || (id==='exams' && ['exam-run','results'].includes(r)) || (id==='chapters'&&r==='practice')?'active':''}">${icon(i)}<span>${t}</span>${id==='notebook'&&getWrongQuestions(questions,state).length?`<span class="nav-count">${getWrongQuestions(questions,state).length}</span>`:''}</a>`).join('')}</nav><div class="sidebar-note"><span class="tiny-sun">✳</span><p>每一次认真，<br>都算数。</p><span>循序渐进，终有所成</span><div class="note-line"></div></div><button class="sidebar-help" data-action="sources">${icon('help')}题库与使用说明${icon('chevron')}</button><div class="sidebar-version"><span class="status-dot"></span>本机自动保存 <span>v0.3</span></div></aside><div class="workspace"><header class="topbar"><div class="mobile-brand">${icon('book')}知序</div><button class="course-switch" data-action="courses" title="切换课程：${e(course.name)}"><span class="course-dot"></span><span class="course-name">${e(course.name)}</span><span class="course-code">${e(course.id)}</span>${icon('down')}</button><div class="topbar-right"><span class="local-status">${icon('check')}学习记录已保存在本机</span><button class="icon-button" aria-label="学习数据与备份" data-action="settings">${icon('settings')}</button><div class="avatar" title="本机学习者">学</div></div></header><main id="main">${content}</main><footer class="footer"><span>知序自考 <span class="footer-dot">·</span> 一点一滴，学有所成</span><button data-action="sources">原创训练题库 · 查看说明 ${icon('info')}</button></footer></div><nav class="mobile-nav" aria-label="手机导航">${nav.map(([id,i,t])=>`<a href="#${id}" class="${r===id?'active':''}">${icon(i)}<span>${t.replace(' · ','/')}</span></a>`).join('')}</nav></div>`;
}
function heroArt() { return `<svg class="hero-art" viewBox="0 0 400 260" fill="none" aria-hidden="true"><circle cx="285" cy="91" r="65" fill="#ead4c7"/><circle cx="300" cy="67" r="34" fill="#dca58e"/><path d="M60 223h287" stroke="#a79582" stroke-width="1.5"/><g transform="rotate(-7 210 130)"><rect x="124" y="71" width="169" height="137" rx="5" fill="#b84c3d"/><rect x="117" y="64" width="169" height="137" rx="5" fill="#faf6eb" stroke="#4e4a40" stroke-width="1.8"/><path d="M140 65v134" stroke="#d5c7b5"/><path d="M156 91h80M156 104h101M156 117h72" stroke="#b8ad9e" stroke-width="2.5" stroke-linecap="round"/><path d="m158 144 6 6 11-13M158 170l6 6 11-13" stroke="#b84c3d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M185 146h62M185 172h44" stroke="#b8ad9e" stroke-width="2.5" stroke-linecap="round"/><path d="M130 80h-19m19 25h-19m19 25h-19m19 25h-19m19 25h-19" stroke="#595144" stroke-width="3" stroke-linecap="round"/></g><g transform="rotate(24 280 178)"><rect x="273" y="129" width="10" height="98" rx="3" fill="#4f6253"/><path d="m273 227 5 14 5-14" fill="#c2a88c"/><path d="m276 236 2 5 2-5" fill="#4e4a40"/></g><path d="M77 221c0-30 3-47 10-64M81 198c-19 0-25-12-24-21 15 0 24 7 24 21M84 183c16-4 20-17 17-25-16 2-18 15-17 25" fill="#899c83"/><path d="m84 134 4-8m-15 9-7-5m23-6 2-10" stroke="#b84c3d" stroke-width="2" stroke-linecap="round"/><path d="M321 146c10-10 15-4 6 6-7 8-13 10-12 0 2-16 14-16 14-16" stroke="#b84c3d" stroke-width="1.8"/><circle cx="125" cy="40" r="3" fill="#b9957a"/><path d="m240 36 3-7m1 10 7-1" stroke="#bf9c82" stroke-width="1.5"/></svg>`; }
function progressBar(value,total,cls='') { return `<div class="progress ${cls}"><span style="width:${total?Math.min(100,value/total*100):0}%"></span></div>`; }
function chapterRow(c,i,compact=false) {
 const qs=questions.filter(q=>q.chapterId===c.id), done=qs.filter(q=>state.records[q.id]?.attempts>0).length;
 return `<button class="chapter-row ${compact?'compact':''}" data-action="chapter" data-id="${c.id}"><span class="chapter-number">${String(i).padStart(2,'0')}</span><div class="chapter-description"><span class="chapter-eyebrow">${e(c.number)}</span><h3>${e(c.title)}</h3>${compact?'':`<p>${e(c.description)}</p>`}<div class="chapter-progress">${progressBar(done,qs.length)}<span>${done}/${qs.length} 题</span></div></div><span class="chapter-open">${done?'继续练习':'开始练习'}${icon('arrow')}</span></button>`;
}
function renderHome() {
 const s=getStats(state,questions), answered=questions.filter(q=>state.records[q.id]?.attempts>0).length;
 const modes=[['list','顺序练习','从基础开始，逐题掌握','start-sequence','peach'],['shuffle','随机刷题','打破顺序，检验记忆','start-random','sage'],['pen','笔试训练','落笔成答，才算记住','nav-writing','sand'],['exam','模拟考试','限时组卷，熟悉节奏','nav-exams','lavender']];
 shell(`<section class="page-intro"><div><div class="eyebrow"><span class="eyebrow-line"></span>学有所序，日有所进</div><h1>今天，也向上一步<span class="red-dot">。</span></h1><p>把知识点学透，把每一道题答好。</p></div><div class="date-label">${icon('calendar')}${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</div></section><section class="home-grid"><div class="hero"><div class="hero-content"><span class="hero-label">${e(course.name)} <span>${e(course.id)}</span></span><h2>从理解，到会做。<br>再到，写得出来。</h2><p>选择题巩固知识，笔试题练习表达。<br>让每一份努力，都有清晰的方向。</p>${btn(`${state.lastPractice?'继续上次练习':'开始学习'} ${icon('arrow')}`,state.lastPractice?'resume-practice':'start-sequence')}<div class="hero-foot"><span class="status-dot"></span>${questions.length} 道原创训练 · ${chapters.length} 个学习单元</div></div>${heroArt()}</div><div class="daily-card"><div class="card-kicker">${icon('chart')}我的学习足迹</div><div class="daily-big">${s.todayCount}<span>题</span></div><div class="daily-label">今日已完成练习</div><div class="daily-divider"></div><div class="daily-stats"><div><strong>${s.accuracy || s.attempted ? s.accuracy+'%' : '—'}</strong><span>累计正确率</span></div><div><strong>${s.streak}<small> 天</small></strong><span>连续学习</span></div></div><div class="daily-bottom">${icon('leaf')}${s.todayCount?'坚持一点，收获一点。':'不必等状态，开始就很好。'}</div></div></section><section class="mode-grid" aria-label="练习方式">${modes.map(([i,t,d,a,c])=>`<button class="mode-card" data-action="${a}"><span class="mode-icon ${c}">${icon(i)}</span><div><h3>${t}</h3><p>${d}</p></div>${icon('chevron','mode-arrow')}</button>`).join('')}</section>${dailyTaskPanel(viewContext())}<div class="section-heading"><div><h2>按章节，一步一个脚印</h2><p>先建立知识框架，再把薄弱的地方练扎实。</p></div><button class="text-button" data-action="nav-chapters">全部章节 ${icon('arrow')}</button></div><section class="home-lower"><div class="chapter-panel panel"><div class="panel-top"><span>${icon('book')}章节练习</span><span class="muted">已练 ${answered} / ${questions.length} 题</span></div>${chapters.slice(0,4).map((c,i)=>chapterRow(c,i,true)).join('')}<button class="view-all" data-action="nav-chapters">查看全部 ${chapters.length} 个学习单元 ${icon('down')}</button></div><aside class="path-card panel"><div class="path-heading"><span class="tag">复习小建议</span><span class="path-spark">✳</span></div><h2>刷得会，也要写得出。</h2><p class="path-sub">给主观题留一点时间。</p><div class="steps"><div><span>01</span><section><h3>先理解，再做选择</h3><p>把相似概念分清，把关键词记牢。</p></section></div><div><span>02</span><section><h3>合上答案，自己写一遍</h3><p>简答分点写，${essayLabel()}结合知识展开。</p></section></div><div><span>03</span><section><h3>对照要点，回看错题</h3><p>记住为什么错，比多刷一道更有用。</p></section></div></div><button class="text-button" data-action="nav-writing">去练一道笔试题 ${icon('arrow')}</button><div class="path-book">${icon('pen')}认真写下的，更容易留下。</div></aside></section>`);
}
function pageHeading(title,subtitle,eyebrow=`${e(course.name)} · ${e(course.id)}`) { return `<section class="page-intro"><div><div class="eyebrow"><span class="eyebrow-line"></span>${eyebrow}</div><h1>${title}<span class="red-dot">。</span></h1><p>${subtitle}</p></div></section>`; }
function renderChapters() { shell(`${pageHeading('把知识，串成体系','按单元循序练习，选择题与笔试题一起掌握。')}<div class="notice">${icon('info')}按考试大纲的 ${chapters.length} 个学习单元组织；各题均为原创训练内容，配套考点讲解与参考解析。</div><div class="chapter-list panel">${chapters.map((c,i)=>chapterRow(c,i)).join('')}</div>`); }
function filterTabs(current,items,action) { return `<div class="tabs" role="group">${items.map(([key,title])=>`<button class="tab ${current===key?'active':''}" data-action="${action}" data-id="${key}" aria-pressed="${current===key}">${title}</button>`).join('')}</div>`; }
function questionList(qs,mode) {
 if(!qs.length)return '';
 const pages=Math.max(1,Math.ceil(qs.length/12)),page=Math.max(1,Math.min(pages,listPages[mode]||1));listPages[mode]=page;
 return `<div class="question-list">${qs.slice((page-1)*12,page*12).map(q=>`<button class="question-row" data-action="open-question" data-id="${q.id}" data-mode="${mode}"><div class="question-row-top"><span class="type-tag ${q.type}">${typeName(q.type)}</span><span>${e(chapter(q.chapterId)?.title)}</span>${state.favorites.includes(q.id)?icon('star','favorited'):''}</div><h3>${e(q.stem)}</h3><div class="question-row-bottom"><span>${q.type==='single'?'选择作答 · 解析巩固':`${q.keyPoints?.length||0} 个参考要点 · 自主书写`}</span><span>${state.records[q.id]?.lastResult==='correct'?'已掌握 · 再练一次':'开始练习'} ${icon('arrow')}</span></div></button>`).join('')}</div><div class="pagination">${btn(icon('back')+'上一页','list-page','secondary small',`data-mode="${mode}" data-id="${page-1}" ${page===1?'disabled':''}`)}<span>第 ${page}/${pages} 页 · 共 ${qs.length} 题</span>${btn('下一页 '+icon('arrow'),'list-page','secondary small',`data-mode="${mode}" data-id="${page+1}" ${page===pages?'disabled':''}`)}</div>`;
}
const writingMatches=q=>q.type!=='single'&&(writingType==='all'||q.type===writingType)&&(writingChapter==='all'||q.chapterId===writingChapter)&&(!writingSearch||q.stem.includes(writingSearch)||chapter(q.chapterId)?.title.includes(writingSearch));
function renderWriting() {
 const qs=questions.filter(writingMatches);
 shell(`${pageHeading('落笔之后，才算学会','不只认得答案，也要能把答案写出来。')}<div class="writing-banner"><span class="writing-banner-icon">${icon('pen')}</span><div><h3>给自己一次独立作答的机会</h3><p>先列框架、再分点展开，完成后对照参考要点。主观题由你自评，不进行自动判分。</p></div>${btn('随机练一道 '+icon('arrow'),'random-writing','dark')}</div><div class="section-heading"><h2>笔试题库 <span class="count-badge">${questions.filter(q=>q.type!=='single').length}</span></h2>${filterTabs(writingType,[['all','全部笔试'],['short','简答题'],['essay',essayLabel()]],'writing-type')}</div><div class="knowledge-filters writing-filters"><div class="search-box">${icon('search')}<input id="writing-search" aria-label="搜索笔试题" placeholder="搜索题干或章节" value="${e(writingSearch)}"></div><select id="writing-chapter" aria-label="笔试所属章节"><option value="all">全部单元</option>${chapters.map(c=>`<option value="${c.id}" ${writingChapter===c.id?'selected':''}>${e(c.number)} · ${e(c.title)}</option>`).join('')}</select></div><div class="topic-list-summary">共 ${qs.length} 道匹配题目</div>${qs.length?questionList(qs,'writing'):empty('search','没有匹配的笔试题','试试其他关键词、单元或题型。','nav-knowledge','查看考点讲解')}`);
}
function renderNotebook() {
 const wrong=getWrongQuestions(questions,state), favorites=getFavoriteQuestions(questions,state);
 const qs=(notebookTab==='wrong'?wrong:favorites).filter(q=>(notebookType==='all'||q.type===notebookType)&&(!searchText||q.stem.includes(searchText)||chapter(q.chapterId)?.title.includes(searchText)));
 shell(`${pageHeading('回过头，是为了走更远','把错过的练会，把值得记的留下。')}<div class="notebook-toolbar">${filterTabs(notebookTab,[['wrong',`我的错题 ${wrong.length}`],['favorites',`我的收藏 ${favorites.length}`]],'notebook-tab')}<div class="filters"><div class="search-box">${icon('search')}<input id="question-search" aria-label="搜索题目或章节" placeholder="搜索题目或章节" value="${e(searchText)}"></div><select id="notebook-type" aria-label="筛选题型"><option value="all">全部题型</option>${['single','short','essay'].map(t=>`<option value="${t}" ${notebookType===t?'selected':''}>${typeName(t)}</option>`).join('')}</select></div></div>${qs.length?`<div class="list-summary"><span>共 ${qs.length} 题</span>${btn('开始专项练习 '+icon('arrow'),'practice-notebook','small')}</div>${questionList(qs,notebookTab)}`:empty(notebookTab==='wrong'?'check':'star',searchText||notebookType!=='all'?'没有匹配的题目':notebookTab==='wrong'?'暂时还没有错题':'把好题留在这里',searchText||notebookType!=='all'?'试试其他关键词或题型。':notebookTab==='wrong'?'练习中答错或标记“还需巩固”的题目，会自动收进这里。':'练习时点击星标，就可以随时回来复习。')}`);
}
function startPractice(qs,label='顺序练习') {
 if(!qs.length) return toast('当前还没有可练习的题目');
 session={questionIds:qs.map(q=>q.id),index:0,label,answers:{},revealed:{},recorded:{}};
 state.lastPractice={questionIds:session.questionIds,index:0,label}; save(); go('practice');
}
function getSession() {
 if(!session && state.lastPractice?.questionIds?.some(byId)) session={...state.lastPractice,questionIds:state.lastPractice.questionIds.filter(byId),answers:{},revealed:{},recorded:{}};
 if(session) session.index=Math.max(0,Math.min(session.index,session.questionIds.length-1));
 return session;
}
function reference(q) { return `<section class="reference"><div class="reference-heading">${icon('book')}参考${q.type==='single'?'解析':'作答'}<span>原创练习</span></div>${q.type==='single'?`<div class="correct-answer">正确答案 <strong>${answerLetter(q)}</strong></div><p>${e(q.explanation)}</p>`:`<h4>先看要点</h4><ol class="key-points">${(q.keyPoints||[]).map(p=>`<li>${e(p)}</li>`).join('')}</ol><h4>参考表达</h4><div class="sample-answer">${textParagraphs(q.sampleAnswer)}</div><div class="answer-tip">${icon('info')}${e(q.explanation)}</div><p class="self-review-note">参考答案用于学习对照，表达不必逐字相同。请结合教材核对概念与论证。</p>`}</section>`; }
function renderPractice() {
 const s=getSession(); if(!s) { shell(`${pageHeading('开始你的第一次练习','从一道题开始，慢慢积累。')}${empty('book','还没有开始练习','选择章节，或从头顺序练习。')}`); return; }
 const q=byId(s.questionIds[s.index]), revealed=s.revealed[q.id], favorite=state.favorites.includes(q.id), answer=s.answers[q.id];
 shell(`<div class="practice-top"><button class="text-button" data-action="nav-chapters">${icon('back')}返回章节</button><span>${e(s.label)}</span><span>${s.index+1} / ${s.questionIds.length}</span></div><div class="practice-layout"><section class="practice-main"><div class="question-card panel"><div class="question-meta"><span class="type-tag ${q.type}">${typeName(q.type)}</span><span>${e(chapter(q.chapterId)?.number)} · ${e(chapter(q.chapterId)?.title)}</span><button class="favorite-button ${favorite?'favorited':''}" data-action="favorite" data-id="${q.id}" aria-label="${favorite?'取消收藏':'收藏题目'}" aria-pressed="${favorite}">${icon('star')}<span>${favorite?'已收藏':'收藏'}</span></button></div><h2 class="question-stem">${e(q.stem)}</h2>${q.topicIds?.length?`<button class="question-topic-link" data-action="topic-view" data-id="${q.topicIds[0]}">${icon('book')}回看关联考点：${e(topics.find(t=>t.id===q.topicIds[0])?.title)} ${icon('arrow')}</button>`:''}${q.type==='single'?`<div class="options">${displayedOptions(q).map(({text:o,index:i},position)=>`<button class="option ${answer===i?'selected':''} ${revealed&&q.answer===i?'correct':''} ${revealed&&answer===i&&q.answer!==i?'incorrect':''}" data-action="choose" data-id="${i}" ${revealed?'disabled':''}><span class="option-letter">${String.fromCharCode(65+position)}</span><span>${e(o)}</span>${revealed&&q.answer===i?icon('check'):revealed&&answer===i?icon('close'):''}</button>`).join('')}</div>`:`<div class="writing-hint">${icon('pen')}${q.type==='short'?'建议按“（1）（2）（3）”列出要点，再作必要解释。':'先明确观点，再用知识点展开分析；需要时联系实际。'}</div><label class="answer-label" for="practice-answer">我的作答 <span id="word-count">${(state.drafts[q.id]||'').length} 字</span></label><textarea maxlength="50000" id="practice-answer" data-id="${q.id}" placeholder="先独立思考，再把答案写在这里……\n也可以在纸上手写，完成后对照参考答案。" ${revealed?'readonly':''}>${e(state.drafts[q.id]||'')}</textarea><div class="draft-status">${icon('check')}草稿自动保存在本机，也支持在纸上作答后自评</div>`}<div class="question-submit">${revealed?`<span class="answer-state ${q.type==='single'?(answer===q.answer?'good':'bad'):''}">${icon(q.type==='single'?(answer===q.answer?'check':'close'):'pen')}${q.type==='single'?(answer===q.answer?'回答正确，继续保持':'记住这次，下次答对'):s.recorded[q.id]?'已完成本题自评':'请对照要点，完成自评'}</span>`:btn(q.type==='single'?'确认答案':'完成作答，查看参考', 'reveal', 'primary',q.type==='single'&&answer===undefined?'disabled':'')}</div>${revealed?reference(q):''}${revealed&&q.type!=='single'?`<div class="self-assess"><div><h4>这道题，你掌握得怎么样？</h4><p>自评用于安排复习，不等同于正式考试得分。</p></div><div>${btn(icon('shuffle')+'还需巩固','assess-wrong','secondary',s.recorded[q.id]?'disabled':'')}${btn(icon('check')+'已掌握','assess-correct','primary',s.recorded[q.id]?'disabled':'')}</div></div>`:''}</div><div class="question-navigation">${btn(icon('back')+'上一题','previous','secondary',s.index===0?'disabled':'')}<span>理解一步，进步一步</span>${btn(s.index===s.questionIds.length-1?'完成本轮 '+icon('check'):'下一题 '+icon('arrow'),'next','primary')}</div></section><aside class="practice-aside"><section class="panel answer-map"><h3>${icon('grid')}练习进度</h3><div class="map-grid">${s.questionIds.map((id,i)=>`<button data-action="jump" data-id="${i}" class="map-cell ${i===s.index?'current':''} ${state.records[id]?.lastResult==='correct'?'done':state.records[id]?.lastResult==='wrong'?'wrong':''}" aria-label="第${i+1}题">${i+1}</button>`).join('')}</div><div class="map-legend"><span><i class="done"></i>已掌握</span><span><i class="wrong"></i>需巩固</span><span><i></i>未作答</span></div></section><div class="practice-note">${icon('leaf')}不赶进度，先把这一题弄懂。<p>错题会自动收录，答对后移出错题本。</p></div></aside></div>`);
}
function renderExams() {
 const ongoing=activeExam?.status==='running',p=examPattern();
 shell(`${pageHeading('带着把握，走进考场','限时练习，把做题节奏也练熟。')}<section class="exam-intro panel"><div class="exam-illustration">${icon('exam')}<span>练</span></div><div class="exam-info"><span class="tag">限时作答 · 原创练习组卷</span><h2>${e(course.name)} · 模拟训练</h2><p>参照官方样卷题型与题量，分章组卷、优先未见题。提交后核对选择题，并完成笔试自评。</p><div class="exam-metrics"><div><strong>${p.durationMinutes}<small> 分钟</small></strong><span>限时作答</span></div><div><strong>${p.totalPoints}<small> 分</small></strong><span>训练满分</span></div><div><strong>3<small> 类题型</small></strong><span>选择 / 简答 / ${e(essayLabel())}</span></div></div><div class="exam-actions">${btn((ongoing?'继续未完成的模拟':'开始模拟训练')+' '+icon('arrow'),ongoing?'resume-exam':'new-exam')}${activeExam?.status==='submitted'?btn('查看上次报告','show-results','secondary'):''}</div></div></section><div class="exam-details"><section class="panel"><h3>这张卷子，怎么练？</h3><div class="exam-pattern"><div><span class="type-tag single">单选题</span><strong>${p.singleCount} 题 × ${p.singlePoints} 分</strong><p>提交后自动核对</p></div><div><span class="type-tag short">简答题</span><strong>${p.shortCount} 题 × ${p.shortPoints} 分</strong><p>书写作答，对照自评</p></div><div><span class="type-tag essay">${e(essayLabel())}</span><strong>${p.essayOffered>p.essayRequired?`${p.essayOffered} 选 ${p.essayRequired}`:`${p.essayRequired} 题`} × ${p.essayPoints} 分</strong><p>${p.essayOffered>p.essayRequired?`选 ${p.essayRequired} 题独立作答`:'全部作答，对照自评'}</p></div></div><div class="notice small-notice">${icon('info')}${e(p.scoringNote||sourceInfo.note||'题量参照官方样卷，分值用于软件训练；实际要求以当场试卷为准。')}</div></section><section class="panel exam-rules"><h3>开始前，给自己一点准备</h3><p><span>01</span>准备纸笔，也可以直接输入作答。</p><p><span>02</span>计时结束后自动交卷，草稿随写随存。</p><p><span>03</span>主观题参考要点由你自评，报告会标明。</p></section></div><div class="section-heading"><h2>训练记录</h2><span class="muted">最近 ${state.history.length} 次 · ${e(course.shortName||course.name)}</span></div>${state.history.length?`<div class="panel history-list">${[...state.history].reverse().map(h=>{const hp={...p,...h.pattern};return `<div class="history-row"><span class="history-icon">${icon('exam')}</span><div><h3>${e(course.name)} · 模拟训练</h3><p>${new Date(h.createdAt).toLocaleString('zh-CN')} ${h.needsSelfReview?'· 待完成主观题自评':'· 含主观题自评'}</p></div><strong>${h.needsSelfReview?`${h.objectiveScore}<small> / ${hp.singleCount*hp.singlePoints} 客观题</small>`:`${h.total}<small> / ${hp.totalPoints}</small>`}</strong>${activeExam?.id===h.id?btn('查看报告','show-results','ghost'):''}</div>`;}).join('')}</div>`:empty('exam','你的第一场模拟，从这里开始','完成训练后，会在这里记录客观题成绩与主观题自评。','new-exam','开始模拟训练')}`);
}
function examQuestion() { return byId(activeExam.questionIds[activeExam.index]); }
function renderExamRun() {
 if(!activeExam || activeExam.status!=='running') return go(activeExam?'results':'exams');
 const ex=activeExam,q=examQuestion(),p=examPattern(ex),selected=ex.selectedEssayIds.includes(q.id),ans=ex.answers[q.id],canChoose=p.essayOffered>p.essayRequired;
 shell(`<div class="exam-run-heading"><div><span class="eyebrow">模拟训练进行中</span><h2>${e(course.shortName||course.name)} · 模拟训练</h2></div><div class="timer">${icon('clock')}<span id="exam-timer">--:--</span></div>${btn('交卷并核对','submit-exam','primary')}</div><div class="practice-layout"><div><div class="question-card panel"><div class="question-meta"><span class="type-tag ${q.type}">${typeName(q.type)}</span><span>第 ${ex.index+1} / ${ex.questionIds.length} 题 · ${q.type==='single'?p.singlePoints:q.type==='short'?p.shortPoints:p.essayPoints} 分</span><span class="muted push-right">练习分值</span></div>${q.type==='essay'?`<div class="essay-selection"><span>${e(essayLabel(ex))}${canChoose?`提供 ${p.essayOffered} 题，任选 ${p.essayRequired} 题。已选 ${ex.selectedEssayIds.length}/${p.essayRequired} 题。`:`共 ${p.essayRequired} 题，全部作答。`}</span>${canChoose?`<button class="button ${selected?'primary':'secondary'} small" data-action="select-essay" data-id="${q.id}">${selected?icon('check')+'已选此题':'选择此题作答'}</button>`:''}</div>`:''}<h2 class="question-stem">${e(q.stem)}</h2>${q.type==='single'?`<div class="options">${displayedOptions(q).map(({text:o,index:i},position)=>`<button class="option ${ans===i?'selected':''}" data-action="exam-choose" data-id="${i}"><span class="option-letter">${String.fromCharCode(65+position)}</span><span>${e(o)}</span></button>`).join('')}</div>`:`<label class="answer-label" for="exam-answer">我的作答 <span id="word-count">${(ans||'').length} 字</span></label><textarea maxlength="50000" id="exam-answer" data-id="${q.id}" placeholder="在这里分点书写你的答案……" ${q.type==='essay'&&!selected?'disabled':''}>${e(ans||'')}</textarea><div class="draft-status">${icon('check')}已自动保存；${q.type==='essay'&&!selected?'请先选择此题，再开始作答':'交卷前不显示参考答案'}</div>`}</div><div class="question-navigation">${btn(icon('back')+'上一题','exam-previous','secondary',ex.index===0?'disabled':'')}<button class="text-button" data-action="nav-exams">暂时离开（计时继续）</button>${btn(ex.index===ex.questionIds.length-1?'交卷并核对':'下一题 '+icon('arrow'),ex.index===ex.questionIds.length-1?'submit-exam':'exam-next')}</div></div><aside class="practice-aside panel answer-map"><h3>${icon('grid')}答题卡</h3>${[['singleIds','一、单选题'],['shortIds','二、简答题'],['essayIds',`三、${e(essayLabel(ex))}${canChoose?`（选 ${p.essayRequired}）`:'（全部作答）'}`]].map(([key,title])=>`<div class="map-section-title">${title}</div><div class="map-grid">${ex[key].map(id=>{const i=ex.questionIds.indexOf(id);return `<button class="map-cell ${ex.index===i?'current':''} ${ex.answers[id]!==undefined&&ex.answers[id]!==''?'done':''} ${ex.selectedEssayIds.includes(id)?'essay-selected':''}" data-action="exam-jump" data-id="${i}">${i+1}</button>`;}).join('')}</div>`).join('')}<div class="map-legend"><span><i class="done"></i>已作答</span><span><i></i>未作答</span></div><p class="exam-save-tip">练习进度保存在本机。离开页面后计时仍继续。</p></aside></div>`); updateTimer();
}
function newExam() {
 if(!refreshExamForAction())return;
 if(activeExam?.status==='running'){toast('已有未完成的模拟，请先继续并交卷');return go('exam-run');}
 try { const ex=createBalancedExam(questions,chapters,state,Math.random,examPattern()); activeExam={...ex,index:0,answers:{},selfScores:{},selectedEssayIds:examPattern(ex).essayRequired===examPattern(ex).essayOffered?[...ex.essayIds]:[],deadline:Date.now()+ex.durationMinutes*60000,status:'running',statsRecorded:false}; saveExam(); go('exam-run'); } catch(err) { toast(err.message); }
}
function computeScore() { try { return scoreExam(activeExam,questions,activeExam.answers,activeExam.selfScores,activeExam.selectedEssayIds); } catch(err) { console.error(err); return {objectiveScore:0,subjectiveScore:0,total:0,needsSelfReview:true}; } }
function syncHistory() {
 const sc=computeScore(),p=examPattern(activeExam),subjectiveIds=[...activeExam.shortIds,...activeExam.selectedEssayIds];
 const selfReviewSaved=subjectiveIds.length===p.shortCount+p.essayRequired&&subjectiveIds.every(id=>activeExam.savedSelfScores?.[id]===activeExam.selfScores[id]&&activeExam.selfScores[id]!==undefined);
 const row={id:activeExam.id,createdAt:activeExam.createdAt,...sc,pattern:p,bankMode:activeExam.bankMode||'legacy',singleIds:[...activeExam.singleIds],chapterCoverage:activeExam.chapterCoverage||0,selfReviewSaved};
 const i=state.history.findIndex(h=>h.id===row.id);
 if(i>=0)state.history[i]=row;else state.history.push(row);
 state.history=state.history.slice(-20);save();
}
function submitExam(timedOut=false) {
 if(!refreshExamForAction('running'))return;
 const ex=activeExam;if(!ex||ex.status!=='running') return;const p=examPattern(ex);
 if(!timedOut) {
 const selectedIds=[...ex.singleIds,...ex.shortIds,...ex.selectedEssayIds]; const missing=selectedIds.filter(id=>ex.answers[id]===undefined||String(ex.answers[id]).trim()==='').length;
 showDialog(`<div class="dialog-icon">${icon('exam')}</div><h2>准备交卷了吗？</h2><p>${missing?`当前已选题目中还有 ${missing} 题未作答。`:'已完成当前选择的题目。'}${ex.selectedEssayIds.length<p.essayRequired?`${e(essayLabel(ex))}尚未选足 ${p.essayRequired} 道，交卷时会用未选题目补足并按未答处理。`:''}交卷后可查看解析并进行主观题自评。</p><div class="dialog-actions">${btn('继续作答','close-dialog','secondary')}${btn('确认交卷','confirm-submit')}</div>`); return;
 }
 while(ex.selectedEssayIds.length<p.essayRequired) { const id=ex.essayIds.find(id=>!ex.selectedEssayIds.includes(id)); if(!id) break; ex.selectedEssayIds.push(id); }
 ex.status='submitted'; ex.submittedAt=Date.now();
 if(!ex.statsRecorded) {
 for(const id of ex.singleIds) { const q=byId(id); state=recordAnswer(state,id,ex.answers[id]===q.answer,ex.answers[id]??''); }
 ex.statsRecorded=true;
 }
 saveExam(); syncHistory(); closeDialog(); go('results');
}
function renderResults() {
 if(!activeExam||activeExam.status!=='submitted') return go('exams');
 const ex=activeExam,score=computeScore(),p=examPattern(ex),objectiveMax=p.singleCount*p.singlePoints,subjectiveMax=p.shortCount*p.shortPoints+p.essayRequired*p.essayPoints; const subjectiveIds=[...ex.shortIds,...ex.selectedEssayIds];
 shell(`${pageHeading('做完之后，更要复盘','选择题自动核对；主观题对照参考要点，由你给自己评分。',`${e(course.shortName||course.name)} · 模拟训练报告`)}<section class="result-summary panel"><div class="result-score"><span>${score.needsSelfReview?'客观题得分':'本次训练总分'}</span><strong>${score.needsSelfReview?score.objectiveScore:score.total}<small> / ${score.needsSelfReview?objectiveMax:p.totalPoints}</small></strong><span class="tag">${score.needsSelfReview?'等待主观题自评':'包含主观题自主评分'}</span></div><div class="result-copy"><h2>${score.needsSelfReview?'还差最后一步：认真对照答案。':score.total>=p.passingPoints?'把这份积累，带到下一次。':'找到薄弱处，就是下一步的方向。'}</h2><p>客观题 ${score.objectiveScore} / ${objectiveMax} 分 · 主观题 ${score.subjectiveScore} / ${subjectiveMax} 分${score.needsSelfReview?'（未完成自评）':''}</p><p class="muted">训练分数只用于复习参考，主观题自评与正式阅卷可能不同。</p><div class="exam-actions">${btn('返回模拟考试','nav-exams','secondary')}${btn('重新组卷 '+icon('shuffle'),'new-exam')}</div></div></section><div class="section-heading"><h2>主观题对照与自评</h2><span class="muted">简答 ${p.shortCount} 题 · ${e(essayLabel(ex))} ${p.essayRequired} 题</span></div>${ex.legacyReviewOnly||(ex.subjectiveRecorded===true&&!ex.recordedResults)?`<div class="notice">旧版试卷缺少逐题计数凭据，自评仅更新本次成绩；累计练习与错题记录保持原样。请用新的模拟训练继续检查准备情况。</div>`:''}<div class="review-list">${subjectiveIds.map((id,i)=>{const q=byId(id),max=q.type==='short'?p.shortPoints:p.essayPoints;return `<details class="review-item panel" ${i===0?'open':''}><summary><span class="type-tag ${q.type}">${typeName(q.type)}</span><span>${e(q.stem)}</span><span class="review-score">${ex.selfScores[id]===undefined?'待自评':ex.selfScores[id]+' / '+max+' 分'}</span>${icon('down')}</summary><div class="review-body"><h4>我的作答</h4><div class="my-answer">${ex.answers[id]?textParagraphs(ex.answers[id]):'<p class="muted">未输入答案；如果在纸上作答，请对照纸面内容自评。</p>'}</div>${reference(q)}<div class="self-score"><label for="score-${id}">对照要点，给这道题评分</label><select id="score-${id}" data-self-score="${id}"><option value="">请选择（满分 ${max} 分）</option>${Array.from({length:max+1},(_,v)=>`<option value="${v}" ${ex.selfScores[id]===v?'selected':''}>${v} 分</option>`).join('')}</select><span>无答案可记 0 分；分值为训练配置。</span></div></div></details>`;}).join('')}</div><div class="save-review">${btn('保存主观题自评 '+icon('check'),'save-review','primary')}</div><div class="section-heading"><h2>选择题解析</h2><span class="muted">${score.objectiveScore/p.singlePoints} / ${p.singleCount} 题正确</span></div><div class="review-list">${ex.singleIds.map((id,i)=>{const q=byId(id),a=ex.answers[id],correct=a===q.answer;return `<details class="review-item panel"><summary><span class="result-icon ${correct?'good':'bad'}">${icon(correct?'check':'close')}</span><span>${i+1}. ${e(q.stem)}</span><span class="review-score">${correct?'正确':a===undefined?'未作答':'错误'}</span>${icon('down')}</summary><div class="review-body"><div class="review-options">${displayedOptions(q).map(({text:o,index:n},position)=>`<p class="${n===q.answer?'good':''}">${String.fromCharCode(65+position)}. ${e(o)} ${a===n?'（你的选择）':''}</p>`).join('')}</div>${reference(q)}</div></details>`;}).join('')}</div>`);
}
function updateTimer() {
 if(!activeExam||activeExam.status!=='running')return;
 const seconds=Math.max(0,Math.ceil((activeExam.deadline-Date.now())/1000));
 if($('#exam-timer')) { $('#exam-timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; $('#exam-timer').parentElement.classList.toggle('urgent',seconds<300); }
 if(seconds===0) { submitExam(true); toast('训练时间已结束，已自动交卷'); }
}
function showDialog(content) { const d=$('#dialog'); d.innerHTML=`<button class="dialog-close icon-button" aria-label="关闭对话框" data-action="close-dialog">${icon('close')}</button>${content}`; if(!d.open)d.showModal(); }
function closeDialog() { $('#dialog').close(); }
function sourceDialog() {
 const indexed=questions.filter(q=>q.topicIds?.length).length,legacy=questions.length-indexed,p=examPattern();
 showDialog(`<span class="tag">${e(course.shortName||course.name)} · 题库说明</span><h2>明白依据，也明白边界。</h2><p>当前有 ${indexed} 道考点训练题，配套 ${topics.length} 个知识专题${legacy?`；另保留 ${legacy} 道早期情境题，已有记录继续可用`:''}。内容按 ${chapters.length} 个单元组织，覆盖识记、领会与应用训练。</p><ul class="dialog-list"><li>题目、讲解和参考作答由软件编写，不是历年真题、官方评分标准或考题预测。</li><li>知识范围依据本课程全国自考大纲，结合所列参考来源学习，并以适用教材核对具体表述。</li><li>${e(sourceInfo.note)}</li>${p.scoringNote?`<li>${e(p.scoringNote)}</li>`:''}<li>模拟分章抽题并优先未见题；备考检查采用有余量的训练标准，不预测正式成绩。</li><li>主观题先独立写，再对照要点自评；建议结合教材并请老师帮助校正一次表达。</li><li>三门课程的作答、草稿、错题、收藏和模拟分别保存。记录保存在本机浏览器，清理前请分别导出备份。</li></ul><a class="source-link" href="${e(sourceInfo.url)}" target="_blank" rel="noopener noreferrer">${icon('book')}查看官方《${e(course.name)}》考试大纲 ${icon('arrow')}</a><div class="dialog-actions">${btn('知道了','close-dialog')}</div>`);
}
function coursesDialog() {
 showDialog(`<span class="tag">我的课程</span><h2>选好课程，接着学。</h2><p>三门课程各自保留学习记录与模拟考试。切换后可以随时回来继续。</p><div class="course-options">${courses.map(c=>`<button class="course-option ${c.id===courseId?'selected':''}" data-action="select-course" data-id="${e(c.id)}" aria-pressed="${c.id===courseId}" ${c.available?'':'disabled'}><span class="mode-icon ${c.id===courseId?'peach':'sage'}">${icon('book')}</span><div><h3>${e(c.name)}</h3><p>课程代码 ${e(c.id)} · ${c.id===courseId?'正在学习':c.available?'点击切换':'筹备中'}</p></div>${c.id===courseId?icon('check'):icon('chevron')}</button>`).join('')}</div><div class="dialog-actions">${btn('继续学习','close-dialog')}</div>`);
}
function switchCourse(id,confirmed=false) {
 const target=courses.find(c=>c.id===id&&c.available);
 if(!target||id===courseId)return closeDialog();
 if(activeExam?.status==='running'&&!confirmed)return showDialog(`<h2>切换到${e(target.shortName||target.name)}？</h2><p>当前${e(course.shortName||course.name)}模拟尚未交卷，切换后计时仍会继续。返回该课程时可以继续作答；已写内容会保留。</p><div class="dialog-actions">${btn('留在当前课程','close-dialog','secondary')}${btn('保存并切换','confirm-course','primary',`data-id="${e(id)}"`)}</div>`);
 // Every practice/exam edit is already persisted. Rewriting this tab's cached
 // exam here could erase another tab's newer self-review counting receipts.
 courseId=id;({course,chapters,questions,sourceInfo,topics}=getCourseData(id));
 state=readState(courseStorage);session=null;activeExam=loadExam();
 notebookTab='wrong';writingType='all';searchText='';notebookType='all';writingChapter='all';writingSearch='';
 topicFilters={chapter:'all',search:'',status:'all',page:1};Object.keys(listPages).forEach(key=>listPages[key]=1);window.pendingBackup=null;
 try{localStorage.setItem(selectedCourseKey,id);}catch{toast('课程已切换，但浏览器未能记住此次选择');}
 closeDialog();go('home');
}
function settingsDialog() { showDialog(`<span class="tag">学习数据</span><h2>认真积累，记得备份。</h2><p>当前课程：${e(course.name)}（${e(course.id)}）。导出与导入仅针对这一门课程，其他课程的记录单独保存。备份文件可在另一个设备导入。</p><div class="data-actions"><button data-action="export"><span class="mode-icon sage">${icon('download')}</span><div><h3>导出学习记录</h3><p>保存为 JSON 备份文件</p></div>${icon('arrow')}</button><button data-action="import"><span class="mode-icon sand">${icon('upload')}</span><div><h3>导入学习记录</h3><p>选择备份文件，预览后再恢复</p></div>${icon('arrow')}</button></div><p class="muted">当前：已练 ${getStats(state,questions).attempted} 题 · 收藏 ${state.favorites.length} 题。正在进行的模拟考试请在本机完成。</p><input type="file" id="backup-file" accept=".json,application/json" hidden><div class="dialog-actions">${btn('完成','close-dialog')}</div>`); }
const viewContext=()=>({state,questions,topics,chapters,sourceInfo,course,typeName,examPattern:examPattern(),e,icon,btn,pageHeading,progressBar});
function renderKnowledge(){shell(knowledgeView(viewContext(),{...topicFilters,topicId:location.hash.split('/')[1]}));}
function renderPreparation(){shell(preparationView(viewContext()));}
function render() { document.title=`${course.shortName||course.name} · 知序自考`;const r=route(); ({home:renderHome,knowledge:renderKnowledge,preparation:renderPreparation,chapters:renderChapters,writing:renderWriting,exams:renderExams,notebook:renderNotebook,practice:renderPractice,'exam-run':renderExamRun,results:renderResults}[r]||renderHome)(); }
function movePractice(index) { session.index=index; state.lastPractice={questionIds:session.questionIds,index,label:session.label};save();render(); window.scrollTo({top:0,behavior:'instant'}); }

document.addEventListener('click', event=>{
 const el=event.target.closest('[data-action]'); if(!el||el.disabled)return;
 const a=el.dataset.action, id=el.dataset.id;
 if(a.startsWith('nav-')) return go(a.slice(4));
 if(a==='topic-view')return go('knowledge/'+id);
 if(a==='topic-back')return go('knowledge');
 if(a==='topic-page'){topicFilters.page=Number(id);render();return window.scrollTo({top:0,behavior:'instant'});}
 if(a==='list-page'){listPages[el.dataset.mode]=Number(id);render();return window.scrollTo({top:0,behavior:'instant'});}
 if(a==='chapter-topics'){topicFilters={chapter:id,status:'all',search:'',page:1};return go('knowledge');}
 if(a==='topic-single'||a==='topic-written')return startPractice(questions.filter(q=>q.topicIds?.includes(id)&&(a==='topic-single'?q.type==='single':q.type!=='single')),topics.find(t=>t.id===id).title);
 if(a==='topic-question'){const qs=questions.filter(q=>q.topicIds?.includes(el.dataset.topic));startPractice(qs,topics.find(t=>t.id===el.dataset.topic).title);return movePractice(qs.findIndex(q=>q.id===id));}
 if(a.startsWith('task-')){const tasks=makeStudyTasks(questions,topics,state),key=a==='task-review'?'review':a==='task-new'?'newQuestions':'written',qs=tasks[key];if(!qs.length)return toast(key==='review'?'暂时没有到期或薄弱题目，可以先学新考点':'本组任务已完成，可继续考点学习或模拟训练');return startPractice(qs,key==='review'?'到期与错题复习':key==='newQuestions'?'新知识巩固':'每日笔试训练');}
 if(a==='resume-practice') {getSession();return go('practice');}
 if(a==='start-sequence') return startPractice(questions.filter(q=>q.type==='single'),'顺序练习');
 if(a==='start-random') return startPractice(shuffle(questions.filter(q=>q.type==='single')),'随机刷题');
 if(a==='random-writing') return startPractice(shuffle(questions.filter(writingMatches)).slice(0,1),'随机笔试训练');
 if(a==='chapter') { const c=chapter(id); const qs=questions.filter(q=>q.chapterId===id); showDialog(`<span class="tag">${e(c.number)}</span><h2>${e(c.title)}</h2><p>${e(c.description)}</p><div class="chapter-mode-options">${btn(`${icon('list')}选择题练习 · ${qs.filter(q=>q.type==='single').length} 题`,'chapter-single','secondary',`data-id="${id}"`)}${btn(`${icon('pen')}简答与${essayLabel()} · ${qs.filter(q=>q.type!=='single').length} 题`,'chapter-written','secondary',`data-id="${id}"`)}${btn('本章全部练习 '+icon('arrow'),'chapter-all','primary',`data-id="${id}"`)}</div>`);return; }
 if(a.startsWith('chapter-')) {closeDialog(); return startPractice(questions.filter(q=>q.chapterId===id&&(a==='chapter-all'||(a==='chapter-single'?q.type==='single':q.type!=='single'))),chapter(id).title);}
 if(a==='writing-type') {writingType=id;listPages.writing=1;return render();}
 if(a==='notebook-tab') {notebookTab=id;return render();}
 if(a==='open-question') {
 let qs=el.dataset.mode==='writing'?questions.filter(writingMatches):el.dataset.mode==='wrong'?getWrongQuestions(questions,state):getFavoriteQuestions(questions,state);
 if(el.dataset.mode!=='writing')qs=qs.filter(q=>(notebookType==='all'||q.type===notebookType)&&(!searchText||q.stem.includes(searchText)||chapter(q.chapterId)?.title.includes(searchText)));
 startPractice(qs,el.dataset.mode==='writing'?'笔试训练':el.dataset.mode==='wrong'?'错题巩固':'收藏练习'); const i=session.questionIds.indexOf(id);if(i>=0)movePractice(i);return;
 }
 if(a==='practice-notebook')return startPractice((notebookTab==='wrong'?getWrongQuestions(questions,state):getFavoriteQuestions(questions,state)).filter(q=>(notebookType==='all'||q.type===notebookType)&&(!searchText||q.stem.includes(searchText)||chapter(q.chapterId)?.title.includes(searchText))),notebookTab==='wrong'?'错题巩固':'收藏练习');
 if(a==='favorite') {state=toggleFavorite(state,id);save();return render();}
 if(a==='choose') {session.answers[session.questionIds[session.index]]=Number(id);return render();}
 if(a==='reveal') {const q=byId(session.questionIds[session.index]);session.revealed[q.id]=true;if(q.type==='single'&&!session.recorded[q.id]){state=recordAnswer(state,q.id,session.answers[q.id]===q.answer,session.answers[q.id]);session.recorded[q.id]=true;save();}return render();}
 if(a==='assess-wrong'||a==='assess-correct') {const q=byId(session.questionIds[session.index]);if(!session.recorded[q.id]){state=recordAnswer(state,q.id,a==='assess-correct',state.drafts[q.id]||'（纸上作答后自评）');session.recorded[q.id]=true;save();}return render();}
 if(a==='previous')return movePractice(Math.max(0,session.index-1));
 if(a==='jump')return movePractice(Number(id));
 if(a==='next') {if(session.index<session.questionIds.length-1)return movePractice(session.index+1);const count=Object.keys(session.recorded).length;showDialog(`<div class="dialog-icon">${icon('check')}</div><h2>这一轮，辛苦了。</h2><p>本轮共 ${session.questionIds.length} 题，已完成 ${count} 题。未作答的题目可以通过右侧答题卡继续练习。</p><div class="dialog-actions">${btn('继续回看','close-dialog','secondary')}${btn('回到学习首页','finish-practice')}</div>`);return;}
 if(a==='finish-practice'){closeDialog();return go('home');}
 if(a==='sources')return sourceDialog();
 if(a==='courses')return coursesDialog();
 if(a==='select-course')return switchCourse(id);
 if(a==='confirm-course')return switchCourse(id,true);
 if(a==='settings')return settingsDialog();
 if(a==='close-dialog')return closeDialog();
 if(a==='new-exam') {if(!refreshExamForAction())return;if(activeExam?.status==='running'){toast('已有未完成的模拟，请先继续并交卷');return go('exam-run');}if(activeExam?.status==='submitted')return showDialog(`<h2>开始新一轮模拟？</h2><p>新的组卷会替换当前这份详细试卷。上次的成绩摘要会保留，尚未完成的自评请先保存。</p><div class="dialog-actions">${btn('返回报告','close-dialog','secondary')}${btn('确认开始','confirm-new-exam')}</div>`);return newExam();}
 if(a==='confirm-new-exam'){closeDialog();return newExam();}
 if(a==='resume-exam')return go('exam-run');
 if(a==='show-results')return go('results');
 if(a==='exam-choose'){const questionId=activeExam?examQuestion()?.id:null;if(!refreshExamForAction('running'))return;if(!activeExam.singleIds.includes(questionId))return;activeExam.answers[questionId]=Number(id);saveExam();return render();}
 if(a==='select-essay'){if(!refreshExamForAction('running'))return;const p=examPattern(activeExam),ids=activeExam.selectedEssayIds;if(p.essayOffered===p.essayRequired||!activeExam.essayIds.includes(id))return;if(ids.includes(id))activeExam.selectedEssayIds=ids.filter(v=>v!==id);else if(ids.length<p.essayRequired)ids.push(id);else return toast(`已选 ${p.essayRequired} 道${essayLabel(activeExam)}，请先取消其中一道`);saveExam();return render();}
 if(['exam-previous','exam-next','exam-jump'].includes(a)){const currentIndex=activeExam?.index||0;if(!refreshExamForAction('running'))return;activeExam.index=a==='exam-jump'?Number(id):Math.max(0,Math.min(activeExam.questionIds.length-1,currentIndex+(a==='exam-next'?1:-1)));saveExam();render();return window.scrollTo({top:0,behavior:'instant'});}
 if(a==='submit-exam')return submitExam();
 if(a==='confirm-submit')return submitExam(true);
 if(a==='save-review') {if(!refreshExamForAction('submitted'))return;const score=computeScore();if(score.needsSelfReview)return toast(`请为 ${examPattern(activeExam).shortCount} 道简答和 ${examPattern(activeExam).essayRequired} 道${essayLabel(activeExam)}全部完成自评`);const result=applyExamSelfReview(state,activeExam,questions);state=result.state;activeExam.recordedResults=result.recordedResults;activeExam.legacyReviewOnly=!!result.legacyReviewOnly;activeExam.savedSelfScores={...activeExam.selfScores};saveExam();syncHistory();render();toast(result.legacyReviewOnly?'旧版自评分已保存，累计练习记录保持原样':'自评已保存，训练记录和错题本已更新');return;}
 if(a==='export') {const blob=new Blob([JSON.stringify({app:'知序自考',version:1,courseId,courseName:course.name,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`知序-${course.id}-${dateKey()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return toast('学习备份已导出');}
 if(a==='import')return $('#backup-file').click();
 if(a==='confirm-import'){if(window.pendingBackup){state=window.pendingBackup;window.pendingBackup=null;session=null;activeExam=null;saveExam();save();closeDialog();go('home');toast('学习记录已恢复');}return;}
});
function handleInput(event){
 const el=event.target;
 // Replacing a search input while a Chinese IME is composing cancels its
 // candidate session. Filter only after the committed text is available.
 if(event.isComposing&&['question-search','topic-search','writing-search'].includes(el.id))return;
 if(el.id==='practice-answer'){state.drafts[el.dataset.id]=el.value;save();$('#word-count').textContent=`${el.value.length} 字`;}
 if(el.id==='exam-answer'){if(!refreshExamForAction('running'))return;if(![...activeExam.shortIds,...activeExam.selectedEssayIds].includes(el.dataset.id))return;activeExam.answers[el.dataset.id]=el.value;saveExam();$('#word-count').textContent=`${el.value.length} 字`;}
 if(el.id==='question-search'){searchText=el.value;listPages[notebookTab]=1;const caret=el.selectionStart;renderNotebook();const input=$('#question-search');input.focus();input.setSelectionRange(caret,caret);}
 if(el.id==='topic-search'){topicFilters.search=el.value;topicFilters.page=1;const caret=el.selectionStart;renderKnowledge();const input=$('#topic-search');input.focus();input.setSelectionRange(caret,caret);}
 if(el.id==='writing-search'){writingSearch=el.value;listPages.writing=1;const caret=el.selectionStart;renderWriting();const input=$('#writing-search');input.focus();input.setSelectionRange(caret,caret);}
}
document.addEventListener('input',handleInput);
document.addEventListener('compositionend',event=>{
 if(['question-search','topic-search','writing-search'].includes(event.target.id))handleInput(event);
});
document.addEventListener('change',async event=>{
 const el=event.target;
 if(el.id==='notebook-type'){notebookType=el.value;listPages[notebookTab]=1;render();}
 if(el.id==='topic-chapter'){topicFilters.chapter=el.value;topicFilters.page=1;render();}
 if(el.id==='topic-status'){topicFilters.status=el.value;topicFilters.page=1;render();}
 if(el.id==='writing-chapter'){writingChapter=el.value;listPages.writing=1;render();}
 if(el.dataset.selfScore){if(!refreshExamForAction('submitted'))return;const id=el.dataset.selfScore;if(![...activeExam.shortIds,...activeExam.selectedEssayIds].includes(id))return;const expanded=[...document.querySelectorAll('.review-item[open]')].map(d=>d.querySelector('[data-self-score]')?.dataset.selfScore).filter(Boolean);if(el.value==='')delete activeExam.selfScores[id];else activeExam.selfScores[id]=Number(el.value);saveExam();syncHistory();const pos=window.scrollY;renderResults();document.querySelectorAll('.review-item').forEach(d=>{const key=d.querySelector('[data-self-score]')?.dataset.selfScore;if(key)d.open=expanded.includes(key);});window.scrollTo(0,pos);}
 if(el.id==='backup-file'&&el.files[0]){try{if(el.files[0].size>5*1024*1024)throw new Error('备份文件超过 5MB，请选择正确的学习备份');const importingCourse=courseId,text=await el.files[0].text();if(importingCourse!==courseId)return;const backup=JSON.parse(text);if(backup.courseId?backup.courseId!==courseId:courseId!=='15042')throw new Error('这份备份属于其他课程，请先切换到对应课程再导入');window.pendingBackup=parseBackup(text,questions.map(q=>q.id));const s=getStats(window.pendingBackup,questions);showDialog(`<h2>确认恢复这份备份？</h2><p>备份包含 ${s.attempted} 道已练题目、${window.pendingBackup.favorites.length} 道收藏和 ${Object.keys(window.pendingBackup.drafts).length} 份草稿。恢复后会覆盖${e(course.shortName||course.name)}的学习记录，并结束当前本机模拟、清除详细报告。备份中的成绩摘要会恢复。建议先导出当前记录。</p><div class="dialog-actions">${btn('取消','close-dialog','secondary')}${btn('恢复备份','confirm-import')}</div>`);}catch(err){toast(`导入失败：${err.message}`);}}
});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
window.addEventListener('hashchange',render);
window.addEventListener('storage',event=>{
 if(event.key===courseStorageKey()){state=readState(courseStorage);if(!['practice','exam-run'].includes(route()))render();}
 if(event.key===examStorageKey()){
  const previousId=activeExam?.id,previousStatus=activeExam?.status,previousIndex=activeExam?.index;
  activeExam=loadExam();state=readState(courseStorage);
  if(previousId===activeExam?.id&&activeExam?.status==='running'&&Number.isInteger(previousIndex))activeExam.index=previousIndex;
  if(['exam-run','results'].includes(route())&&(previousId!==activeExam?.id||previousStatus!==activeExam?.status)){
   closeDialog();toast('模拟记录已在其他页面更新，已载入最新记录');go(activeExam?.status==='submitted'?'results':'exams');
  }else if(route()==='results')render();
 }
});
setInterval(updateTimer,1000);
render();
