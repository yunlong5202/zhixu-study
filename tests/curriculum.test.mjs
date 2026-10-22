import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, chapters, courses, topics, bankSummary } from '../src/data/curriculum.js';
import { createExam, scoreExam } from '../src/lib/study.js';

test('the real bank has complete questions, stable unique IDs, and valid chapter references', () => {
  assert.equal(courses.filter(c => c.available).length, 1);
  assert.ok(bankSummary.indexedQuestions >= 600);
  assert.ok(topics.length >= 140);
  assert.equal(bankSummary.legacyQuestions, 90);
  assert.equal(chapters.length, 9);
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  for (const q of questions) {
    assert.equal(q.courseId, '15042');
    assert.ok(chapters.some(c => c.id === q.chapterId));
    assert.ok(q.stem && q.explanation);
    if (q.type === 'single') {
      assert.equal(q.options.length, 4);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
    } else {
      assert.ok(q.sampleAnswer && q.keyPoints.length > 0);
    }
  }
});

test('the real bank produces a complete 100-point training paper without repeats', () => {
  const exam = createExam(questions);
  const answers = Object.fromEntries(exam.singleIds.map(id => [id, questions.find(q => q.id === id).answer]));
  const essayIds = exam.essayIds.slice(0, 2);
  const selfScores = Object.fromEntries([...exam.shortIds, ...essayIds].map(id => [id, questions.find(q => q.id === id).type === 'short' ? 6 : 10]));
  const score = scoreExam(exam, questions, answers, selfScores, essayIds);
  assert.equal(new Set(exam.questionIds).size, 33);
  assert.equal(score.total, 100);
  assert.equal(score.needsSelfReview, false);
});
