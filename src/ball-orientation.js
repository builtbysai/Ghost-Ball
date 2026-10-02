/** Deterministic visual sphere orientation. Gameplay impulses remain independent of graphics. */
export const IDENTITY=Object.freeze([1,0,0,0]);
export function orientationOf(ball){
 const q=ball?.orientation;
 return Array.isArray(q)&&q.length===4&&q.every(Number.isFinite)?q:IDENTITY;
}
export function rotateVector(q,[vx,vy,vz]){
 const [w,x,y,z]=q,tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
 return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];
}
export function advanceRoll(ball,dx,dy,radius){
 const distance=Math.hypot(dx,dy);
 if(!(distance>0)||!(radius>0))return;
 const half=distance/(2*radius),s=Math.sin(half)/distance;
 const [w,x,y,z]=orientationOf(ball),a=Math.cos(half),b=-dy*s,c=dx*s;
 const rw=a*w-b*x-c*y,rx=a*x+b*w+c*z,ry=a*y-b*z+c*w,rz=a*z+b*y-c*x,mag=Math.hypot(rw,rx,ry,rz)||1;
 ball.orientation=[rw/mag,rx/mag,ry/mag,rz/mag];
 ball.rotation=(ball.rotation||0)+distance/radius;
}
