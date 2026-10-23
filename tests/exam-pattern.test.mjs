import test from 'node:test';
import assert from 'node:assert/strict';
import { createExam, scoreExam, applyExamSelfReview, createInitialState, readState, writeState, normalizeExamPattern } from '../src/lib/study.js';
import { createBalancedExam } from '../src/lib/preparation.js';

const materialPattern = {
  singleCount: 25, singlePoints: 2, shortCount: 5, shortPoints: 6,
  essayOffered: 1, essayRequired: 1, essayPoints: 20, essayLabel: '材料分析题',
  durationMinutes: 150, totalPoints: 100, passingPoints: 60,
};
const chapters = Array.from({ length: 18 }, (_, index) => ({ id: `chapter-${index}` }));
const questions = chapters.flatMap(chapter => [
  ...Array.from({ length: 4 }, (_, index) => ({ id: `${chapter.id}-s${index}`, chapterId: chapter.id, type: 'single', level: 'recall', topicIds: [chapter.id], options: ['甲', '乙', '丙', '丁'], answer: index })),
  { id: `${chapter.id}-b`, chapterId: chapter.id, type: 'short', level: 'understand', topicIds: [chapter.id] },
  { id: `${chapter.id}-e`, chapterId: chapter.id, type: 'essay', level: 'apply', topicIds: [chapter.id] },
]);

test('material paper has 31 required answers, broad chapter coverage, and a 20-point material question', () => {
  const exam = createBalancedExam(questions, chapters, createInitialState(), () => 0.4, materialPattern);
  assert.equal(exam.questionIds.length, 31);
  assert.equal(exam.chapterCoverage, 18);
  assert.equal(exam.essayIds.length, 1);
  const answers = Object.fromEntries(exam.singleIds.map(id => [id, questions.find(question => question.id === id).answer]));
  const selfScores = Object.fromEntries([...exam.shortIds, ...exam.essayIds].map(id => [id, exam.essayIds.includes(id) ? 20 : 6]));
  const score = scoreExam(exam, questions, answers, selfScores, exam.essayIds);
  assert.deepEqual(score, { objectiveScore: 50, subjectiveScore: 50, total: 100, maxScore: 100, answeredCount: 31, needsSelfReview: false });
  assert.throws(() => scoreExam(exam, questions, answers, { ...selfScores, [exam.essayIds[0]]: 21 }, exam.essayIds), /自评分/);
  assert.throws(() => scoreExam(exam, questions, answers, selfScores, []), /材料分析题/);
});

test('material self review uses its own pass threshold and revisions do not duplicate attempts', () => {
  const exam = createExam(questions, () => 0.4, materialPattern);
  exam.selectedEssayIds = [...exam.essayIds];
  exam.answers = {};
  exam.selfScores = Object.fromEntries([...exam.shortIds, ...exam.essayIds].map(id => [id, exam.essayIds.includes(id) ? 11 : 6]));
  const first = applyExamSelfReview(createInitialState(), exam, questions);
  const id = exam.essayIds[0];
  assert.equal(first.state.records[id].lastResult, 'wrong');
  const revised = applyExamSelfReview(first.state, { ...exam, selfScores: { ...exam.selfScores, [id]: 12 }, recordedResults: first.recordedResults }, questions);
  assert.equal(revised.state.records[id].lastResult, 'correct');
  assert.equal(revised.state.records[id].attempts, 1);
  assert.equal(Object.keys(revised.state.records).length, 6);
});

test('material history and 18-chapter coverage survive storage while inconsistent patterns are rejected', () => {
  const state = createInitialState();
  state.history = [{ id: 'material-exam', createdAt: new Date().toISOString(), objectiveScore: 50, subjectiveScore: 50, total: 100, maxScore: 100, answeredCount: 31, needsSelfReview: false, chapterCoverage: 18, pattern: materialPattern }];
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(writeState(state, storage), true);
  assert.deepEqual(readState(storage), state);
  state.history[0].answeredCount = 32;
  assert.deepEqual(readState({ getItem: () => JSON.stringify(state) }).history, []);
  assert.throws(() => normalizeExamPattern({ ...materialPattern, essayPoints: 10 }), /配置/);
  assert.throws(() => normalizeExamPattern({ ...materialPattern, essayRequired: 2 }), /配置/);
});
