import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, createInitialState, readState, writeState, recordAnswer,
  toggleFavorite, getStats, getWrongQuestions, getFavoriteQuestions,
  shuffle, createExam, scoreExam, applyExamSelfReview, parseBackup, getLocalDateKey,
} from '../src/lib/study.js';

const fixture = () => [
  ...Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, type: 'single', options: ['甲', '乙', '丙', '丁'], answer: index % 4 })),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `b${index}`, type: 'short' })),
  ...Array.from({ length: 6 }, (_, index) => ({ id: `e${index}`, type: 'essay' })),
];
const fixedRng = () => 0.5;
const fixedDate = new Date(2026, 9, 22, 12, 30);
const examSummary = () => ({ id: 'exam-1', createdAt: fixedDate.toISOString(), objectiveScore: 30, subjectiveScore: 18, total: 48, maxScore: 100, answeredCount: 27, needsSelfReview: true });

test('initial state and state updates are independent, pure, and use local dates', () => {
  const initial = createInitialState();
  const next = recordAnswer(initial, 's0', false, 2, fixedDate);
  const corrected = recordAnswer(next, 's0', true, 0, fixedDate);
  assert.deepEqual(initial, createInitialState());
  assert.equal(next.records.s0.attempts, 1);
  assert.deepEqual(corrected.records.s0, { attempts: 2, correct: 1, wrong: 1, lastResult: 'correct', lastAnswer: 0, updatedAt: fixedDate.toISOString(),correctStreak:1,nextReviewAt:new Date(fixedDate.getTime()+86400000).toISOString() });
  assert.equal(corrected.daily['2026-10-22'].count, 2);
  assert.deepEqual(corrected.history, []);
  assert.equal(corrected.lastPractice, null);
  assert.equal(getLocalDateKey(fixedDate), '2026-10-22');
  assert.throws(() => recordAnswer(initial, '__proto__', true, 0));
  assert.throws(() => recordAnswer(initial, 's0', true, 0, new Date('bad')));
});

test('answer recording preserves exam summaries and an independent practice cursor', () => {
  const state = createInitialState();
  state.history.push(examSummary());
  state.lastPractice = { questionIds: ['s0', 's1'], index: 1, label: '顺序练习' };
  const next = recordAnswer(state, 's0', true, 0, fixedDate);
  assert.deepEqual(next.history, state.history);
  assert.deepEqual(next.lastPractice, state.lastPractice);
  next.lastPractice.questionIds.push('s2');
  next.history[0].total = 0;
  assert.deepEqual(state.lastPractice.questionIds, ['s0', 's1']);
  assert.equal(state.history[0].total, 48);
});

test('favorites and current wrong answers reflect the latest attempt', () => {
  const questions = fixture();
  let state = recordAnswer(createInitialState(), 's0', false, 1, fixedDate);
  state = recordAnswer(state, 's1', false, 0, fixedDate);
  state = recordAnswer(state, 's0', true, 0, fixedDate);
  const favorite = toggleFavorite(state, 's0');
  assert.deepEqual(state.favorites, []);
  assert.deepEqual(getFavoriteQuestions(questions, favorite).map((question) => question.id), ['s0']);
  assert.deepEqual(toggleFavorite(favorite, 's0').favorites, []);
  assert.deepEqual(getWrongQuestions(questions, state).map((question) => question.id), ['s1']);
  assert.deepEqual(getStats(state, questions, fixedDate), { attempted: 2, correct: 1, wrong: 2, accuracy: 33, mastered: 1, todayCount: 3, streak: 1 });
});

test('statistics count completed calendar days across a month boundary', () => {
  const state = createInitialState();
  state.daily = { '2026-09-29': { count: 1, minutes: 2 }, '2026-09-30': { count: 2, minutes: 3 } };
  assert.equal(getStats(state, [], new Date(2026, 9, 1)).streak, 2);
  assert.equal(getStats(state, [], new Date(2026, 9, 2)).streak, 0);
  assert.equal(getStats(state, [], new Date(2026, 9, 1)).todayCount, 0);
});

