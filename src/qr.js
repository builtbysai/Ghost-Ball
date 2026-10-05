/**
 * A small, dependency-free QR code encoder (byte mode, error-correction level M, versions 1-6) used for the online
 * invite. It returns the module matrix, or an SVG string for the invite sheet. Based on the standard QR Model 2 layout
 * (ISO/IEC 18004): function patterns, Reed-Solomon over GF(256), zigzag placement and mask selection.
 */
const ECC_PER_BLOCK=[10,16,26,18,24,16],BLOCKS=[1,1,1,2,2,4];   // level M, versions 1..6
const MAX_VERSION=6;
const sizeOf=version=>version*4+17;
function alignPositions(version){
 if(version===1)return [];
 const count=Math.floor(version/7)+2,size=sizeOf(version),step=Math.ceil((version*4+4)/(count*2-2))*2,result=[6];
 for(let pos=size-7;result.length<count;pos-=step)result.splice(1,0,pos);
 return result;
}
function rawModules(version){
 let result=(16*version+128)*version+64;
 if(version>=2){const n=Math.floor(version/7)+2;result-=(25*n-10)*n-55;}
 return result;
}
const dataCapacity=version=>Math.floor(rawModules(version)/8)-ECC_PER_BLOCK[version-1]*BLOCKS[version-1];
function gfMul(a,b){let r=0;for(let i=7;i>=0;i--){r=(r<<1)^((r>>>7)*0x11D);r^=((b>>>i)&1)*a;}return r&255;}
function rsDivisor(degree){
 const result=new Array(degree).fill(0);result[degree-1]=1;let root=1;
 for(let i=0;i<degree;i++){
  for(let j=0;j<degree;j++){result[j]=gfMul(result[j],root);if(j+1<degree)result[j]^=result[j+1];}
  root=gfMul(root,2);
 }
 return result;
}
function rsRemainder(data,divisor){
 const result=divisor.map(()=>0);
 for(const b of data){
  const factor=b^result.shift();result.push(0);
  divisor.forEach((coef,i)=>{result[i]^=gfMul(coef,factor);});
 }
 return result;
}
export function qrMatrix(text){
 const bytes=[...new TextEncoder().encode(String(text))];
 let version=1;
 while(version<=MAX_VERSION&&(4+8+bytes.length*8>dataCapacity(version)*8))version++;
 if(version>MAX_VERSION)throw new RangeError('Text is too long for this QR encoder');
 // bit stream: mode (byte), length, payload, terminator, padding
 const bits=[];const put=(value,len)=>{for(let i=len-1;i>=0;i--)bits.push((value>>>i)&1);};
 put(4,4);put(bytes.length,8);bytes.forEach(b=>put(b,8));
 const capacityBits=dataCapacity(version)*8;
 put(0,Math.min(4,capacityBits-bits.length));while(bits.length%8)bits.push(0);
 const data=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
 for(let pad=0xEC;data.length<dataCapacity(version);pad^=0xEC^0x11)data.push(pad);
 // split into blocks, add error correction, interleave
 const blocks=BLOCKS[version-1],eccLen=ECC_PER_BLOCK[version-1],raw=Math.floor(rawModules(version)/8);
 const shortBlocks=blocks-raw%blocks,shortLen=Math.floor(raw/blocks),divisor=rsDivisor(eccLen),all=[];
 for(let i=0,k=0;i<blocks;i++){
  const len=shortLen-eccLen+(i<shortBlocks?0:1),chunk=data.slice(k,k+len);k+=len;
  const ecc=rsRemainder(chunk,divisor);if(i<shortBlocks)chunk.push(0);all.push(chunk.concat(ecc));
 }
 const stream=[];
 for(let i=0;i<all[0].length;i++)all.forEach((block,j)=>{if(i!==shortLen-eccLen||j>=shortBlocks)stream.push(block[i]);});
 // function patterns
 const size=sizeOf(version),modules=Array.from({length:size},()=>new Array(size).fill(false)),fn=Array.from({length:size},()=>new Array(size).fill(false));
 const set=(x,y,dark)=>{modules[y][x]=dark;fn[y][x]=true;};
 for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
  const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=size||y>=size)continue;
  const dist=Math.max(Math.abs(dx),Math.abs(dy));set(x,y,dist!==2&&dist!==4);}};
 finder(3,3);finder(size-4,3);finder(3,size-4);
 const pos=alignPositions(version);
 pos.forEach((cx,i)=>pos.forEach((cy,j)=>{
  if((i===0&&j===0)||(i===0&&j===pos.length-1)||(i===pos.length-1&&j===0))return;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
 }));
 const drawFormat=mask=>{
  const formatData=(0<<3)|mask;let rem=formatData;           // level M format bits are 00
  for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
  const bitsF=((formatData<<10)|rem)^0x5412,bit=i=>((bitsF>>>i)&1)!==0;
  for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
  for(let i=9;i<15;i++)set(14-i,8,bit(i));
  for(let i=0;i<8;i++)set(size-1-i,8,bit(i));
  for(let i=8;i<15;i++)set(8,size-15+i,bit(i));
  set(8,size-8,true);
 };
 drawFormat(0); // reserve the format area before placing data
 // zigzag data placement
 for(let i=0,right=size-1;right>=1;right-=2){
  if(right===6)right=5;
  for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
   const x=right-j,upward=((right+1)&2)===0,y=upward?size-1-vert:vert;
   if(!fn[y][x]&&i<stream.length*8){modules[y][x]=((stream[i>>>3]>>>(7-(i&7)))&1)!==0;i++;}
  }
 }
 // choose the mask with the lowest simple penalty
 const masks=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
  (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
 const apply=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y][x]&&masks[m](x,y))modules[y][x]=!modules[y][x];};
 const penalty=()=>{
  let score=0;
  for(let y=0;y<size;y++)for(let pass=0;pass<2;pass++){let run=1;
   for(let x=1;x<size;x++){const a=pass?modules[x][y]:modules[y][x],b=pass?modules[x-1][y]:modules[y][x-1];
    if(a===b){run++;if(run===5)score+=3;else if(run>5)score++;}else run=1;}}
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=modules[y][x];if(c===modules[y][x+1]&&c===modules[y+1][x]&&c===modules[y+1][x+1])score+=3;}
  const dark=modules.flat().filter(Boolean).length,total=size*size;score+=Math.floor(Math.abs(dark*20-total*10)/total)*10;
  return score;
 };
 let best=0,bestScore=Infinity;
 for(let m=0;m<8;m++){apply(m);drawFormat(m);const s=penalty();if(s<bestScore){bestScore=s;best=m;}apply(m);}
 apply(best);drawFormat(best);
 return modules;
}
/** An accessible SVG of the code: dark modules on a white quiet zone. */
export function qrSvg(text,{scale=4,margin=4,dark='#10141c',light='#ffffff'}={}){
 const m=qrMatrix(text),size=m.length+margin*2;
 let path='';
 m.forEach((row,y)=>row.forEach((on,x)=>{if(on)path+=`M${x+margin} ${y+margin}h1v1h-1z`;}));
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size*scale}" height="${size*scale}" role="img" aria-label="QR code for the invite link" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
