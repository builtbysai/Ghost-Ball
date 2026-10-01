// Rules8 state machine. Owned by the sim workstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rules8, ballGroup } from '../src/sim/rules.js';

const clean = (over = {}) => ({
  firstContactId: 1, potted: [], cuePotted: false, railAfterContact: true, wasBreak: false, ...over,
});

test('ballGroup maps ids', () => {
  assert.equal(ballGroup(0), 'cue');
  for (let i = 1; i <= 7; i++) assert.equal(ballGroup(i), 'solid');
  assert.equal(ballGroup(8), 'eight');
  for (let i = 9; i <= 15; i++) assert.equal(ballGroup(i), 'stripe');
});

test('break pots do not assign groups; a legal pot after the break does', () => {
  const r = new Rules8();
  r.startRack(0);
  const brk = r.settle(clean({ potted: [3], wasBreak: true }));
  assert.equal(r.state.open, true);
  assert.deepEqual(r.state.groups, [null, null]);
  assert.equal(brk.groupsAssigned, false);
  assert.equal(brk.nextTurn, 0);          // pot on the break keeps the turn
  const asg = r.settle(clean({ firstContactId: 2, potted: [2] }));
  assert.equal(asg.groupsAssigned, true);
  assert.deepEqual(r.state.groups, ['solid', 'stripe']);
  assert.equal(r.state.open, false);
  assert.equal(asg.nextTurn, 0);          // potting keeps the turn
});

test('foul: wrong group first', () => {
  const r = new Rules8();
  r.startRack(0);
  r.settle(clean({ potted: [3], wasBreak: true }));
  r.settle(clean({ firstContactId: 2, potted: [2] }));  // player 0 is solids
  const out = r.settle(clean({ firstContactId: 9 }));
  assert.equal(out.foul, true);
  assert.match(out.reason, /stripe/);
  assert.equal(out.nextTurn, 1);
  assert.equal(out.ballInHand, 'anywhere');
});

test('foul: no rail after contact and nothing potted', () => {
  const r = new Rules8();
  r.startRack(0);
  const out = r.settle(clean({ firstContactId: 5, railAfterContact: false }));
  assert.equal(out.foul, true);
  assert.match(out.reason, /rail/);
  assert.equal(out.nextTurn, 1);
});

test('foul: cue ball hit nothing', () => {
  const r = new Rules8();
  r.startRack(0);
  const out = r.settle(clean({ firstContactId: null }));
  assert.equal(out.foul, true);
  assert.match(out.reason, /nothing/);
});

test('scratch on the break -> ball in hand in the kitchen', () => {
  const r = new Rules8();
  r.startRack(1);
  const out = r.settle(clean({ cuePotted: true, wasBreak: true }));
  assert.equal(out.foul, true);
  assert.equal(out.ballInHand, 'kitchen');
  assert.equal(out.nextTurn, 0);
});

test('scratch after the break -> ball in hand anywhere', () => {
  const r = new Rules8();
  r.startRack(0);
  const out = r.settle(clean({ cuePotted: true }));
  assert.equal(out.foul, true);
  assert.equal(out.ballInHand, 'anywhere');
  assert.equal(out.nextTurn, 1);
});

test('early 8 is a loss', () => {
  const r = new Rules8();
  r.startRack(0);
  r.settle(clean({ potted: [1], wasBreak: true }));
  r.settle(clean({ firstContactId: 2, potted: [2] }));  // solids, group not cleared
  const out = r.settle(clean({ firstContactId: 8, potted: [8] }));
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 1);
  assert.match(out.reason, /early/);
});

test('8 in the called pocket after clearing the group is a win', () => {
  const r = new Rules8();
  r.startRack(0);
  r.settle(clean({ potted: [1], wasBreak: true }));
  r.settle(clean({ firstContactId: 2, potted: [2] }));
  for (const id of [3, 4, 5, 6, 7]) r.settle(clean({ firstContactId: id, potted: [id] }));
  assert.equal(r.onEight(0), true);
  assert.deepEqual(r.legalFirstIds(), [8]);
  r.callPocket(2);
  const out = r.settle(clean({ firstContactId: 8, potted: [8], pocketOf: { 8: 2 } }));
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 0);
});

test('8 without a called pocket is a loss', () => {
  const r = new Rules8();
  r.startRack(0);
  r.settle(clean({ potted: [1], wasBreak: true }));
  r.settle(clean({ firstContactId: 2, potted: [2] }));
  for (const id of [3, 4, 5, 6, 7]) r.settle(clean({ firstContactId: id, potted: [id] }));
  const out = r.settle(clean({ firstContactId: 8, potted: [8] }));  // no callPocket
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 1);
  assert.match(out.reason, /called pocket/);
});

test('8 in the wrong pocket is a loss when pocketOf is known', () => {
  const r = new Rules8();
  r.startRack(0);
  r.settle(clean({ potted: [1], wasBreak: true }));
  r.settle(clean({ firstContactId: 2, potted: [2] }));
  for (const id of [3, 4, 5, 6, 7]) r.settle(clean({ firstContactId: id, potted: [id] }));
  r.callPocket(2);
  const out = r.settle(clean({ firstContactId: 8, potted: [8], pocketOf: { 8: 5 } }));
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 1);
});

test('scratch while potting the 8 is a loss', () => {
  const r = new Rules8();
  r.startRack(0);
  r.settle(clean({ potted: [1], wasBreak: true }));
  r.settle(clean({ firstContactId: 2, potted: [2] }));
  for (const id of [3, 4, 5, 6, 7]) r.settle(clean({ firstContactId: id, potted: [id] }));
  r.callPocket(2);
  const out = r.settle(clean({ firstContactId: 8, potted: [8], cuePotted: true, pocketOf: { 8: 2 } }));
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 1);
});

test('8 on the break respots: no win, no loss, game continues', () => {
  const r = new Rules8();
  r.startRack(0);
  const out = r.settle(clean({ potted: [8, 3], wasBreak: true }));
  assert.equal(out.respot8, true);
  assert.equal(out.gameOver, false);
  assert.equal(out.winner, null);
  assert.equal(r.state.open, true);          // break never assigns
  assert.ok(r.remaining.has(8), '8 back on the table');
});

test('miss passes the turn with no ball in hand', () => {
  const r = new Rules8();
  r.startRack(0);
  const out = r.settle(clean({ firstContactId: 4 }));
  assert.equal(out.foul, false);
  assert.equal(out.nextTurn, 1);
  assert.equal(out.ballInHand, false);
});

test('legalFirstIds transitions: open -> groups -> on-eight', () => {
  const r = new Rules8();
  r.startRack(0);
  assert.deepEqual(r.legalFirstIds(), [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  r.settle(clean({ potted: [9], wasBreak: true }));
  r.settle(clean({ firstContactId: 10, potted: [10] }));  // player 0 takes stripes
  assert.deepEqual(r.legalFirstIds(), [11, 12, 13, 14, 15]);
  assert.equal(r.onEight(0), false);
  for (const id of [11, 12, 13, 14, 15]) r.settle(clean({ firstContactId: id, potted: [id] }));
  assert.equal(r.onEight(0), true);
  assert.deepEqual(r.legalFirstIds(), [8]);
});