test('storage failures and corrupt data do not crash or overwrite stored content', () => {
  let writes = 0;
  const badStorage = { getItem: () => '{broken', setItem: () => { writes += 1; } };
  assert.deepEqual(readState(badStorage), createInitialState());
  assert.equal(writes, 0);
  assert.deepEqual(readState({ getItem: () => { throw new Error('disabled'); } }), createInitialState());
  assert.equal(writeState(createInitialState(), { setItem: () => { throw new Error('full'); } }), false);
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const state = recordAnswer(createInitialState(), 's0', true, 0, fixedDate);
  assert.equal(writeState(state, storage), true);
  assert.ok(data.has(STORAGE_KEY));
  assert.deepEqual(readState(storage), state);
  const partial = { ...state, favorites: ['s0', 's0', null], drafts: { s0: '草稿', bad: 42 }, daily: { '2026-02-30': { count: 1, minutes: 0 } } };
  const recovered = readState({ getItem: () => JSON.stringify(partial) });
  assert.deepEqual(recovered.favorites, ['s0']);
  assert.deepEqual(recovered.drafts, { s0: '草稿' });
  assert.deepEqual(recovered.daily, {});
  assert.equal(recovered.records.s0.correct, 1);
});

test('shuffle is deterministic with injected RNG and never mutates its input', () => {
  const input = [1, 2, 3, 4];
  assert.deepEqual(shuffle(input, () => 0), [2, 3, 4, 1]);
  assert.deepEqual(input, [1, 2, 3, 4]);
  assert.throws(() => shuffle(input, () => 1), RangeError);
  assert.throws(() => shuffle(input, () => -0.1), RangeError);
});

test('exam creation samples each required type without duplicates', () => {
  const questions = fixture();
  const exam = createExam(questions, fixedRng);
  assert.equal(exam.singleIds.length, 25);
  assert.equal(exam.shortIds.length, 5);
  assert.equal(exam.essayIds.length, 3);
  assert.equal(new Set(exam.questionIds).size, 33);
  assert.equal(exam.durationMinutes, 150);
  assert.equal(questions.length, 44);
  assert.throws(() => createExam(questions.filter((question) => question.type !== 'short')), RangeError);
  assert.throws(() => createExam([...questions, questions[0]]), /重复/);
});

test('complete objective and self-reviewed written exam scores exactly 100', () => {
  const questions = fixture();
  const exam = createExam(questions, fixedRng);
  const selected = exam.essayIds.slice(0, 2);
  const answers = Object.fromEntries(exam.singleIds.map((id) => [id, questions.find((question) => question.id === id).answer]));
  const selfScores = {};
  for (const id of [...exam.shortIds, ...selected]) {
    answers[id] = '这是我的笔试答案';
    selfScores[id] = id.startsWith('b') ? 6 : 10;
  }
  answers[exam.essayIds[2]] = '第三道论述题不纳入计分';
  assert.deepEqual(scoreExam(exam, questions, answers, selfScores, selected), { objectiveScore: 50, subjectiveScore: 50, total: 100, maxScore: 100, answeredCount: 32, needsSelfReview: false });
});

test('written questions require explicit self review including blank digital answers', () => {
  const questions = fixture();
  const exam = createExam(questions, fixedRng);
  const selected = exam.essayIds.slice(0, 2);
  const answers = { [exam.shortIds[0]]: '分点作答', [selected[0]]: '   ', [exam.singleIds[0]]: 0 };
  const result = scoreExam(exam, questions, answers, {}, selected);
  assert.equal(result.subjectiveScore, 0);
  assert.equal(result.answeredCount, 2);
  assert.equal(result.needsSelfReview, true);
  assert.equal(scoreExam(exam, questions, {}, {}, selected).needsSelfReview, true);
  assert.equal(scoreExam(exam, questions, answers, { [exam.shortIds[0]]: 2.5 }, selected).subjectiveScore, 2.5);
});

test('paper answers receive legitimate self scores and explicit zero completes review', () => {
  const questions = fixture();
  const exam = createExam(questions, fixedRng);
  const selected = exam.essayIds.slice(0, 2);
  const selfScores = Object.fromEntries([...exam.shortIds, ...selected].map((id) => [id, 0]));
  selfScores[exam.shortIds[0]] = 6;
  selfScores[selected[0]] = 10;
  const result = scoreExam(exam, questions, { [exam.shortIds[0]]: '' }, selfScores, selected);
  assert.equal(result.subjectiveScore, 16);
  assert.equal(result.total, 16);
  assert.equal(result.needsSelfReview, false);
  assert.equal(result.answeredCount, 7);
  delete selfScores[exam.shortIds[1]];
  assert.equal(scoreExam(exam, questions, {}, selfScores, selected).needsSelfReview, true);
});

