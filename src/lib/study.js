export const STORAGE_KEY = 'xue-study-state-v1';

const MAX_HISTORY = 1000;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !UNSAFE_KEYS.has(value);
const isAnswer = (value) => (typeof value === 'string' && value.length <= 50000)
  || (Number.isSafeInteger(value) && value >= 0);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function createInitialState() {
  return {
    version: 1,
    records: {},
    favorites: [],
    drafts: {},
    daily: {},
    history: [],
    lastPractice: null,
  };
}

export function getLocalDateKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('无效的日期');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validRecord(record) {
  return isObject(record)
    && isCount(record.attempts) && isCount(record.correct) && isCount(record.wrong)
    && record.attempts === record.correct + record.wrong && record.attempts > 0
    && ['correct', 'wrong'].includes(record.lastResult)
    && isAnswer(record.lastAnswer) && isTimestamp(record.updatedAt)
    && (record.correctStreak === undefined || isCount(record.correctStreak))
    && (record.nextReviewAt === undefined || isTimestamp(record.nextReviewAt));
}

function validHistoryItem(item) {
  return isObject(item) && isId(item.id) && isTimestamp(item.createdAt)
    && Number.isInteger(item.objectiveScore) && item.objectiveScore >= 0
    && item.objectiveScore <= 50 && item.objectiveScore % 2 === 0
    && Number.isFinite(item.subjectiveScore) && item.subjectiveScore >= 0 && item.subjectiveScore <= 50
    && Number.isFinite(item.total) && item.total >= 0 && item.total <= 100
    && Math.abs(item.total - item.objectiveScore - item.subjectiveScore) < 1e-8
    && item.maxScore === 100 && isCount(item.answeredCount) && item.answeredCount <= 32
    && typeof item.needsSelfReview === 'boolean'
    && (item.singleIds === undefined || (Array.isArray(item.singleIds) && item.singleIds.length === 25 && item.singleIds.every(isId) && new Set(item.singleIds).size === 25))
    && (item.bankMode === undefined || ['balanced','legacy'].includes(item.bankMode))
    && (item.selfReviewSaved === undefined || typeof item.selfReviewSaved === 'boolean')
    && (item.chapterCoverage === undefined || (isCount(item.chapterCoverage) && item.chapterCoverage <= 9));
}

function validLastPractice(value) {
  return value === null || (isObject(value) && Array.isArray(value.questionIds)
    && value.questionIds.length > 0 && value.questionIds.every(isId)
    && new Set(value.questionIds).size === value.questionIds.length
    && isCount(value.index) && value.index < value.questionIds.length
    && typeof value.label === 'string' && value.label.length <= 200);
}

// Reading is deliberately non-destructive: invalid fields are skipped in memory,
// and no migration or reset is written back to storage during a read.
function normalizeState(value) {
  const state = createInitialState();
  if (!isObject(value) || value.version !== 1) return state;
  if (isObject(value.records)) {
    for (const [id, record] of Object.entries(value.records)) {
      if (isId(id) && validRecord(record)) state.records[id] = { ...record };
    }
  }
  if (Array.isArray(value.favorites)) state.favorites = [...new Set(value.favorites.filter(isId))];
  if (isObject(value.drafts)) {
    for (const [id, draft] of Object.entries(value.drafts)) {
      if (isId(id) && typeof draft === 'string' && draft.length <= 50000) state.drafts[id] = draft;
    }
  }
  if (isObject(value.daily)) {
    for (const [date, activity] of Object.entries(value.daily)) {
      if (isDateKey(date) && isObject(activity) && isCount(activity.count)
        && Number.isFinite(activity.minutes) && activity.minutes >= 0) {
        state.daily[date] = { count: activity.count, minutes: activity.minutes };
      }
    }
  }
  if (Array.isArray(value.history)) {
    state.history = value.history.filter(validHistoryItem).slice(-MAX_HISTORY).map((item) => ({ ...item,...(item.singleIds?{singleIds:[...item.singleIds]}:{}) }));
  }
  if (validLastPractice(value.lastPractice) && value.lastPractice !== null) {
    state.lastPractice = { ...value.lastPractice, questionIds: [...value.lastPractice.questionIds] };
  }
  return state;
}

function getStorage(storage) {
  if (storage !== undefined) return storage;
  // Access may throw in a private window or an iframe with storage disabled.
  return globalThis.localStorage;
}

