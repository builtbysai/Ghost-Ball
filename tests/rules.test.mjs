import test from 'node:test';
import assert from 'node:assert/strict';
import { newRules, resolveShot, legalTargets, respotPosition } from '../src/rules.js';

const ALL8 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const hit = (a, b, t = 0.1) => ({ type: 'ball', a, b, t, speed: 1 });
const rail = (id, t = 0.5, wall = 0) => ({ type: 'rail', id, t, wall, speed: 1 });
const pot = (id, pocket = 0, t = 0.8) => ({ type: 'pocket', id, pocket, t });
const play = (rules, events, onTableBefore, extra = {}) => resolveShot({ ...rules, breakShot: false, ...extra.rules }, { events, onTableBefore, ...extra });

test('eight-ball: a legal pot on an open table assigns groups and keeps the turn', () => {
  const r = newRules('eight');
  const { rules, result } = play(r, [hit(0, 3), pot(3), rail(0)], ALL8);
  assert.equal(result.foul, false);
  assert.equal(rules.open, false);
  assert.equal(rules.groups[0], 'solid');
  assert.equal(rules.groups[1], 'stripe');
  assert.equal(rules.turn, 0);
});

test('eight-ball: hitting the wrong group first is a foul that gives the opponent ball in hand', () => {
  let r = newRules('eight');
  r = { ...r, open: false, groups: ['solid', 'stripe'], breakShot: false };
  const { rules, result } = resolveShot(r, { events: [hit(0, 10), rail(0)], onTableBefore: ALL8 });
  assert.equal(result.foul, true);
  assert.equal(rules.turn, 1);
  assert.equal(rules.ballInHand, true);
  assert.match(result.reasons[0], /solid/);
});

test('eight-ball: a shot that reaches no rail and pots nothing is a foul', () => {
  let r = { ...newRules('eight'), open: false, groups: ['solid', 'stripe'], breakShot: false };
  const { result } = resolveShot(r, { events: [hit(0, 2)], onTableBefore: ALL8 });
  assert.equal(result.foul, true);
});

test('eight-ball: sinking the 8 early loses; sinking it cleanly in the called pocket wins; wrong pocket loses', () => {
  const mk = (onTable) => ({ ...newRules('eight'), open: false, groups: ['solid', 'stripe'], breakShot: false, onTable });
  const early = resolveShot(mk(), { events: [hit(0, 8), pot(8, 2)], onTableBefore: ALL8 });
  assert.equal(early.rules.winner, 1);

  const onlyEight = [0, 8, 9, 10];
  const win = resolveShot(mk(), { events: [hit(0, 8), pot(8, 2)], onTableBefore: onlyEight, calledPocket: 2 });
  assert.equal(win.rules.winner, 0);

  const wrong = resolveShot(mk(), { events: [hit(0, 8), pot(8, 4)], onTableBefore: onlyEight, calledPocket: 2 });
  assert.equal(wrong.rules.winner, 1);

  const scratch = resolveShot(mk(), { events: [hit(0, 8), pot(8, 2), pot(0, 3)], onTableBefore: onlyEight, calledPocket: 2 });
  assert.equal(scratch.rules.winner, 1);
});

test('eight-ball: scratching on the break reopens the table and puts the cue ball behind the head string', () => {
  const r = newRules('eight');
  const { rules, result } = resolveShot(r, { events: [hit(0, 1), rail(1), rail(2), rail(3), rail(4), pot(0, 1)], onTableBefore: ALL8 });
  assert.equal(result.foul, true);
  assert.equal(rules.open, true);
  assert.equal(rules.ballInHand, true);
  assert.equal(rules.kitchen, true);
});

test('eight-ball: the 8 potted on the break is respotted, not a loss', () => {
  const r = newRules('eight');
  const { rules, result } = resolveShot(r, { events: [hit(0, 1), rail(1), rail(2), rail(3), rail(4), pot(8, 3)], onTableBefore: ALL8 });
  assert.equal(rules.winner, null);
  assert.deepEqual(result.respot, [8]);
});

test('nine-ball: must hit the lowest ball first; a legal combination on the 9 wins', () => {
  const nine = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const r = { ...newRules('nine'), breakShot: false };
  assert.deepEqual(legalTargets(r, nine), [1]);
  const bad = resolveShot(r, { events: [hit(0, 4), rail(4)], onTableBefore: nine });
  assert.equal(bad.result.foul, true);
  assert.equal(bad.rules.turn, 1);

  const combo = resolveShot(r, { events: [hit(0, 1), hit(1, 9), pot(9, 0)], onTableBefore: nine });
  assert.equal(combo.rules.winner, 0);
});

