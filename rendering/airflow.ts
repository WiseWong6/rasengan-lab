import curves from './airflow.json';
import {Camera,drawFiber,project,Vec} from './light';
import {LightRenderer,LightVertex} from './LightRenderer';

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const sheets=Array.from({length:10},(_,band)=>curves.filter(curve=>curve.band===band));

// Gas and its electrical accents use the same visibility at each position.
// A single midpoint cannot hide a path that crosses behind the spherical body.
const packetVisibility=(p:Vec,sourceY:number,previous:Vec,next:Vec,camera:Camera,head:number,progress:number)=>{
  const front=clamp((p[2]+1.5)/3);
  const ends=1-smooth(.58,1.15,Math.abs(sourceY));
  const reach=1-smooth(1.45,1.95,p[3]??1);
  const silhouette=Math.hypot(p[0]-540,p[1]-camera.centerY)/camera.size;
  const behindBody=smooth(.85,1.12,silhouette);
  const dx=next[0]-previous[0],dy=next[1]-previous[1];
  const radialAlignment=Math.abs((p[0]-540)*dx+(p[1]-camera.centerY)*dy)
    /Math.max(.001,silhouette*camera.size*Math.hypot(dx,dy));
  const bend=.28+.72*smooth(.15,.72,1-radialAlignment);
  const distance=(head-progress+1)%1;
  const packet=(1-smooth(.13,.27,distance))*smooth(0,.045,distance);
  return packet*ends*reach*behindBody*bend*(.4+.6*front);
};

const sampleCurve=(curve:typeof curves[number],progress:number):Vec=>{
  const u=clamp(progress)*(curve.points.length-1),lo=Math.floor(u),hi=Math.min(lo+1,curve.points.length-1);
  return curve.points[lo].map((v,k)=>v+(curve.points[hi][k]-v)*(u-lo)) as Vec;
};

// Neighboring integrated streamlines form a continuous surface. Its wide,
// translucent gas material replaces the previous bundle of thick strokes.
export function paintAirflow(ctx:LightRenderer,camera:Camera,time:number,opacity:number,amount=10){
  if(opacity<.003)return;
  for(const [rank,band] of [0,5,2,7,4].entries()){
    const reveal=smooth(0,1,amount*.5-rank);if(reveal<.003)continue;
    const sheet=sheets[band];
    const rows=sheet.map(curve=>curve.points.map((point,j):LightVertex=>{
      const p=project(point as Vec,camera),progress=j/(curve.points.length-1);
      const front=clamp((p[2]+1.5)/3);
      const previous=project(curve.points[Math.max(0,j-1)] as Vec,camera);
      const next=project(curve.points[Math.min(curve.points.length-1,j+1)] as Vec,camera);
      // Keep the refracted, circumferential part of the gas visible without
      // turning the unlit upstream/downstream flow into a long axial flame.
      const head=((time/curve.duration+band*.17)%1+1)%1;
      const alpha=opacity*reveal*.8*packetVisibility(p,point[1],previous,next,camera,head,progress);
      return [p[0],p[1],progress*curve.duration,curve.offset,0,0,0,alpha,1,curve.band,front,time];
    }));
    for(let i=0;i<rows.length-1;i++){
      for(let j=0;j<rows[i].length-1;j++){
        const a=rows[i][j],b=rows[i+1][j],c=rows[i][j+1],d=rows[i+1][j+1];
        ctx.triangle(a,b,c);ctx.triangle(c,b,d);
      }
    }
    // Sparse bright wakes move along the integrated helical path, making
    // azimuthal transport visible without rigidly rotating the gas mesh.
    const curve=sheet[4];
    for(let n=0;n<1;n++){
      const head=((time/curve.duration+n+band*.17)%1+1)%1;
      const tail=Math.max(0,head-.12);
      const points=Array.from({length:37},(_,j)=>{
        const u=(tail+j/36*(head-tail))*(curve.points.length-1),lo=Math.floor(u),hi=Math.min(lo+1,curve.points.length-1);
        const p=curve.points[lo].map((x,k)=>x+(curve.points[hi][k]-x)*(u-lo)) as Vec;
        return project(p,camera);
      });
      const p=points[points.length-1],silhouette=Math.hypot(p[0]-540,p[1]-camera.centerY)/camera.size;
      const alpha=opacity*reveal*.58*smooth(.93,1.1,silhouette)*(1-smooth(.55,1.15,Math.abs(curve.points[Math.floor(head*(curve.points.length-1))][1])));
      drawFiber(ctx,{points,opacity:alpha,width:1.15,accent:true,energy:.65,taper:true});
    }
  }
}

// A thin portion of the same outer streamline supports the short explanatory
// sentence even while its moving gas packet is temporarily behind the ball.
export function paintAirflowStudy(ctx:LightRenderer,camera:Camera,time:number,opacity:number){
  const curve=sheets[5][4],head=((time/curve.duration+.85)%1+1)%1;
  for(let j=0;j<32;j++){
    const u=j/32,q=.34+.32*u;
    const points=[project(sampleCurve(curve,q),camera),project(sampleCurve(curve,q+.01),camera)];
    const rim=Math.sin(Math.PI*(u+.5/32));
    const distance=(head-q+1)%1,light=(1-smooth(.035,.11,distance))*smooth(0,.015,distance);
    drawFiber(ctx,{points,opacity:opacity*rim*(.27+.65*light),width:1.15,accent:true,energy:.45});
  }
}

// Short discharges live inside the moving gas packet. They fade at both ends,
// at the body silhouette and as they enter or leave the illuminated gas.
export function airflowElectricPaths(camera:Camera,time:number){
  return [0,5,2,7,4].flatMap(band=>[2,4,6].map(row=>{
    const curve=sheets[band][row];
    const head=((time/curve.duration+band*.17)%1+1)%1;
    const cycle=time*.43+band*.173+row*.219,age=cycle-Math.floor(cycle);
    const life=smooth(0,.14,age)*(1-smooth(.67,1,age));
    const lag=.073+(row-2)*.013+.013*Math.sin(Math.floor(cycle)*1.79+band);
    const maximumSpan=.045+.012*(row/6),end=head-lag,targetLength=98+(row-2)*11;
    let span=maximumSpan,distance=0,previousPoint=project(sampleCurve(curve,end),camera);
    // Equal time intervals can project to very different lengths on a curved
    // streamline. Cap each electrical patch on screen before shading it.
    for(let step=1;step<=16;step++){
      const nextPoint=project(sampleCurve(curve,end-step/16*maximumSpan),camera);
      const length=Math.hypot(nextPoint[0]-previousPoint[0],nextPoint[1]-previousPoint[1]);
      if(distance+length>targetLength){
        span=maximumSpan/16*(step-1+(targetLength-distance)/length);break;
      }
      distance+=length;previousPoint=nextPoint;
    }
    const start=end-span;
    const masks:number[]=[];
    const points=Array.from({length:33},(_,j)=>{
      const progress=start+j/32*span,source=sampleCurve(curve,progress);
      const p=project(source,camera);
      const previous=project(sampleCurve(curve,progress-.002),camera);
      const next=project(sampleCurve(curve,progress+.002),camera);
      const edge=smooth(0,.18,j/32)*(1-smooth(.78,1,j/32));
      const boundary=smooth(0,.018,progress)*(1-smooth(.982,1,progress));
      masks.push(packetVisibility(p,source[1],previous,next,camera,head,progress)*edge*boundary);
      return p;
    });
    return {points,masks,opacity:life};
  }));
}
