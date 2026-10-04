import test from 'node:test';
import assert from 'node:assert/strict';
import {HALL_MUSIC,barPlan,chordNotes,midiHz,Music} from '../src/music.js';

test('every hall has its own key and tempo',()=>{
 assert.equal(HALL_MUSIC.length,5);
 assert.equal(new Set(HALL_MUSIC.map(h=>h.bpm)).size,5);
 for(const h of HALL_MUSIC)assert.ok(h.bpm>=55&&h.bpm<=90,'a slow, unobtrusive tempo');
});
test('bars are deterministic, in a sane register and within the bar length',()=>{
 for(const hall of HALL_MUSIC)for(let bar=0;bar<16;bar++){
  const a=barPlan(hall,bar),b=barPlan(hall,bar);
  assert.deepEqual(a,b);
  assert.ok(Math.abs(a.bar-4*60/hall.bpm)<1e-9);
  for(const e of a.events){
   assert.ok(e.at>=0&&e.at<a.bar,'event starts inside the bar');
   if(e.note!==undefined)assert.ok(e.note>=24&&e.note<=96&&midiHz(e.note)>30&&midiHz(e.note)<2200);
  }
  assert.ok(a.events.some(e=>e.kind==='bass')&&a.events.some(e=>e.kind==='keys'));
 }
});
test('chords are four-note seventh voicings',()=>{
 assert.deepEqual(chordNotes(53,0,'maj7'),[65,69,72,76]);
 assert.equal(chordNotes(50,0,'m7').length,4);
});
test('music does nothing without an audio context and clamps the hall',()=>{
 const m=new Music();m.start();m.pump();assert.equal(m.timer,null);
 m.setHall(99);assert.equal(m.hall,4);m.setHall(-3);assert.equal(m.hall,0);
});