test('exam scoring rejects over-scoring, extra questions, and invalid essay selection', () => {
  const questions = fixture();
  const exam = createExam(questions, fixedRng);
  const selected = exam.essayIds.slice(0, 2);
  const id = exam.shortIds[0];
  const answers = { [id]: '答案' };
  for (const score of [-1, 7, Infinity, NaN, '6']) {
    assert.throws(() => scoreExam(exam, questions, answers, { [id]: score }, selected));
  }
  assert.throws(() => scoreExam(exam, questions, answers, {}, [selected[0], selected[0]]));
  assert.throws(() => scoreExam(exam, questions, answers, {}, exam.essayIds));
  assert.throws(() => scoreExam(exam, questions, { outside: 0 }, {}, selected));
  assert.throws(() => scoreExam(exam, questions, answers, { [exam.essayIds[2]]: 10 }, selected));
  assert.throws(() => scoreExam(exam, questions, { [exam.singleIds[0]]: 4 }, {}, selected));
  assert.throws(() => scoreExam({ ...exam, questionIds: [...exam.questionIds, 'outside'] }, questions, answers, {}, selected));
});

function reviewedExam(questions = fixture()) {
  const exam = createExam(questions, fixedRng);
  exam.selectedEssayIds = exam.essayIds.slice(0, 2);
  exam.answers = {};
  exam.selfScores = Object.fromEntries([...exam.shortIds, ...exam.selectedEssayIds].map((id) => [id, 0]));
  return exam;
}

test('revising an exam self score updates wrong questions without adding attempts', () => {
  const questions = fixture();
  const exam = reviewedExam(questions);
  const id = exam.shortIds[0];
  const initial = createInitialState();
  const first = applyExamSelfReview(initial, exam, questions, fixedDate);
  assert.deepEqual(initial, createInitialState());
  assert.equal(first.state.records[id].wrong, 1);
  assert.equal(first.state.daily['2026-10-22'].count, 7);
  assert.equal(getWrongQuestions(questions, first.state).some((question) => question.id === id), true);
  const changedExam = { ...exam, selfScores: { ...exam.selfScores, [id]: 3.6 }, recordedResults: first.recordedResults };
  const revised = applyExamSelfReview(first.state, changedExam, questions, new Date(2026, 9, 23));
  assert.equal(revised.state.records[id].attempts, 1);
  assert.equal(revised.state.records[id].correct, 1);
  assert.equal(revised.state.records[id].wrong, 0);
  assert.equal(revised.state.records[id].lastResult, 'correct');
  assert.deepEqual(revised.state.daily, first.state.daily);
  assert.equal(getWrongQuestions(questions, revised.state).some((question) => question.id === id), false);
  assert.equal(first.state.records[id].lastResult, 'wrong');
  assert.equal(revised.recordedResults[id].updatedAt, fixedDate.toISOString());
});

test('saving the same exam self review repeatedly is idempotent', () => {
  const questions = fixture();
  const exam = reviewedExam(questions);
  const first = applyExamSelfReview(createInitialState(), exam, questions, fixedDate);
  const withResults = { ...exam, recordedResults: first.recordedResults };
  const repeated = applyExamSelfReview(first.state, withResults, questions, new Date(2026, 9, 23));
  assert.deepEqual(repeated, first);
  const incomplete = { ...exam, selfScores: { ...exam.selfScores } };
  delete incomplete.selfScores[exam.shortIds[0]];
  assert.throws(() => applyExamSelfReview(first.state, incomplete, questions, fixedDate), /七道/);
  assert.throws(() => applyExamSelfReview(first.state, { ...exam, selfScores: { ...exam.selfScores, [exam.shortIds[0]]: 7 } }, questions, fixedDate), /自评分/);
});

