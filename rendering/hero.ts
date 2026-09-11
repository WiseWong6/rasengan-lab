import {LightRenderer} from './LightRenderer';
import {paintFibers,drawSpark,project,rotate,Fiber,Camera,Vec} from './light';
import {paintAirflow,airflowElectricPaths} from './airflow';
import {electricTrace} from './electric';

const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// The palette, finite wakes, secondary tracers and gas material come from the
// film's opening. Positions continue to be integrated by the local Hill model.
export function create(canvas:HTMLCanvasElement){
  const renderer=new LightRenderer(canvas);
  return {
    draw(P:any,cloud:any[],state:any,trail:number){
      renderer.begin();
      const elapsed=state.presentation||0,build=smooth(elapsed/5);
      const camera:Camera={pitch:state.pitch,yaw:state.yaw,roll:state.roll,
        size:350.4*state.zoom,centerY:540};
      const fibers:Fiber[]=[],count=cloud.length;
      const population=64+(count-64)*build;
      const power=state.rasenganLight;
      const sample=(index:number,age:number)=>P.trailPoint(cloud[index],age/.01) as Vec;
      for(let n=0;n<count;n++){
        const reveal=smooth(population-n);if(reveal<.003)continue;
        const index=n*137%count,length=trail*(.8+(index%7)*.05);
        const points=Array.from({length:81},(_,j)=>project(sample(index,length*(1-j/80)),camera));
        fibers.push({points,width:n%9===0?3.8:2.4,opacity:power*reveal*(n%9===0?.98:.88),accent:n%9===0,energy:1,taper:true});
      }
      for(let n=0;n<Math.min(192,count/2);n++){
        const index=n*137%count,phi=n*2.399963;
        const points=Array.from({length:65},(_,j)=>project(rotate(sample(index,trail*(1-j/64)),0,phi),camera));
        fibers.push({points,width:1.7,opacity:power*build*.34,accent:false,energy:1,taper:true});
      }
      paintAirflow(renderer,camera,13+state.time,build*power,10*build);
      paintFibers(renderer,fibers);
      for(let n=0;n<count;n++){
        const reveal=smooth(population-n);if(reveal<.003)continue;
        drawSpark(renderer,project(cloud[n].p,camera),.65,power*reveal*.24);
      }
      if(state.animation==='lightning'){
        const growth={branches:1+smooth((elapsed-3)/7),twigs:smooth((elapsed-5)/7)};
        const strength=smooth(elapsed/2),internal=2+28*smooth(elapsed/12),outer=15*smooth((elapsed-2)/10);
        const arcs:Fiber[]=[];
        for(let n=0;n<30;n++){
          const reveal=smooth(internal-n);if(reveal<.003)continue;
          const index=n*27*137%count,length=trail*(.8+(index%7)*.05);
          const head=.36+.64*((elapsed*.43+n*.61803398875)%1),start=Math.max(0,head-.3);
          const points=Array.from({length:65},(_,j)=>project(sample(index,length*(1-start-(head-start)*j/64)),camera));
          arcs.push(...electricTrace(points,elapsed,n,power*strength*reveal,growth));
        }
        for(const [n,path] of airflowElectricPaths(camera,13+state.time).entries()){
          const rank=n%3*5+Math.floor(n/3),reveal=smooth(outer-rank);
          if(reveal>.003)arcs.push(...electricTrace(path.points,elapsed,n+70,power*strength*reveal*path.opacity,growth,true,path.masks));
        }
        paintFibers(renderer,arcs);
      }
      renderer.finish();
    },
    dispose(){renderer.dispose();},
  };
}
