import {LightRenderer,LightVertex} from './LightRenderer';
export type Vec = [number, number, number, number?, number?];
export type Camera = {pitch:number; yaw:number; size:number; centerY:number;roll?:number};
export type Fiber = {
  points:Vec[]; opacity:number; width:number; accent:boolean;
  closed?:boolean; taper?:boolean; energy?:number; color?:[number,number,number];
};
type RGB = [number, number, number];

export const rotate = (p:Vec, pitch:number, yaw:number):Vec => {
  const x = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw);
  const z = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
  return [x, p[1] * Math.cos(pitch) - z * Math.sin(pitch), p[1] * Math.sin(pitch) + z * Math.cos(pitch)];
};
export const project = (p:Vec, c:Camera):Vec => {
  const [x,y,z] = rotate(p,c.pitch,c.yaw), k = 5.5 / (5.5 - z);
  const roll=c.roll??0,rx=x*Math.cos(roll)-y*Math.sin(roll),ry=x*Math.sin(roll)+y*Math.cos(roll);
  return [540 + rx * c.size * k, c.centerY - ry * c.size * k, z, Math.hypot(p[0],p[1],p[2]), Math.hypot(p[0],p[2])];
};
const renderers=new WeakMap<HTMLCanvasElement,LightRenderer>();
export const beginCanvas=(canvas:HTMLCanvasElement|null)=>{
  if(!canvas)return null;
  let renderer=renderers.get(canvas);
  if(!renderer){renderer=new LightRenderer(canvas);renderers.set(canvas,renderer);}
  renderer.begin();return renderer;
};
export const releaseCanvas=(canvas:HTMLCanvasElement)=>{renderers.get(canvas)?.dispose();renderers.delete(canvas);};
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v+(b[i]-v)*t) as RGB;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));

export function drawFiber(ctx:LightRenderer,fiber:Fiber){
  const {points,opacity,width,accent,energy=0,taper=false}=fiber;
  if(points.length<2||opacity<.003)return;
  const pairs:LightVertex[][]=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    let dx=next[0]-previous[0],dy=next[1]-previous[1];
    const length=Math.max(.0001,Math.hypot(dx,dy));dx/=length;dy/=length;
    const front=clamp((p[2]+1)/2),inward=clamp(1-(p[3]??1)),axis=p[4]??1;
    const axisDensity=.20+.80*Math.min(1,axis/.16);
    const screenRadius=Math.hypot(p[0]-540,p[1]-540);
    const density=(1-energy*.88*Math.min(1,inward/.82))*axisDensity
      *(1-energy*.42)*(1-energy*.45*(1-Math.min(1,screenRadius/290)));
    const progress=i/(points.length-1);
    const fade=taper?.025+.975*progress**.85:1;
    const alpha=opacity*(.58+.42*front)*density*fade;
    const ordinary=mix([.055,.22,.50],[.20,.53,.96],front);
    // A blue-white filament within a saturated blue optical envelope. These
    // are light intensities, not display RGB values painted onto a black canvas.
    const electric=mix([.045,.34,1.12],[.19,.72,1.50],inward**.75);
    const body=fiber.color??(accent?mix(electric,[.42,.88,1.55],.20):mix(ordinary,electric,energy));
    const halfWidth=width*2*(taper?.2+.8*progress**.35:1);
    pairs.push([-1,1].map(side=>[
      p[0]-dy*halfWidth*side,p[1]+dx*halfWidth*side,progress,side,
      body[0],body[1],body[2],alpha,0,0,front,0,
    ] as LightVertex));
  }
  for(let i=0;i<pairs.length-1;i++){
    const [a,b]=pairs[i],[c,d]=pairs[i+1];
    ctx.triangle(a,b,c);ctx.triangle(c,b,d);
  }
}

export function paintFibers(ctx:LightRenderer,fibers:Fiber[]){
  for(const fiber of fibers)drawFiber(ctx,fiber);
}
export function drawSpark(ctx:LightRenderer,p:Vec,radius:number,opacity:number,color:RGB=[.28,.68,1]){
  const r=radius*2,alpha=opacity*(.5+.5*clamp((p[2]+1)/2));
  const vertex=(x:number,y:number):LightVertex=>[p[0]+x*r,p[1]+y*r,x,y,...color,alpha,2,0,0,0];
  const a=vertex(-1,-1),b=vertex(1,-1),c=vertex(-1,1),d=vertex(1,1);
  ctx.triangle(a,b,c);ctx.triangle(c,b,d);
}
