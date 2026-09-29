import test from 'node:test';
import assert from 'node:assert/strict';
import { PadInput, deadzone, aimRate, DEADZONE } from '../src/gamepad.js';

const fakePad = (over = {}) => ({
  index: 0, connected: true, id: 'Test Pad',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  ...over,
});
const press = (pad, i, value = 1) => { pad.buttons[i] = { pressed: value > 0.5, value }; return pad; };

test('the deadzone swallows drift and the response starts from zero just outside it', () => {
  assert.equal(deadzone(0.1), 0);
  assert.equal(deadzone(-0.15), 0);
  assert.ok(deadzone(DEADZONE + 0.01) < 0.05, 'response should ramp up, not jump');
  assert.ok(Math.abs(deadzone(1) - 1) < 1e-9);
  assert.ok(deadzone(-0.6) < 0);
});

test('no pad means null; a pad yields sticks, and buttons fire an edge exactly once per press', () => {
  const pad = fakePad();
  let pads = [];
  const input = new PadInput(() => pads);
  assert.equal(input.poll(), null);
  pads = [pad];
  assert.ok(input.poll());
  press(pad, 0);                                   // A
  assert.equal(input.poll().edge.A, true);
  assert.equal(input.poll().edge.A, false, 'holding A must not repeat the edge');
  press(pad, 0, 0);
  assert.equal(input.poll().down.A, false);
});

test('the right stick reports how far it is pulled, and fine aim comes from the trigger or stick click', () => {
  const pad = fakePad({ axes: [0, 0, 0, 0.9] });
  const input = new PadInput(() => [pad]);
  const s = input.poll();
  assert.ok(s.ry > 0.8 && s.rx === 0);
  assert.equal(s.fine, false);
  press(pad, 6, 0.8);                              // left trigger
  assert.equal(input.poll().fine, true);
});

test('aim turns clockwise for a stick pushed right, precisely for small pushes, slower with fine aim', () => {
  assert.ok(aimRate(0.5, false) < 0, 'right should turn the aim clockwise (negative angle)');
  assert.ok(aimRate(-0.5, false) > 0);
  assert.ok(Math.abs(aimRate(0.2, false)) < Math.abs(aimRate(0.4, false)) / 3, 'small deflections should be much finer');
  assert.ok(Math.abs(aimRate(0.6, true)) < Math.abs(aimRate(0.6, false)) * 0.25);
});
