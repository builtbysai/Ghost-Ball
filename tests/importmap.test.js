import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// Every shipped module must be cache-busted by the import map, or a stale module
// can be paired with a fresh main.js after a release.
test('the import map versions every source module',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const map=JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(html)[1]).imports;
 const release=/const RELEASE="([^"]+)"/.exec(readFileSync(new URL('../sw.js',import.meta.url),'utf8'))[1];
 for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.js')&&f!=='main.js')){
  assert.equal(map['./src/'+file],`./src/${file}?v=${release}`,file+' is missing or on another release');
 }
});
