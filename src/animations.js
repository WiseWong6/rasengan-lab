/* 球涡的观看方式。只选取示踪位置与光色，不替代 HillPhysics 的速度场。 */
(function(root){
  'use strict';
  const presets=Object.freeze({
    overturn:{title:'内部翻卷',description:'从侧面看光丝穿过轴心、向外折返。经典希尔球涡，没有绕轴旋转。',spin:0,density:360,trail:2.4,view:'3d',yaw:0,pitch:.12,rotate:false,light:.5,palette:false},
    filaments:{title:'分层光丝',description:'只点亮几组流动路径。缓慢转动视角，看嵌套结构之间的空隙；颜色用于区分路径。',spin:0,density:720,trail:2.8,view:'3d',yaw:.6,pitch:.32,rotate:true,light:.65,palette:true},
    spiral:{title:'顶部螺旋',description:'沿着流动轴看，内部翻卷叠加绕轴旋转。切回立体，可以看见螺旋的深度。',spin:4.2,density:720,trail:1.8,view:'top',yaw:0,pitch:Math.PI/2,rotate:false,light:.85,palette:false},
    rasengan:{title:'螺旋丸',description:'蓝色光丝逐渐汇成横向旋转的球。与视频开头使用同一套光色、轨迹和外围气流，拖动可以查看内部。',spin:6,density:384,trail:3.6,view:'3d',axis:'horizontal',yaw:.5,pitch:.65,rotate:true,light:1,palette:false},
    lightning:{title:'球状闪电',description:'在同一个螺旋丸上，电流沿已有流线局部跳亮，分叉逐渐增多。这是涡旋结构的艺术演示，并非球状闪电的确定成因。',spin:6,density:384,trail:3.6,view:'3d',axis:'horizontal',yaw:.5,pitch:.65,rotate:true,light:1,palette:false}
  });
  const heroSeeds=new Map();
  function seedPoints(P,count,kind){
    if(kind==='rasengan'||kind==='lightning'){
      if(!heroSeeds.has(count)){
        const levels=[.0001,.002,.016,.065,.18,.38,.65,.9];
        const loops=levels.map(q=>P.makeLoop(Math.sqrt((1-Math.sqrt(1-q))/2),.001));
        const points=Array.from({length:Math.min(96,count)},(_,i)=>{
          const band=i%8,angle=Math.floor(i/8),phase=(angle*.38196601125+band*.137)%1;
          return P.sample(loops[band],phase*loops[band].period,angle/12*P.TAU);
        });
        points.push(...P.seedVolume(Math.max(0,count-96),4217));
        // Reproduce the opening's initial condition at simulation time 13.
        // The original field, including its smooth spin ramp, is unchanged.
        for(let i=0;i<points.length;i++)for(let step=0;step<1560;step++){
          const t=step/120,h=1/120,p=points[i];
          const field=(q,s)=>{const x=Math.max(0,Math.min(1,(s-3)/5));return P.flowVelocity(q,6*x*x*(3-2*x));};
          const a=field(p,t),b=field(p.map((x,k)=>x+a[k]*h/2),t+h/2),c=field(p.map((x,k)=>x+b[k]*h/2),t+h/2),d=field(p.map((x,k)=>x+c[k]*h),t+h);
          points[i]=p.map((x,k)=>x+h*(a[k]+2*b[k]+2*c[k]+d[k])/6);
        }
        heroSeeds.set(count,points);
      }
      return heroSeeds.get(count).map((p,i)=>({p:p.slice(),band:i%8,birth:0}));
    }
    const levels=kind==='overturn'?[.12,.36,.65,.88]:[.08,.22,.42,.64,.84,.96];
    const loops=levels.map(q=>P.makeLoop(Math.sqrt((1-Math.sqrt(1-q))/2)));
    return Array.from({length:count},(_,i)=>{
      const band=i%levels.length, n=Math.floor(i/levels.length);
      const phi=(n%12)/12*P.TAU;
      const phase=(n*.38196601125+band*.137)%1;
      return {p:P.sample(loops[band],phase*loops[band].period,phi),band,birth:(n%17)/17*1.25+band*.12};
    });
  }
  function appearance(kind,time,birth=0){
    if(kind!=='rasengan'&&kind!=='lightning')return 1;
    const t=Math.max(0,Math.min(1,(time+.15-birth)/1.5));
    return t*t*(3-2*t);
  }
  const api={presets,seedPoints,appearance};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HillAnimations=api;
})(typeof globalThis!=='undefined'?globalThis:this);
