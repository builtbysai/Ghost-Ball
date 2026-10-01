// Rules9 rotation state machine (casual 9-ball).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rules9 } from '../src/sim/rules.js';

const clean = (over = {}) => ({
  firstContactId: 1, potted: [], cuePotted: false, railAfterContact: true, wasBreak: false, ...over,
});

test('legalFirstIds is always the lowest ball on the table', () => {
  const r = new Rules9();
  r.startRack(0);
  assert.deepEqual(r.legalFirstIds(), [1]);
  r.settle(clean({ potted: [1] }));
  assert.deepEqual(r.legalFirstIds(), [2]);
  r.settle(clean({ firstContactId: 2, potted: [2, 3] }));
  assert.deepEqual(r.legalFirstIds(), [4]);
});

test('hitting anything but the lowest first is a foul, ball in hand anywhere', () => {
  const r = new Rules9();
  r.startRack(0);
  const out = r.settle(clean({ firstContactId: 3 }));
  assert.equal(out.foul, true);
  assert.match(out.reason, /lowest/);
  assert.equal(out.ballInHand, 'anywhere');
  assert.equal(out.nextTurn, 1);
});

test('a legal pot keeps the turn; a dry legal shot passes it', () => {
  const r = new Rules9();
  r.startRack(0);
  assert.equal(r.settle(clean({ potted: [1] })).nextTurn, 0);
  assert.equal(r.settle(clean({ firstContactId: 2 })).nextTurn, 1);
});

test('the 9 on a legal shot wins at any point in the rack', () => {
  const r = new Rules9();
  r.startRack(0);
  // Combo: hit the 1 first, the 9 drops. Instant win.
  const out = r.settle(clean({ potted: [9] }));
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 0);
  assert.equal(out.respotId, null);
  assert.equal(r.state.over, true);
});

test('the 9 on the break wins when the break is clean', () => {
  const r = new Rules9();
  r.startRack(0);
  const out = r.settle(clean({ potted: [9], wasBreak: true }));
  assert.equal(out.gameOver, true);
  assert.equal(out.winner, 0);
});

test('a scratched break sends ball in hand to the kitchen', () => {
  const r = new Rules9();
  r.startRack(0);
  const out = r.settle(clean({ cuePotted: true, wasBreak: true }));
  assert.equal(out.foul, true);
  assert.equal(out.ballInHand, 'kitchen');
  assert.equal(out.nextTurn, 1);
});

test('the 9 dropped on a foul is re-spotted and the rack goes on', () => {
  const r = new Rules9();
  r.startRack(0);
  const out = r.settle(clean({ firstContactId: 4, potted: [9] }));
  assert.equal(out.foul, true);
  assert.equal(out.gameOver, false);
  assert.equal(out.respot9, true);
  assert.equal(out.respotId, 9);
  assert.equal(r.remaining.has(9), true);
  assert.equal(out.ballInHand, 'anywhere');
});

test('a scratched 9 is re-spotted, not a loss', () => {
  const r = new Rules9();
  r.startRack(0);
  r.settle(clean({ potted: [1, 2, 3, 4, 5, 6, 7, 8] })); // run down to the 9
  assert.equal(r.onEight(), true);
  const out = r.settle(clean({ firstContactId: 9, potted: [9], cuePotted: true }));
  assert.equal(out.gameOver, false);
  assert.equal(out.respotId, 9);
  assert.equal(out.ballInHand, 'anywhere');
});

test('no contact and no-rail are fouls; groups never appear', () => {
  const r = new Rules9();
  r.startRack(0);
  assert.equal(r.settle(clean({ firstContactId: null })).foul, true);
  const r2 = new Rules9();
  r2.startRack(0);
  assert.equal(r2.settle(clean({ railAfterContact: false })).foul, true);
  assert.deepEqual(r2.state.groups, [null, null]);
  assert.equal(r2.state.open, true);
});