export function readState(storage) {
  try {
    const text = getStorage(storage)?.getItem(STORAGE_KEY);
    return text ? normalizeState(JSON.parse(text)) : createInitialState();
  } catch {
    return createInitialState();
  }
}

export function writeState(state, storage) {
  try {
    const target = getStorage(storage);
    if (!target || typeof target.setItem !== 'function') return false;
    target.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return true;
  } catch {
    return false;
  }
}

export function recordAnswer(state, questionId, result, answer, date = new Date()) {
  if (!isId(questionId)) throw new TypeError('无效的题目编号');
  if (typeof result !== 'boolean') throw new TypeError('作答结果必须为布尔值');
  if (!isAnswer(answer)) throw new TypeError('无效的答案');
  const day = getLocalDateKey(date);
  const updatedAt = date.toISOString();
  const next = normalizeState(state);
  const previous = next.records[questionId] || { attempts: 0, correct: 0, wrong: 0 };
  const lastResult = result ? 'correct' : 'wrong';
  next.records[questionId] = {
    attempts: previous.attempts + 1,
    correct: previous.correct + Number(result),
    wrong: previous.wrong + Number(!result),
    lastResult,
    lastAnswer: answer,
    updatedAt,
    ...getReviewSchedule(result, previous, date),
  };
  const activity = next.daily[day] || { count: 0, minutes: 0 };
  next.daily[day] = { count: activity.count + 1, minutes: activity.minutes };
  return next;
}

export function getReviewSchedule(result, previous, date = new Date()) {
  const correctStreak = result ? (previous?.lastResult === 'correct' ? Math.min(100, Number(previous.correctStreak) || 1) + 1 : 1) : 0;
  const days = result ? [1, 3, 7, 14, 30][Math.min(correctStreak - 1, 4)] : 0;
  return { correctStreak, nextReviewAt: new Date(date.getTime() + days * 86400000).toISOString() };
}

export function toggleFavorite(state, id) {
  if (!isId(id)) throw new TypeError('无效的题目编号');
  const next = normalizeState(state);
  next.favorites = next.favorites.includes(id)
    ? next.favorites.filter((favorite) => favorite !== id)
    : [...next.favorites, id];
  return next;
}

export function getStats(state, questions, date = new Date()) {
  const clean = normalizeState(state);
  const ids = new Set((Array.isArray(questions) ? questions : []).map((question) => question.id));
  const records = Object.entries(clean.records).filter(([id]) => ids.has(id)).map(([, record]) => record);
  const correct = records.reduce((sum, record) => sum + record.correct, 0);
  const wrong = records.reduce((sum, record) => sum + record.wrong, 0);
  const today = getLocalDateKey(date);
  const cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!(clean.daily[today]?.count > 0)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (clean.daily[getLocalDateKey(cursor)]?.count > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    attempted: records.length,
    correct,
    wrong,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0,
    mastered: records.filter((record) => record.lastResult === 'correct').length,
    todayCount: clean.daily[today]?.count || 0,
    streak,
  };
}

export function getWrongQuestions(questions, state) {
  const records = normalizeState(state).records;
  return questions.filter((question) => records[question.id]?.lastResult === 'wrong');
}

export function getFavoriteQuestions(questions, state) {
  const favorites = new Set(normalizeState(state).favorites);
  return questions.filter((question) => favorites.has(question.id));
}