test('a legacy already-recorded report can revise scores without recounting practice',()=>{
  const questions=fixture(),exam=reviewedExam(questions);
  let state=createInitialState();
  for(const id of [...exam.shortIds,...exam.selectedEssayIds])state=recordAnswer(state,id,false,'旧版考试答案',fixedDate);
  exam.subjectiveRecorded=true;
  exam.selfScores[exam.shortIds[0]]=6;
  const result=applyExamSelfReview(state,exam,questions,new Date(2026,9,23));
  assert.deepEqual(result.state,state);
  assert.equal(result.legacyReviewOnly,true);
  const repeated=applyExamSelfReview(result.state,{...exam,recordedResults:result.recordedResults,legacyReviewOnly:true},questions,new Date(2026,9,24));
  assert.deepEqual(repeated,result);
});

test('revising an old exam corrects cumulative counts without overwriting later practice', () => {
  const questions = fixture();
  const exam = reviewedExam(questions);
  const id = exam.shortIds[0];
  const first = applyExamSelfReview(createInitialState(), exam, questions, fixedDate);
  const laterDate = new Date(2026, 9, 23, 10);
  const practiced = recordAnswer(first.state, id, false, '之后重新练习的答案', laterDate);
  const editedExam = { ...exam, selfScores: { ...exam.selfScores, [id]: 6 }, recordedResults: first.recordedResults };
  const revised = applyExamSelfReview(practiced, editedExam, questions, new Date(2026, 9, 24));
  assert.deepEqual(revised.state.records[id], { attempts: 2, correct: 1, wrong: 1, lastResult: 'wrong', lastAnswer: '之后重新练习的答案', updatedAt: laterDate.toISOString(),correctStreak:0,nextReviewAt:laterDate.toISOString() });
  assert.deepEqual(revised.state.daily, practiced.daily);
  assert.equal(getWrongQuestions(questions, revised.state).some((question) => question.id === id), true);
  assert.equal(revised.recordedResults[id].result, true);
  const repeated = applyExamSelfReview(revised.state, { ...editedExam, recordedResults: revised.recordedResults }, questions, new Date(2026, 9, 25));
  assert.deepEqual(repeated, revised);
});

test('backup round trip validates structure, known IDs, and content before import', () => {
  let state = recordAnswer(createInitialState(), 's0', true, 0, fixedDate);
  state = toggleFavorite(state, 's0');
  state.drafts.b0 = '笔试草稿';
  state.history.push(examSummary());
  state.lastPractice = { questionIds: ['s0', 'b0'], index: 1, label: '笔试练习' };
  const ids = fixture().map((question) => question.id);
  assert.deepEqual(parseBackup(JSON.stringify(state), ids), state);
  assert.deepEqual(parseBackup(JSON.stringify({ exportedAt: fixedDate.toISOString(), state }), ids), state);
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, version: 9 })), /版本/);
  assert.throws(() => parseBackup(JSON.stringify(state), ['s1']), /编号/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, records: { s0: { ...state.records.s0, attempts: 99 } } })), /记录/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, favorites: ['s0', 's0'] })), /重复/);
  assert.throws(() => parseBackup('{"version":1,"records":{},"favorites":[],"drafts":{"__proto__":"x"},"daily":{},"history":[],"lastPractice":null}'), /编号/);
});

test('exam history and saved practice progress survive storage and reject invalid backups', () => {
  const state = createInitialState();
  state.history.push(examSummary());
  state.lastPractice = { questionIds: ['s0', 's1'], index: 1, label: '继续练习' };
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(writeState(state, storage), true);
  assert.deepEqual(readState(storage), state);
  assert.deepEqual(parseBackup(JSON.stringify(state), ['s0', 's1']), state);
  for (const replacement of [
    { objectiveScore: 51 }, { subjectiveScore: -1 }, { total: 101 }, { total: 0 },
    { maxScore: 200 }, { answeredCount: 33 }, { needsSelfReview: 'false' }, { createdAt: 'bad' },
  ]) {
    const invalid = { ...state, history: [{ ...state.history[0], ...replacement }] };
    assert.throws(() => parseBackup(JSON.stringify(invalid)), /历史/);
    assert.deepEqual(readState({ getItem: () => JSON.stringify(invalid) }).history, []);
  }
  assert.throws(() => parseBackup(JSON.stringify({ ...state, history: [examSummary(), examSummary()] })), /重复/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, lastPractice: { ...state.lastPractice, index: 2 } })), /字段/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, lastPractice: { ...state.lastPractice, questionIds: ['s0', 's0'] } })), /字段/);
  assert.throws(() => parseBackup(JSON.stringify(state), ['s0']), /编号/);
});
