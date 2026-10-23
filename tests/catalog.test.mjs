import test from 'node:test';
import assert from 'node:assert/strict';
import { courses, getCourseData } from '../src/data/catalog.js';
import { createInitialState, recordAnswer, scoreExam, applyExamSelfReview, parseBackup } from '../src/lib/study.js';
import { createBalancedExam, getPreparationReport } from '../src/lib/preparation.js';

test('three selectable courses have separate stable identifiers and complete chapter training', () => {
  assert.deepEqual(courses.map(course => course.id).sort(), ['15040', '15041', '15042']);
  assert.ok(courses.every(course => course.available));
  const seen = new Set();
  for (const course of courses) {
    const data = getCourseData(course.id);
    assert.equal(data.course.id, course.id);
    const chapterIds = new Set(data.chapters.map(chapter => chapter.id));
    const topicIds = new Set(data.topics.map(topic => topic.id));
    assert.equal(chapterIds.size, data.chapters.length);
    assert.equal(topicIds.size, data.topics.length);
    const stems = new Set();
    for (const question of data.questions) {
      assert.equal(question.courseId, course.id);
      assert.ok(!seen.has(question.id), `Cross-course question collision: ${question.id}`);
      seen.add(question.id);
      assert.ok(chapterIds.has(question.chapterId), question.id);
      assert.ok(question.stem && question.explanation, question.id);
      assert.ok(!/\uFFFD|\?{3,}/u.test(JSON.stringify(question)), question.id);
      if (course.id !== '15042') {
        const stem = question.stem.replace(/[\p{P}\s]/gu, '');
        assert.ok(!stems.has(stem), `Duplicate stem: ${question.id}`);
        stems.add(stem);
        assert.equal(question.origin, 'original');
        assert.ok(question.topicIds?.every(id => topicIds.has(id)), question.id);
      }
      if (question.type === 'single') {
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options).size, 4, question.id);
        assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, question.id);
      } else {
        assert.ok(question.keyPoints.length >= 2 && question.sampleAnswer.length >= 50, question.id);
        if (course.id !== '15042' && question.type === 'essay') {
          assert.equal(question.questionFormat, 'material');
          assert.match(question.stem, /材料/);
        }
      }
    }
    for (const chapter of data.chapters) {
      const pool = data.questions.filter(question => question.chapterId === chapter.id);
      assert.ok(pool.filter(question => question.type === 'single').length >= 10, chapter.id);
      assert.ok(pool.filter(question => question.type === 'short').length >= 2, chapter.id);
      assert.ok(pool.some(question => question.type === 'essay'), chapter.id);
    }
    for (const topic of data.topics) {
      assert.ok(chapterIds.has(topic.chapterId), topic.id);
      assert.ok(topic.summary && topic.keyPoints.length >= 2 && topic.commonMistake && topic.outlineRef && topic.sourceIds.length, topic.id);
      const pool = data.questions.filter(question => question.topicIds?.includes(topic.id));
      assert.ok(pool.filter(question => question.type === 'single').length >= 3, topic.id);
      assert.ok(pool.some(question => question.type !== 'single'), topic.id);
    }
  }
  assert.equal(getCourseData().course.id, '15042');
  assert.throws(() => getCourseData('unknown'), /课程/);
});

for (const courseId of ['15040', '15041', '15042']) {
  test(`${courseId} produces its own 100-point paper and preserves distinct practice progress`, () => {
    const { questions, chapters, topics, sourceInfo } = getCourseData(courseId);
    const state = createInitialState();
    const exam = createBalancedExam(questions, chapters, state, () => 0.3, sourceInfo.examPattern);
    const selected = exam.essayIds.slice(0, exam.pattern.essayRequired);
    assert.equal(exam.chapterCoverage, chapters.length);
    assert.equal(exam.essayIds.length, courseId === '15042' ? 3 : 1);
    const answers = Object.fromEntries(exam.singleIds.map(id => [id, questions.find(question => question.id === id).answer]));
    const selfScores = Object.fromEntries([...exam.shortIds, ...selected].map(id => [id, exam.shortIds.includes(id) ? exam.pattern.shortPoints : exam.pattern.essayPoints]));
    const score = scoreExam(exam, questions, answers, selfScores, selected);
    assert.equal(score.total, 100);
    assert.equal(score.needsSelfReview, false);
    const reviewed = applyExamSelfReview(state, { ...exam, answers, selfScores, selectedEssayIds: selected }, questions);
    assert.equal(Object.keys(reviewed.state.records).length, exam.pattern.shortCount + exam.pattern.essayRequired);
    const other = getCourseData(courseId === '15042' ? '15040' : '15042');
    assert.throws(() => parseBackup(JSON.stringify(reviewed.state), other.questions.map(question => question.id)), /编号/);
    let practiced = createInitialState();
    for (const id of exam.singleIds) practiced = recordAnswer(practiced, id, true, questions.find(question => question.id === id).answer);
    const next = createBalancedExam(questions, chapters, practiced, () => 0.3, sourceInfo.examPattern);
    assert.ok(next.singleIds.filter(id => exam.singleIds.includes(id)).length <= 10);
    assert.equal(getPreparationReport(questions, topics, chapters, state).ready, false);
  });
}