test('nine-ball: the 9 potted on a foul is respotted and the game continues', () => {
  const nine = [0, 1, 2, 3, 9];
  const r = { ...newRules('nine'), breakShot: false };
  const { rules, result } = resolveShot(r, { events: [hit(0, 3), hit(3, 9), pot(9, 0)], onTableBefore: nine });
  assert.equal(result.foul, true);
  assert.equal(rules.winner, null);
  assert.deepEqual(result.respot, [9]);
});

test('respot goes to the foot spot, or up the long string when it is taken', () => {
  const free = respotPosition([], 1.27);
  assert.ok(Math.abs(free.x - 0.635) < 1e-9);
  const taken = respotPosition([{ x: 0.635, y: 0 }], 1.27);
  assert.ok(taken.x > 0.635 + 0.05);
});

import { ONE_POCKET_OWNERS } from '../src/rules.js';
const ALL15 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

test('one-pocket: only balls in your own pocket count, wrong-pocket balls come back, the other pocket credits the opponent', () => {
  const r = { ...newRules('onepocket'), breakShot: false };
  const [mine, theirs] = ONE_POCKET_OWNERS;
  const own = resolveShot(r, { events: [hit(0, 3), pot(3, mine), rail(0)], onTableBefore: ALL15 });
  assert.equal(own.rules.score[0], 1);
  assert.equal(own.rules.turn, 0, 'a ball in your own pocket keeps the turn');

  const wrong = resolveShot(r, { events: [hit(0, 3), pot(3, 4), rail(0)], onTableBefore: ALL15 });
  assert.equal(wrong.rules.score[0], 0);
  assert.deepEqual(wrong.result.respot, [3]);
  assert.equal(wrong.rules.turn, 1);

  const gift = resolveShot(r, { events: [hit(0, 3), pot(3, theirs), rail(0)], onTableBefore: ALL15 });
  assert.equal(gift.rules.score[1], 1, 'a ball in their pocket is theirs');
  assert.equal(gift.rules.turn, 1);
});

test('one-pocket: a foul gives the opponent ball in hand and puts one of your balls back; eight wins', () => {
  const [mine] = ONE_POCKET_OWNERS;
  let r = { ...newRules('onepocket'), breakShot: false, score: [3, 0], owned: [[1, 2, 3], []] };
  const foul = resolveShot(r, { events: [hit(0, 5)], onTableBefore: ALL15.filter((id) => ![1, 2, 3].includes(id)) });
  assert.equal(foul.result.foul, true);
  assert.equal(foul.rules.score[0], 2);
  assert.deepEqual(foul.result.respot, [3]);
  assert.equal(foul.rules.ballInHand, true);

  r = { ...newRules('onepocket'), breakShot: false, score: [7, 0], owned: [[1, 2, 3, 4, 5, 6, 7], []] };
  const win = resolveShot(r, { events: [hit(0, 9), pot(9, mine), rail(0)], onTableBefore: [0, 9, 10] });
  assert.equal(win.rules.winner, 0);
});

test('run-out: the run ends on the first miss or foul, and clearing the 9 ends it as a success', () => {
  const nine = [0, 1, 2, 3, 9];
  const r = { ...newRules('runout'), breakShot: false };
  const good = resolveShot(r, { events: [hit(0, 1), pot(1, 0), rail(0)], onTableBefore: nine });
  assert.equal(good.rules.winner, null);
  assert.equal(good.rules.score[0], 1);
  const miss = resolveShot(r, { events: [hit(0, 1), rail(1), rail(0)], onTableBefore: nine });
  assert.equal(miss.rules.winner, 0);
  assert.equal(miss.rules.loseReason, 'Missed');
  const wrongBall = resolveShot(r, { events: [hit(0, 3), rail(3)], onTableBefore: nine });
  assert.match(wrongBall.rules.loseReason, /before the 1/);
  const clear = resolveShot(r, { events: [hit(0, 1), hit(1, 9), pot(9, 0)], onTableBefore: nine });
  assert.equal(clear.rules.winner, 0);
  assert.equal(clear.rules.loseReason, null);
});
