import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, createInitialState, readState, writeState, parseBackup,
  recordAnswer, toggleFavorite,
} from '../src/lib/study.js';

const ids = ['s0', 's1', 's2'];
const fixedDate = new Date('2026-10-23T04:00:00.000Z');
const cursor = () => ({ questionIds: ['s0', 's1'], index: 1, label: '本轮章节练习' });
const snapshot = () => ({
  ...cursor(), answers: { s0: 0, s1: 3 }, revealed: { s0: true }, recorded: { s0: true },
});
const stateWith = (lastPractice) => ({ ...createInitialState(), lastPractice });
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
}

test('round answers and reveal/count flags survive repeated storage round trips without recounting', () => {
  const storage = memoryStorage();
  const state = recordAnswer(stateWith(snapshot()), 's0', false, 0, fixedDate);
  assert.equal(writeState(state, storage), true);
  assert.ok(storage.getItem(STORAGE_KEY));
  const restored = readState(storage);
  assert.deepEqual(restored, state);
  assert.equal(restored.version, 1);
  assert.equal(restored.lastPractice.answers.s0, 0);
  assert.equal(restored.lastPractice.answers.s1, 3);
  assert.equal(restored.lastPractice.revealed.s0, true);
  assert.equal(restored.lastPractice.recorded.s0, true);
  assert.equal(restored.records.s0.attempts, 1);
  assert.equal(writeState(restored, storage), true);
  assert.deepEqual(readState(storage).records, state.records);
  assert.deepEqual(readState(storage).daily, state.daily);
  assert.deepEqual(parseBackup(storage.getItem(STORAGE_KEY), ids), state);
});

test('legacy three-field cursors remain compatible with storage and raw or wrapped backups', () => {
  const state = stateWith(cursor());
  const storage = memoryStorage();
  assert.equal(writeState(state, storage), true);
  assert.deepEqual(readState(storage), state);
  assert.deepEqual(parseBackup(JSON.stringify(state), ids), state);
  assert.deepEqual(parseBackup(JSON.stringify({ state, exportedAt: fixedDate.toISOString() }), ids), state);
  for (const field of ['answers', 'revealed', 'recorded']) {
    assert.equal(Object.hasOwn(readState(storage).lastPractice, field), false);
  }
  assert.deepEqual(parseBackup(JSON.stringify(createInitialState()), ids), createInitialState());
});

test('optional round maps support unanswered or revealed-only questions and empty maps', () => {
  for (const extra of [
    { answers: { s0: 0 } },
    { revealed: { s1: true } },
    { recorded: {} },
    { answers: {}, revealed: {}, recorded: {} },
    { revealed: { s0: true }, recorded: { s0: true } },
  ]) {
    const state = stateWith({ ...cursor(), ...extra });
    assert.deepEqual(parseBackup(JSON.stringify(state), ids), state);
  }
});

test('backup validation rejects malformed optional maps and invalid choice values', () => {
  for (const field of ['answers', 'revealed', 'recorded']) {
    for (const value of [null, [], 0, 'not a map', true]) {
      assert.throws(() => parseBackup(JSON.stringify(stateWith({ ...cursor(), [field]: value })), ids), /字段/);
    }
  }
  for (const answer of [-1, 4, 0.5, '0', true, null, {}, [], Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => parseBackup(JSON.stringify(stateWith({ ...cursor(), answers: { s0: answer } })), ids), /字段/);
  }
  for (const field of ['revealed', 'recorded']) {
    for (const flag of [false, 0, 1, 'true', null, {}, []]) {
      const practice = { ...cursor(), revealed: { s0: true }, [field]: { s0: flag } };
      assert.throws(() => parseBackup(JSON.stringify(stateWith(practice)), ids), /字段/);
    }
  }
});

test('counted questions require their own revealed flag in the same round', () => {
  for (const revealed of [undefined, {}, { s1: true }]) {
    const practice = { ...cursor(), recorded: { s0: true } };
    if (revealed !== undefined) practice.revealed = revealed;
    assert.throws(() => parseBackup(JSON.stringify(stateWith(practice)), ids), /字段/);
  }
  const valid = stateWith(snapshot());
  assert.deepEqual(parseBackup(JSON.stringify(valid), ids).lastPractice.recorded, { s0: true });
});

test('round map IDs must belong to the cursor even when present elsewhere in the bank', () => {
  for (const field of ['answers', 'revealed', 'recorded']) {
    const practice = { ...snapshot(), [field]: { s2: field === 'answers' ? 1 : true } };
    assert.throws(() => parseBackup(JSON.stringify(stateWith(practice)), ids), /字段/);
  }
  const unknownCursor = stateWith({ questionIds: ['s0', 'unknown'], index: 0, label: '旧题库' });
  assert.throws(() => parseBackup(JSON.stringify(unknownCursor), ids), /编号/);
  const unsafeMap = JSON.parse('{"__proto__":0}');
  assert.throws(() => parseBackup(JSON.stringify(stateWith({ ...cursor(), answers: unsafeMap })), ids), /字段/);
  assert.throws(() => parseBackup(JSON.stringify(stateWith({ ...cursor(), answers: { constructor: 0 } })), ids), /字段/);
});

test('reading a corrupt round is non-destructive and retains other usable learning data', () => {
  const invalid = { ...stateWith({ ...snapshot(), recorded: { s1: true } }), favorites: ['s0'], drafts: { s1: '笔试草稿' } };
  const text = JSON.stringify(invalid);
  let writes = 0;
  const storage = { getItem: () => text, setItem: () => { writes += 1; } };
  const restored = readState(storage);
  assert.equal(restored.lastPractice, null);
  assert.deepEqual(restored.favorites, ['s0']);
  assert.deepEqual(restored.drafts, { s1: '笔试草稿' });
  assert.equal(writes, 0);
  assert.equal(storage.getItem(STORAGE_KEY), text);
});

test('normalization copies every round container and cannot mutate the live session', () => {
  const practice = snapshot();
  const state = stateWith(practice);
  Object.freeze(practice.questionIds);
  Object.freeze(practice.answers);
  Object.freeze(practice.revealed);
  Object.freeze(practice.recorded);
  Object.freeze(practice);
  const next = recordAnswer(state, 's1', true, 3, fixedDate);
  const favorite = toggleFavorite(state, 's0');
  for (const normalized of [next, favorite]) {
    assert.notStrictEqual(normalized.lastPractice, practice);
    for (const field of ['questionIds', 'answers', 'revealed', 'recorded']) {
      assert.notStrictEqual(normalized.lastPractice[field], practice[field]);
    }
    normalized.lastPractice.questionIds.push('s2');
    normalized.lastPractice.answers.s0 = 2;
    normalized.lastPractice.revealed.s1 = true;
    normalized.lastPractice.recorded.s1 = true;
  }
  assert.deepEqual(state.lastPractice, snapshot());
  assert.deepEqual(state.records, {});
  assert.deepEqual(state.daily, {});
});
