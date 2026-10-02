/** Optional, dependency-free WebGL2 billiards table. Reads Simulation only. */
import {TableCamera3D} from './camera3d.js';
import {TABLE,POCKETS} from './physics.js';
import {halls} from './render.js';

const VERT=`#version 300 es
precision highp float;
in vec3 position;in vec3 normal;in vec2 uv;
uniform mat4 model,view,projection;
out vec3 vNormal;out vec3 vWorld;out vec2 vUv;
void main(){vec4 world=model*vec4(position,1.);vWorld=world.xyz;
 vNormal=normalize(mat3(model)*normal);vUv=uv;
 gl_Position=projection*view*world;}`;
const FRAG=`#version 300 es
precision highp float;
in vec3 vNormal;in vec3 vWorld;in vec2 vUv;
uniform vec3 color;uniform vec3 eye;uniform int materialMode;
uniform sampler2D image;
out vec4 outColor;
void main(){vec3 base=color;
 if(materialMode==1)base=texture(image,vUv).rgb;
 if(materialMode==2){float n=sin(vWorld.x*117.)*sin(vWorld.z*138.);
    base*=.967+ .034*n;}
 vec3 n=normalize(vNormal),light=normalize(vec3(-.34,1.,.6));
 float diffuse=max(dot(n,light),0.);
 float ambient=.32;
 float shine=pow(max(dot(reflect(-light,n),normalize(eye-vWorld)),0.),materialMode==1?53.:18.);
 vec3 result=base*(ambient+diffuse*.69)+vec3(1.,.87,.66)*shine*(materialMode==1?.48:.095);
 float alpha=1.;
 if(materialMode==3){result=base;alpha=.36;}
 outColor=vec4(result,alpha);
}`;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const IDENTITY=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
// Model only scales and rotates about world Y. Ball rotation is applied as a separate rolling angle.
function transform(x=0,y=0,z=0,sx=1,sy=1,sz=1,yaw=0,roll=0){
 const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(roll),b=Math.sin(roll);
 // R_y(yaw)*R_z(roll)*S; translated in world space.
 return new Float32Array([
  c*a*sx, b*sx, -s*a*sx,0,
  -c*b*sy,a*sy,s*b*sy,0,
  s*sz,0,c*sz,0,
  x,y,z,1,
 ]);
}
function quad(out,a,b,c,d,n){for(const p of [a,b,c,a,c,d])out.push(...p,...n,0,0);}
function cube(){const a=[];const v=(x,y,z)=>[x,y,z];
 quad(a,v(-.5,.5,-.5),v(-.5,.5,.5),v(.5,.5,.5),v(.5,.5,-.5),[0,1,0]);
 quad(a,v(-.5,-.5,.5),v(-.5,-.5,-.5),v(.5,-.5,-.5),v(.5,-.5,.5),[0,-1,0]);
 quad(a,v(-.5,-.5,.5),v(.5,-.5,.5),v(.5,.5,.5),v(-.5,.5,.5),[0,0,1]);
 quad(a,v(.5,-.5,-.5),v(-.5,-.5,-.5),v(-.5,.5,-.5),v(.5,.5,-.5),[0,0,-1]);
 quad(a,v(.5,-.5,.5),v(.5,-.5,-.5),v(.5,.5,-.5),v(.5,.5,.5),[1,0,0]);
 quad(a,v(-.5,-.5,-.5),v(-.5,-.5,.5),v(-.5,.5,.5),v(-.5,.5,-.5),[-1,0,0]);return a;}
function ballMesh(){const out=[],lat=20,lon=28;
 const point=(i,j)=>{const t=i/lat*Math.PI,p=j/lon*Math.PI*2;
  return [Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p),j/lon,1-i/lat];};
 for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
  const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1);
  // Explicit longitude UV; triangles retain the wrapped seam.
  for(const v of [a,b,c,a,c,d])out.push(v[0],v[1],v[2],v[0],v[1],v[2],v[3],v[4]);
 }return out;}
function disk(){const a=[],segments=30;for(let i=0;i<segments;i++){
 const t=i*Math.PI*2/segments,q=(i+1)*Math.PI*2/segments;
 for(const [x,z] of [[0,0],[Math.cos(t),Math.sin(t)],[Math.cos(q),Math.sin(q)]])a.push(x,0,z,0,1,0,0,0);
 }return a;}
function createProgram(gl,vs,fs){
 const shader=(type,src)=>{const o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(o));return o;};
 const a=shader(gl.VERTEX_SHADER,vs),b=shader(gl.FRAGMENT_SHADER,fs),program=gl.createProgram();
 gl.attachShader(program,a);gl.attachShader(program,b);gl.linkProgram(program);gl.deleteShader(a);gl.deleteShader(b);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));return program;}
function gpuMesh(gl,program,values){const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
 const stride=8*4;for(const [name,count,offset] of [['position',3,0],['normal',3,3],['uv',2,6]]){
 const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,count,gl.FLOAT,false,stride,offset*4);}
 gl.bindVertexArray(null);return {vao,buffer,count:values.length/8};}
