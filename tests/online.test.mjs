import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, cleanPlan, OnlineLink, loopbackPair, applyTimeout, newCode, cleanCode, validCode, EMOTES } from '../src/online.js';
import { snapshot, restore, divergence, inSync, digest } from '../src/sync.js';
import { newMatch, playShotNow } from '../src/game.js';
import { planNow, LEVELS } from '../src/ai.js';
import { rng } from '../src/table.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

test('inbound messages are validated: junk is dropped, numbers are clamped, and a shot cannot exceed the game\'s limits', () => {
  assert.equal(sanitize(null), null);
  assert.equal(sanitize({ t: 'nope' }), null);
  assert.equal(sanitize({ t: 'shot', plan: 'x' }), null);
  assert.equal(sanitize({ t: 'start', cfg: { kind: 'chess', hall: 'parlor' } }), null, 'unknown game kind');
  const shot = sanitize({ t: 'shot', n: 3, plan: { angle: NaN, speed: 9999, a: 5, b: -5, jump: 0.3, masse: 7, called: 99, extra: 'ignored' } });
  assert.ok(shot.plan.speed <= 9.5, 'speed is capped at the cue\'s maximum');
  assert.ok(Math.hypot(shot.plan.a, shot.plan.b) <= 0.5 + 1e-9, 'tip offset cannot exceed the miscue limit');
  assert.ok([0, 0.28, 0.4, 0.52].includes(shot.plan.jump), 'jump snaps to a real elevation');
  assert.ok([0, 0.9, 1.1, 1.3].includes(shot.plan.masse));
  assert.ok(shot.plan.called <= 5 && shot.plan.called >= -1);
  assert.ok(Number.isFinite(shot.plan.angle));
  assert.equal(shot.plan.extra, undefined);
  assert.equal(sanitize({ t: 'hello', name: '<img src=x onerror=alert(1)>Bob\u0000' }).name, 'img srcx onerroralert1Bob'.slice(0, 16));
  assert.equal(sanitize({ t: 'emote', id: 999 }).id, EMOTES.length - 1);
});

test('room codes avoid look-alike characters and are validated', () => {
  const c = newCode(rng(7));
  assert.equal(c.length, 6);
  assert.ok(validCode(c));
  assert.ok(!/[01OIL]/.test(newCode(rng(99))));
  assert.equal(cleanCode(' ab-c d2e3f4 '), 'ABCD2E');
  assert.equal(validCode('ABC10O'), false);
});

test('two ends shake hands, learn each other\'s names, measure round-trip time, and survive a message flood', async () => {
  const { a, b, connect } = loopbackPair();
  let clock = 1000;
  const host = new OnlineLink(a, { role: 'host', name: 'Hana', now: () => clock });
  const guest = new OnlineLink(b, { role: 'guest', name: 'Gus', now: () => clock });
  connect(); await tick(); await tick();
  assert.equal(host.peerName, 'Gus');
  assert.equal(guest.peerName, 'Hana');
  host.ping(); clock += 40; await tick(); await tick();
  assert.ok(host.rtt >= 0 && host.rtt <= 40, `rtt ${host.rtt}`);
  let aims = 0;
  guest.on.aim = () => { aims++; };
  for (let i = 0; i < 500; i++) host.send({ t: 'aim', ang: 0, pw: 0, sa: 0, sb: 0, el: 0 });
  await tick(); await tick();
  assert.ok(aims <= 120, `a flood should be rate limited, delivered ${aims}`);
});

// Two players, two matches, only shots crossing the wire. Everything else must agree by itself.
function twoPlayers(kind, seed) {
  const cfg = { kind, seed, pocket: 'standard', cloth: 'standard' };
  return [newMatch(cfg), newMatch(cfg)];
}

test('two independent simulations fed the same shots stay in sync shot after shot, through fouls, pots and turn changes', () => {
  for (const kind of ['eight', 'nine']) {
    const [host, guest] = twoPlayers(kind, 41);
    const rand = rng(5);
    let shots = 0;
    while (host.rules.winner == null && shots < 40) {
      const plan = planNow({ sim: host.sim, rules: host.rules, table: host.table, level: LEVELS[shots % 3], rand });
      // the shooter sends {plan}; both ends apply it. The cue ball placement (ball in hand) travels with the plan.
      playShotNow(host, plan);
      playShotNow(guest, plan);
      shots++;
      const d = divergence(guest, snapshot(host));
      assert.ok(inSync(d), `${kind} shot ${shots}: ${JSON.stringify(d)}`);
      assert.equal(digest(host), digest(guest));
    }
    assert.ok(shots > 3);
  }
});

test('a guest that has drifted, or missed a shot, is pulled back to the host\'s snapshot', () => {
  const [host, guest] = twoPlayers('eight', 8);
  const rand = rng(3);
  playShotNow(host, planNow({ sim: host.sim, rules: host.rules, table: host.table, level: LEVELS[1], rand }));
  // the guest never saw the shot at all
  const snap = snapshot(host);
  assert.equal(inSync(divergence(guest, snap)), false, 'the guest should be visibly out of sync');
  restore(guest, JSON.parse(JSON.stringify(snap)));                   // through JSON, as over the wire
  assert.ok(inSync(divergence(guest, snap)));
  assert.equal(digest(guest), digest(host));
  // and the next shot plays out identically from the restored state
  const plan = planNow({ sim: host.sim, rules: host.rules, table: host.table, level: LEVELS[1], rand });
  playShotNow(host, plan); playShotNow(guest, plan);
  assert.equal(digest(guest), digest(host));
});

test('a player who dropped out and rejoins receives the full state and can carry on', () => {
  const [host] = twoPlayers('nine', 12);
  const rand = rng(9);
  for (let i = 0; i < 4; i++) playShotNow(host, planNow({ sim: host.sim, rules: host.rules, table: host.table, level: LEVELS[1], rand }));
  const wire = JSON.stringify({ t: 'resume', cfg: { kind: 'nine', hall: 'parlor', seed: 12, names: ['A', 'B'] }, snap: snapshot(host), n: 4 });
  const msg = sanitize(JSON.parse(wire));
  assert.ok(msg, 'a resume message must survive validation');
  const back = newMatch({ kind: 'nine', seed: 12 });
  restore(back, msg.snap);
  assert.equal(digest(back), digest(host));
  assert.equal(back.rules.turn, host.rules.turn);
  assert.deepEqual(back.stats.map((s) => s.pots), host.stats.map((s) => s.pots));
});

test('running out the shot clock passes the turn and gives the opponent ball in hand', () => {
  const m = newMatch({ kind: 'eight', seed: 2 });
  m.rules = { ...m.rules, breakShot: false, ballInHand: false, turn: 0 };
  const after = applyTimeout(m.rules);
  assert.equal(after.turn, 1);
  assert.equal(after.ballInHand, true);
  assert.equal(after.fouls[0], 1);
  assert.equal(m.rules.turn, 0, 'the original state must not be mutated');
  const sp = newMatch({ kind: 'straight', seed: 2 });
  sp.rules = { ...sp.rules, breakShot: false, turn: 0 };
  assert.equal(applyTimeout(sp.rules).score[0], -1);
});

test('cleanPlan never returns something the physics cannot handle', () => {
  for (const bad of [{}, { speed: -5 }, { speed: Infinity, angle: 1e9 }, { a: 'x', b: null }]) {
    const p = cleanPlan(bad);
    assert.ok(Number.isFinite(p.angle) && Number.isFinite(p.speed) && p.speed >= 0.35 && p.speed <= 9.5);
    assert.ok(Number.isFinite(p.a) && Number.isFinite(p.b));
  }
});
