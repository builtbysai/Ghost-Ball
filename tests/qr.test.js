import test from 'node:test';
import assert from 'node:assert/strict';
import {qrMatrix,qrSvg} from '../src/qr.js';

test('QR matrices have the right size, finder patterns and timing lines',()=>{
 for(const [text,version] of [['HELLO',1],['https://builtbysai.com/Ghost-Ball/?join=ABC234',4]]){
  const m=qrMatrix(text),n=version*4+17;
  assert.equal(m.length,n);assert.ok(m.every(row=>row.length===n));
  for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]]){
   assert.equal(m[cy][cx],true,'finder centre');assert.equal(m[cy-1][cx-1],true);assert.equal(m[cy][cx-2],false,'finder ring gap');assert.equal(m[cy][cx-3],true,'finder outer ring');
  }
  for(let i=8;i<n-8;i++){assert.equal(m[6][i],i%2===0);assert.equal(m[i][6],i%2===0);}
  assert.equal(m[n-8][8],true,'the fixed dark module');
 }
});
test('encoding is deterministic, different text gives different codes, and over-long text is refused',()=>{
 assert.deepEqual(qrMatrix('abc'),qrMatrix('abc'));
 assert.notDeepEqual(qrMatrix('abc'),qrMatrix('abd'));
 assert.throws(()=>qrMatrix('x'.repeat(400)),RangeError);
});
test('the SVG is self-contained, labelled and sized to its matrix plus quiet zone',()=>{
 const svg=qrSvg('https://x.test/?join=ABC234',{scale:3,margin:4});
 assert.match(svg,/^<svg [^>]*role="img"/);assert.match(svg,/aria-label=/);assert.ok(!/<script|javascript:/i.test(svg));
 const n=qrMatrix('https://x.test/?join=ABC234').length;assert.match(svg,new RegExp(`viewBox="0 0 ${n+8} ${n+8}"`));
});