export function shuffle(items, rng = Math.random) {
  if (!Array.isArray(items)) throw new TypeError('待打乱的内容必须为数组');
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new RangeError('随机数必须处于 [0, 1)');
    const target = Math.floor(random * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function questionMap(questions) {
  if (!Array.isArray(questions)) throw new TypeError('题库必须为数组');
  const map = new Map();
  for (const question of questions) {
    if (!isObject(question) || !isId(question.id) || map.has(question.id)) throw new TypeError('题目编号无效或重复');
    if (!['single', 'short', 'essay'].includes(question.type)) throw new TypeError('题型无效');
    if (question.type === 'single' && (!Array.isArray(question.options) || question.options.length < 2
      || !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length)) {
      throw new TypeError('单选题缺少有效选项或标准答案');
    }
    map.set(question.id, question);
  }
  return map;
}

export function createExam(questions, rng = Math.random) {
  questionMap(questions);
  const pick = (type, count) => {
    const pool = questions.filter((question) => question.type === type);
    if (pool.length < count) throw new RangeError(`题库中的 ${type} 题不足 ${count} 道`);
    return shuffle(pool, rng).slice(0, count).map((question) => question.id);
  };
  const singleIds = pick('single', 25);
  const shortIds = pick('short', 5);
  const essayIds = pick('essay', 3);
  const createdAt = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `exam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, questionIds: [...singleIds, ...shortIds, ...essayIds], singleIds, shortIds, essayIds, durationMinutes: 150, createdAt };
}

function validateExam(exam, map) {
  if (!isObject(exam)) throw new TypeError('无效的试卷');
  for (const [key, type, count] of [['singleIds', 'single', 25], ['shortIds', 'short', 5], ['essayIds', 'essay', 3]]) {
    const ids = exam[key];
    if (!Array.isArray(ids) || ids.length !== count || new Set(ids).size !== count
      || ids.some((id) => !isId(id) || map.get(id)?.type !== type)) throw new TypeError('试卷题目数量、题型或编号不合法');
  }
  const expected = [...exam.singleIds, ...exam.shortIds, ...exam.essayIds];
  if (!Array.isArray(exam.questionIds) || exam.questionIds.length !== expected.length
    || new Set(exam.questionIds).size !== expected.length
    || expected.some((id) => !exam.questionIds.includes(id))) throw new TypeError('试卷题目清单不一致');
}

export function scoreExam(exam, questions, answers = {}, selfScores = {}, selectedEssayIds = []) {
  const map = questionMap(questions);
  validateExam(exam, map);
  if (!isObject(answers) || !isObject(selfScores)) throw new TypeError('答案与自评分必须为对象');
  if (!Array.isArray(selectedEssayIds) || selectedEssayIds.length !== 2 || new Set(selectedEssayIds).size !== 2
    || selectedEssayIds.some((id) => !exam.essayIds.includes(id))) throw new RangeError('请从三道论述题中恰好选择两道');
  const examIds = new Set(exam.questionIds);
  const activeSubjectiveIds = new Set([...exam.shortIds, ...selectedEssayIds]);
  for (const [id, answer] of Object.entries(answers)) {
    if (!examIds.has(id)) throw new TypeError('答案包含试卷以外的题目');
    const question = map.get(id);
    if (answer === undefined || answer === null || answer === '') continue;
    if (question.type === 'single') {
      if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) throw new TypeError('单选题答案不合法');
    } else if (typeof answer !== 'string' || answer.length > 50000) throw new TypeError('笔试题答案必须为文本');
  }
  for (const [id, score] of Object.entries(selfScores)) {
    if (!activeSubjectiveIds.has(id)) throw new TypeError('自评分包含未选中的题目或非笔试题');
    const max = map.get(id).type === 'short' ? 6 : 10;
    if (!Number.isFinite(score) || score < 0 || score > max) throw new RangeError(`自评分应在 0 至 ${max} 分之间`);
  }
  let objectiveScore = 0;
  let subjectiveScore = 0;
  let answeredCount = 0;
  let needsSelfReview = false;
  for (const id of exam.singleIds) {
    if (typeof answers[id] !== 'number') continue;
    answeredCount += 1;
    if (answers[id] === map.get(id).answer) objectiveScore += 2;
  }
  for (const id of activeSubjectiveIds) {
    // A self score also confirms an answer written on paper, including a zero.
    // Missing text alone cannot tell us whether the learner has answered.
    if (hasOwn(selfScores, id)) {
      answeredCount += 1;
      subjectiveScore += selfScores[id];
    } else {
      if (typeof answers[id] === 'string' && answers[id].trim()) answeredCount += 1;
      needsSelfReview = true;
    }
  }
  return { objectiveScore, subjectiveScore, total: objectiveScore + subjectiveScore, maxScore: 100, answeredCount, needsSelfReview };
}

export function applyExamSelfReview(state, exam, questions, date = new Date()) {
  const answers = exam?.answers ?? {};
  const selfScores = exam?.selfScores ?? {};
  const selectedEssayIds = exam?.selectedEssayIds ?? [];
  const score = scoreExam(exam, questions, answers, selfScores, selectedEssayIds);
  if (score.needsSelfReview) throw new RangeError('请先完成全部七道主观题的自评');
  getLocalDateKey(date);

  // Version 0.1 recorded only a boolean, without the attempt timestamps needed
  // to distinguish the old exam from later practice. Preserve those records;
  // the report may still revise scores, but must never count seven new attempts.
  if (exam.legacyReviewOnly || (exam.subjectiveRecorded === true && !exam.recordedResults)) {
    return { state: normalizeState(state), recordedResults: {}, legacyReviewOnly: true };
  }

  const map = questionMap(questions);
  const ids = new Set([...exam.shortIds, ...selectedEssayIds]);
  const previousResults = exam.recordedResults ?? {};
  if (!isObject(previousResults)) throw new TypeError('考试自评记录不合法');
  const recordedResults = {};
  for (const [id, item] of Object.entries(previousResults)) {
    if (!ids.has(id) || !isObject(item) || typeof item.result !== 'boolean' || !isTimestamp(item.updatedAt)) {
      throw new TypeError('考试自评记录包含无效题目或结果');
    }
    recordedResults[id] = { result: item.result, updatedAt: item.updatedAt };
  }

  let next = normalizeState(state);
  for (const id of ids) {
    const max = map.get(id).type === 'short' ? 6 : 10;
    const result = selfScores[id] >= max * 0.6;
    const previous = recordedResults[id];
    const record = next.records[id];
    if (!previous || !record) {
      next = recordAnswer(next, id, result, typeof answers[id] === 'string' ? answers[id] : '', date);
      recordedResults[id] = { result, updatedAt: next.records[id].updatedAt };
      continue;
    }
    if (previous.result === result) continue;

    const oldCount = previous.result ? 'correct' : 'wrong';
    const newCount = result ? 'correct' : 'wrong';
    if (record[oldCount] < 1) throw new RangeError('考试自评记录与累计作答次数不一致');
    const corrected = { ...record, [oldCount]: record[oldCount] - 1, [newCount]: record[newCount] + 1 };
    // The timestamp identifies the original attempt. A score revision is not a
    // new attempt, and must not replace the outcome of any later practice.
    if (record.updatedAt === previous.updatedAt) {
      corrected.lastResult = result ? 'correct' : 'wrong';
      Object.assign(corrected, getReviewSchedule(result, {lastResult:'wrong'}, new Date(previous.updatedAt)));
    }
    next.records[id] = corrected;
    recordedResults[id] = { ...previous, result };
  }
  return { state: next, recordedResults };
}

export function parseBackup(text, questionIds) {
  if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) throw new TypeError('备份文件无效或超过 5 MB');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new TypeError('备份文件不是有效的 JSON'); }
  const state = isObject(parsed) && hasOwn(parsed, 'state') ? parsed.state : parsed;
  if (!isObject(state) || state.version !== 1) throw new TypeError('不支持的备份版本');
  if (!isObject(state.records) || !Array.isArray(state.favorites) || !isObject(state.drafts)
    || !isObject(state.daily) || !Array.isArray(state.history) || !validLastPractice(state.lastPractice)) {
    throw new TypeError('备份缺少必要的学习记录字段');
  }
  const knownIds = questionIds === undefined ? null : new Set(questionIds);
  const checkId = (id) => {
    if (!isId(id) || (knownIds && !knownIds.has(id))) throw new TypeError('备份包含无效或当前题库以外的题目编号');
  };
  for (const [id, record] of Object.entries(state.records)) {
    checkId(id);
    if (!validRecord(record)) throw new TypeError('备份中的作答记录不合法');
  }
  if (new Set(state.favorites).size !== state.favorites.length) throw new TypeError('备份中的收藏编号重复');
  state.favorites.forEach(checkId);
  for (const [id, draft] of Object.entries(state.drafts)) {
    checkId(id);
    if (typeof draft !== 'string' || draft.length > 50000) throw new TypeError('备份中的笔试草稿不合法');
  }
  for (const [day, activity] of Object.entries(state.daily)) {
    if (!isDateKey(day) || !isObject(activity) || !isCount(activity.count)
      || !Number.isFinite(activity.minutes) || activity.minutes < 0) throw new TypeError('备份中的每日学习记录不合法');
  }
  for (const item of state.history) {
    if (!validHistoryItem(item)) throw new TypeError('备份中的学习历史不合法');
    item.singleIds?.forEach(checkId);
  }
  if (new Set(state.history.map((item) => item.id)).size !== state.history.length) throw new TypeError('备份中的模拟考试编号重复');
  if (state.lastPractice) state.lastPractice.questionIds.forEach(checkId);
  return normalizeState(state);
}
