import {Fiber,Vec} from './light';
const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
export function electricTrace(points:Vec[],time:number,id:number,alpha:number,growth:{branches:number;twigs:number},outer=false,masks?:number[]):Fiber[]{
  const tick=Math.floor(time*9),pulse=outer?.28+.72*Math.sin(time*5.4+id*2.17)**4:.12+.88*Math.sin(time*4.8+id*2.17)**8;
  const nodeCount=outer?17:25;
  const normal=(index:number)=>{
    const a=points[Math.max(0,index-1)],b=points[Math.min(points.length-1,index+1)];
    const dx=b[0]-a[0],dy=b[1]-a[1],norm=Math.hypot(dx,dy)||1;
    return [dx/norm,dy/norm];
  };
  const weights=Array.from({length:nodeCount},(_,j)=>masks?.[Math.round(j/(nodeCount-1)*(points.length-1))]??1);
  const nodes=Array.from({length:nodeCount},(_,j):Vec=>{
    const k=Math.round(j/(nodeCount-1)*(points.length-1)),p=points[k],[dx,dy]=normal(k);
    const noise=Math.sin(j*2.61+id*3+tick)*.7+Math.sin(j*.73+id-tick*.6)*.3;
    const offset=(outer?4.5:10)*noise*Math.sin(j/(nodeCount-1)*Math.PI);
    return [p[0]-dy*offset,p[1]+dx*offset,p[2],p[3],p[4]];
  });
  const fibers:Fiber[]=[];
  // Outer accents are shaded in short connected pieces. The masks are
  // evaluated along the gas itself, so a hidden tail cannot remain white.
  const append=(path:Vec[],mask:number[],opacity:number,width:number,color:[number,number,number])=>{
    if(!outer){fibers.push({points:path,opacity,width,color,accent:true,taper:true});return;}
    for(let j=0;j<path.length-1;j++){
      const weight=(mask[j]+mask[j+1])*.5;
      fibers.push({points:[path[j],path[j+1]],opacity:opacity*weight,width:width*(.65+.35*Math.sqrt(weight)),color,accent:true});
    }
  };
  append(points,masks??points.map(()=>1),alpha*(outer?.11:.12),outer?1.65:2.5,[.26,.62,1.22]);
  append(nodes,weights,alpha*pulse,outer?1.05:2.0,outer?[.58,1.12,1.92]:[1.6,2.0,2.8]);
  for(let b=0;b<2;b++){
    const branchReveal=smooth(growth.branches-b);if(branchReveal<.003)continue;
    const j=outer?5+b*6:7+b*9,p=nodes[j],[dx,dy]=normal(Math.round(j/(nodeCount-1)*(points.length-1)));
    const side=(id+b)%2===0?1:-1,length=(outer?15:32)+(outer?9:14)*(.5+.5*Math.sin(id*2+b));
    const branch=Array.from({length:7},(_,k):Vec=>{
      const u=k/6,along=u*length*.75,across=side*u*length+(k===0?0:(outer?2.7:5)*Math.sin(k*2.4+tick+id));
      return [p[0]+dx*along-dy*across,p[1]+dy*along+dx*across,p[2],p[3],p[4]];
    });
    const branchWeights=branch.map((_,k)=>weights[j]*(1-smooth(k/(branch.length-1))));
    append(branch,branchWeights,alpha*pulse*branchReveal*(outer?.58:.8),outer?.72:1.3,outer?[.40,.86,1.6]:[1.3,1.8,2.5]);
    if(growth.twigs<.003)continue;
    const root=branch[3];
    const twig=Array.from({length:4},(_,k):Vec=>{
      const u=k/3,along=u*(outer?10:22),across=-side*u*(outer?7:14)+(k===0?0:(outer?1.5:3)*Math.sin(k*2.8+tick));
      return [root[0]+dx*along-dy*across,root[1]+dy*along+dx*across,root[2],root[3],root[4]];
    });
    append(twig,twig.map((_,k)=>branchWeights[3]*(1-smooth(k/3))),alpha*pulse*branchReveal*growth.twigs*(outer?.32:.5),outer?.50:.85,outer?[.32,.73,1.45]:[1.1,1.6,2.3]);
  }
  return fibers;
}

