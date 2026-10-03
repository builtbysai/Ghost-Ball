import test from 'node:test';
import assert from 'node:assert/strict';
import {Audio,impactFor} from '../src/audio.js';

test('collision transients follow measured impulse without amplifying tiny micro-collisions',()=>{
 assert.equal(impactFor({type:'contact',speed:17.9}),null);
 assert.equal(impactFor({type:'rail',speed:34}),null);
 const soft=impactFor({type:'contact',speed:80});
 const hard=impactFor({type:'contact',speed:900});
 assert.equal(soft.family,'contact');assert.ok(hard.volume>soft.volume);
 assert.ok(hard.frequency<soft.frequency);
 assert.ok(impactFor({type:'rail',speed:200,jaw:true}).frequency<
  impactFor({type:'rail',speed:200}).frequency);
 assert.equal(impactFor({type:'pocket',id:4}).family,'pocket');
 assert.equal(impactFor({type:'unrelated'}),null);
});
test('close contacts are clustered without suppressing different physical sounds',()=>{
 const audio=new Audio();audio.ctx={currentTime:1,state:'running'};
 const notes=[];audio.tone=note=>notes.push(note);
 const contact={type:'contact',speed:900};
 audio.play(contact);
 assert.equal(notes.length,2,'hard impacts have a quick upper click');
 audio.ctx.currentTime+=.006;audio.play(contact);
 assert.equal(notes.length,2,'near-simultaneous contacts are one cluster');
 audio.play({type:'rail',speed:300});
 assert.equal(notes.length,3,'a rail is an independent physical event');
 audio.ctx.currentTime+=.02;audio.play(contact);
 assert.equal(notes.length,5,'a later hit gets its own sound');
});
test('mute is absolute; restoring it does not invent a queued impact',()=>{
 const audio=new Audio();audio.ctx={currentTime:2,state:'running'};
 const notes=[];audio.tone=note=>notes.push(note);
 audio.enabled=false;
 audio.play({type:'strike',power:1});audio.play({type:'pocket'});
 assert.equal(notes.length,0);
 audio.enabled=true;audio.play({type:'pocket'});
 assert.equal(notes.length,1);
 audio.ctx.state='suspended';audio.play({type:'strike',power:1});
 assert.equal(notes.length,1,'background tabs should schedule no sound');
});
test('result sounds are concise and do not require a full match soundboard',()=>{
 const audio=new Audio();audio.ctx={currentTime:1,state:'running'};
 const notes=[];audio.tone=note=>notes.push(note);
 audio.play({type:'win'});assert.equal(notes.length,3);
 assert.ok(notes[2].delay>.1);
 notes.length=0;audio.play({type:'loss'});assert.equal(notes.length,2);
 notes.length=0;audio.play({type:'strike',power:1});
 assert.equal(notes.length,2);
 assert.ok(notes[1].volume>notes[0].volume);
});
