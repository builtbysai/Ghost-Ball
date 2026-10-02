/** Camera/projection math without WebGL or DOM; both aiming and rendering use this. */
import {TABLE} from './physics.js';
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const norm=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export class TableCamera3D {
  constructor(width=500,height=400){this.resize(width,height);}
  toWorld(x,y,up=0){return this.portrait?[(y-TABLE.height/2)/100,up,(TABLE.width/2-x)/100]:[(x-TABLE.width/2)/100,up,(y-TABLE.height/2)/100];}
  fromWorld(X,Z){return this.portrait?{x:TABLE.width/2-Z*100,y:TABLE.height/2+X*100}:{x:TABLE.width/2+X*100,y:TABLE.height/2+Z*100};}
  resize(width,height){
    this.w=Math.max(1,width);this.h=Math.max(1,height);this.aspect=this.w/this.h;
    this.portrait=this.w<=600&&this.h>this.w*1.24;
    this.tan=Math.tan(Math.PI*42/360);
    // The portrait camera is closer to overhead to leave an unobstructed long axis.
    const pitch=this.portrait?.34:.60;
    this.forward=norm([0,-1,-pitch]);this.right=[1,0,0];
    this.up=norm([0,pitch,-1]);
    const cornerWorld=this.portrait?[[2.95,5.55],[-2.95,5.55],[2.95,-5.55],[-2.95,-5.55]]:[[5.55,2.95],[-5.55,2.95],[5.55,-2.95],[-5.55,-2.95]];
    this.distance=9;
    for(let i=0;i<200;i++){
      this.eye=[0,this.distance/Math.sqrt(1+pitch*pitch),this.distance*pitch/Math.sqrt(1+pitch*pitch)];
      if(cornerWorld.every(([x,z])=>{const p=this.projectWorld([x,0,z]);return Math.abs((p.sx/this.w-.5)*2)<.89&&Math.abs((p.sy/this.h-.5)*2)<.89;}))break;
      this.distance+=.16;
    }
    this.near=.1;this.far=80;
    const f=1/this.tan,a=this.aspect,n=this.near,far=this.far;
    this.projection=new Float32Array([f/a,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]);
    const [r,u,v]=[this.right,this.up,this.forward],e=this.eye;
    this.view=new Float32Array([
      r[0],u[0],-v[0],0,r[1],u[1],-v[1],0,r[2],u[2],-v[2],0,
      -dot(r,e),-dot(u,e),dot(v,e),1,
    ]);
  }
  projectWorld(p){const d=p.map((v,i)=>v-this.eye[i]),depth=dot(d,this.forward);
    const nx=dot(d,this.right)/(depth*this.tan*this.aspect),ny=dot(d,this.up)/(depth*this.tan);
    return {sx:(nx*.5+.5)*this.w,sy:(.5-ny*.5)*this.h,depth};
  }
  project(x,y){const {sx,sy}=this.projectWorld(this.toWorld(x,y,.14));return [sx,sy,1];}
  unproject(sx,sy){const nx=(sx/this.w*2-1)*this.tan*this.aspect,ny=(1-sy/this.h*2)*this.tan;
    const direction=norm(this.forward.map((v,i)=>v+this.right[i]*nx+this.up[i]*ny));
    const t=-this.eye[1]/direction[1];if(!(t>0))return {x:500,y:250};
    const x=this.eye[0]+direction[0]*t,z=this.eye[2]+direction[2]*t;
    const result=this.fromWorld(x,z);return {x:clamp(result.x,0,TABLE.width),y:clamp(result.y,0,TABLE.height)};
  }
}