function ballTexture(id,color){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const c=canvas.getContext('2d');
 c.fillStyle=(id>=9?'#f5f2e8':color);c.fillRect(0,0,256,128);
 if(id>=9){c.fillStyle=color;c.fillRect(0,40,256,48);}
 if(id===0){c.fillStyle='#c44436';c.beginPath();c.arc(64,41,2.5,0,Math.PI*2);c.fill();}
 else for(const x of [64,192])for(const y of [26,102]){
  c.fillStyle='#f6f3e8';c.beginPath();c.arc(x,y,16,0,Math.PI*2);c.fill();
  c.fillStyle='#211b16';c.font=`bold ${id>=10?16:19}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText(String(id),x,y+1);
 }
 return canvas;}
export class WebGLTableRenderer {
 constructor(canvas,{hall=0,onContextLost=()=>{}}={}){
  this.canvas=canvas;this.hall=hall;this.onContextLost=onContextLost;this.lost=false;
  this.camera=new TableCamera3D(600,400);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.onContextLost();});
  canvas.addEventListener('webglcontextrestored',()=>{try{this.lost=false;this.initResources();this.resize();}catch{this.lost=true;this.onContextLost();}});
  this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power',depth:true});
  if(!this.gl)throw Error('WebGL2 unavailable');this.initResources();this.resize();
 }
 initResources(){const gl=this.gl;this.program=createProgram(gl,VERT,FRAG);
  this.meshes={cube:gpuMesh(gl,this.program,cube()),ball:gpuMesh(gl,this.program,ballMesh()),disk:gpuMesh(gl,this.program,disk())};
  this.uniforms=Object.fromEntries(['model','view','projection','color','eye','materialMode','image'].map(x=>[x,gl.getUniformLocation(this.program,x)]));
  this.textures=Array.from({length:16},(_,id)=>{const colors=['#efece3','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d'];
   const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ballTexture(id,colors[id]));
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.generateMipmap(gl.TEXTURE_2D);return t;});
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 }
 setHall(index){this.hall=index;}
 resize(){if(this.lost)return;const rect=this.canvas.getBoundingClientRect();this.w=Math.max(1,rect.width);this.h=Math.max(1,rect.height);
  const maxDpr=Math.sqrt(1300000/(this.w*this.h)),dpr=Math.max(.6,Math.min(1.5,window.devicePixelRatio||1,maxDpr));
  const w=Math.ceil(this.w*dpr),h=Math.ceil(this.h*dpr);if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
  this.gl.viewport(0,0,w,h);this.camera.resize(this.w,this.h);
 }
 project(x,y){return this.camera.project(x,y);}
 unproject(x,y){return this.camera.unproject(x,y);}
 draw(sim){if(this.lost)return;const gl=this.gl,h=halls[this.hall],portrait=this.camera.portrait,yaw=portrait?Math.PI/2:0;
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
  const u=this.uniforms;gl.uniformMatrix4fv(u.view,false,this.camera.view);gl.uniformMatrix4fv(u.projection,false,this.camera.projection);
  gl.uniform3fv(u.eye,this.camera.eye);gl.uniform1i(u.image,0);
  const draw=(mesh,hex,model,mode=0,texture=0)=>{gl.bindVertexArray(this.meshes[mesh].vao);gl.uniformMatrix4fv(u.model,false,model);
   gl.uniform3fv(u.color,typeof hex==='string'?rgb(hex):hex);gl.uniform1i(u.materialMode,mode);
   if(mode===1){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[texture]);}
   gl.drawArrays(gl.TRIANGLES,0,this.meshes[mesh].count);};
  const local=(x,y,z,sx,sy,sz)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return transform(c*x+s*z,y,-s*x+c*z,sx,sy,sz,yaw);};
  // Solid objects: legs below the slate, walnut apron, green cloth bed, segmented rails.
  for(const x of [-4.5,4.5])for(const z of [-2.12,2.12])draw('cube','#3b2518',local(x,-.87,z,.39,1.6,.39));
  draw('cube',h.rail,local(0,-.21,0,11.1,.46,6.08));
  draw('cube',h.wood,local(0,.037,0,11.05,.16,6.04));
  draw('cube',h.felt,local(0,.105,0,10.05,.075,5.05),2);
  for(const z of [-2.73,2.73])for(const x of [-2.9,2.9]){
   draw('cube',h.wood,local(x,.22,z,4.89,.27,.54));
   draw('cube',h.feltLight,local(x,.19,z+(z>0?-.19:.19),4.64,.13,.15),2);
   for(const dx of [-1.35,0,1.35])draw('cube','#e1c690',local(x+dx,.366,z,.105,.008,.08));
  }
  for(const x of [-5.31,5.31]){
   draw('cube',h.wood,local(x,.22,0,.5,.27,4.45));
   draw('cube',h.feltLight,local(x+(x>0?-.17:.17),.19,0,.15,.13,4.19),2);
  }
  // Pocket wells cover the cloth at each open rail mouth.
  for(const [x,y] of POCKETS){draw('disk','#070906',local((x-500)/100,.151,(y-250)/100,.31,1,.31));}
  // Contact shadows anchor every ball to the same 3D felt surface.
  for(const b of sim.balls){if(b.pocketed)continue;const [x,,z]=this.camera.toWorld(b.x,b.y);
   draw('disk',[0.005,0.007,0.006],transform(x,.153,z,.195,1,.17),3);
  }
  for(const b of sim.balls){if(b.pocketed)continue;const [x,,z]=this.camera.toWorld(b.x,b.y);
   const scaled=TABLE.radius/100;draw('ball','#ffffff',transform(x,.16+scaled,z,scaled,scaled,scaled,0,b.rotation*.27),1,b.id);
  }
  gl.bindVertexArray(null);
 }
 dispose(){const gl=this.gl;if(!gl||this.lost)return;
  for(const mesh of Object.values(this.meshes)){gl.deleteVertexArray(mesh.vao);gl.deleteBuffer(mesh.buffer);}
  for(const tex of this.textures)gl.deleteTexture(tex);gl.deleteProgram(this.program);
 }
}
