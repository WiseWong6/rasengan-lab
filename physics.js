/* 无依赖的物理计算。浏览器与 Node.js 共用。长度、时间采用归一化单位。 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function velocity(p) {
    const [x,y,z] = p, r2=x*x+y*y+z*z;
    if (r2 <= 1) return [1.5*x*y, 1.5*(1-y*y-2*(x*x+z*z)), 1.5*z*y];
    const r3=r2**1.5, r5=r2**2.5;
    return [1.5*x*y/r5, -1+1/r3-1.5*(x*x+z*z)/r5, 1.5*z*y/r5];
  }
  function step(p,dt,field=velocity) {
    const a=field(p), b=field(p.map((v,i)=>v+a[i]*dt/2));
    const c=field(p.map((v,i)=>v+b[i]*dt/2)), d=field(p.map((v,i)=>v+c[i]*dt));
    return p.map((v,i)=>v+dt*(a[i]+2*b[i]+2*c[i]+d[i])/6);
  }
  function invariant(p) { const h2=p[0]*p[0]+p[2]*p[2]; return h2*(1-h2-p[1]*p[1]); }
  // 经典场的无量纲压力（密度为 1，远场压力为 0）。用于验证动量方程。
  function pressure(p) {
    const h2=p[0]*p[0]+p[2]*p[2],y2=p[1]*p[1];
    if(h2+y2<=1)return -.625-1.125*h2+1.125*h2*h2+2.25*y2-1.125*y2*y2;
    return .5*(1-velocity(p).reduce((sum,v)=>sum+v*v,0));
  }
  function exteriorInvariant(p){const h2=p[0]*p[0]+p[2]*p[2];return h2*(1-Math.hypot(...p)**-3);}
  const exteriorHalfLength=2.1,exteriorInletRadius=1.65;
  const exteriorMax=exteriorInvariant([exteriorInletRadius,exteriorHalfLength,0]);
  function exteriorRadius(y,value=exteriorMax){
    let lo=0,hi=exteriorInletRadius+1;
    for(let i=0;i<52;i++){const mid=(lo+hi)/2;if(exteriorInvariant([mid,y,0])<value)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  }
  function exteriorVolume(){
    // 轴对称流管的截面积积分，减去球体；辛普森积分只在初始化时计算一次。
    const intervals=256,dy=exteriorHalfLength/intervals;
    let sum=0;
    for(let i=0;i<=intervals;i++){
      const radius=exteriorRadius(i*dy),weight=i===0||i===intervals?1:i%2?4:2;
      sum+=weight*radius*radius;
    }
    return 2*Math.PI*sum*dy/3-4*Math.PI/3;
  }
  const exteriorDomain=Object.freeze({halfLength:exteriorHalfLength,inletRadius:exteriorInletRadius,streamfunctionMax:exteriorMax,maxRadius:exteriorRadius(0),volume:exteriorVolume()});
  function inExteriorDomain(p,tolerance=1e-8){
    return Math.hypot(...p)>=1-tolerance&&Math.abs(p[1])<=exteriorDomain.halfLength+tolerance&&exteriorInvariant(p)<=exteriorDomain.streamfunctionMax+tolerance;
  }
  function layerCoordinate(p,exterior=false){return Math.max(0,Math.min(1,exterior?exteriorInvariant(p)/exteriorDomain.streamfunctionMax:4*invariant(p)));}
  function seedExterior(count,seed=5821,planar=false){
    function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    const points=[];
    while(points.length<count){
      const y=(random()*2-1)*exteriorDomain.halfLength,r=exteriorDomain.maxRadius*(planar?random():Math.sqrt(random())),a=random()*TAU;
      const p=planar?[r*(a<Math.PI?-1:1),y,0]:[r*Math.cos(a),y,r*Math.sin(a)];
      if(Math.hypot(...p)>1&&inExteriorDomain(p,0))points.push(p);
    }
    return points;
  }
  function inletPoint(random=Math.random){
    // 等权示踪的补充率按穿过入口的体积通量抽样，而非只按入口面积。
    for(;;){
      const r=exteriorDomain.inletRadius*Math.sqrt(random()),a=TAU*random(),p=[r*Math.cos(a),exteriorDomain.halfLength,r*Math.sin(a)];
      if(random() < -velocity(p)[1])return p;
    }
  }
  function observationMeridian(level,exterior=false){
    if(exterior){
      let p=[exteriorRadius(exteriorDomain.halfLength,level*exteriorDomain.streamfunctionMax),exteriorDomain.halfLength,0];const points=[p];
      for(let i=0;i<3500&&p[1]>-exteriorDomain.halfLength;i++){p=step(p,.012);points.push(p);}
      return Array.from({length:73},(_,i)=>points[Math.round(i/72*(points.length-1))]);
    }
    const q=Math.max(.001,Math.min(.999,level)),radius=Math.sqrt((1-Math.sqrt(1-q))/2),loop=makeLoop(radius);
    return Array.from({length:73},(_,i)=>sample(loop,i/72*loop.period));
  }
  function angularSpeed(p,spin=0){return spin*Math.max(0,1-p[0]*p[0]-p[1]*p[1]-p[2]*p[2])**2;}
  function flowVelocity(p,spin=0) {
    const v=velocity(p),omega=angularSpeed(p,spin);
    // 受力旋流：旋转在球面平滑消失，球外仍是经典势流。
    return [v[0]-omega*p[2],v[1],v[2]+omega*p[0]];
  }
  function drivingForce(p,spin=0){
    const [x,y,z]=p,omega=angularSpeed(p,spin);
    // 保留经典压力，满足 (u·∇)u = -∇p + f。
    return [-omega*omega*x+3*y*omega*z,0,-omega*omega*z-3*y*omega*x];
  }
  function seedVolume(count,seed=7941,planar=false) {
    function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    return Array.from({length:count},()=>{
      // 体积均匀抽样；剖面使用面积均匀抽样。每点有独立连续的半径与方向。
      const radius=.995*(planar?Math.sqrt(random()):Math.cbrt(random())),phi=TAU*random();
      if(planar)return [radius*Math.cos(phi),radius*Math.sin(phi),0];
      const y=2*random()-1,h=Math.sqrt(1-y*y);
      return [radius*h*Math.cos(phi),radius*y,radius*h*Math.sin(phi)];
    });
  }
  function makeTracer(p,spin=0,length=84,dt=.01) {
    const history=Array(length);history[0]=p.slice();let previous=p.slice();
    for(let i=1;i<length;i++){previous=step(previous,-dt,q=>flowVelocity(q,spin));history[length-i]=previous;}
    return {p:p.slice(),history,cursor:0};
  }
  function advanceTracer(tracer,dt=.01,spin=0) {
    tracer.p=step(tracer.p,dt,q=>flowVelocity(q,spin));
    tracer.cursor=(tracer.cursor+1)%tracer.history.length;
    tracer.history[tracer.cursor]=tracer.p;
  }
  function trailPoint(tracer,age) {
    const n=tracer.history.length;
    return tracer.history[(tracer.cursor-Math.min(n-1,Math.max(0,Math.round(age)))+n)%n];
  }
  function makeLoop(radius,dt=.004) {
    let p=[radius,0,0], negative=false;
    const points=[p];
    for(let i=0;i<20000;i++) {
      const next=step(p,dt);
      if(next[1]<-.001) negative=true;
      if(negative && p[1]<0 && next[1]>=0) {
        const f=-p[1]/(next[1]-p[1]);
        return {points,dt,period:(points.length-1+f)*dt};
      }
      points.push(next);p=next;
    }
    throw new Error('未找到闭合流线');
  }
  function sample(loop,t,phi=0,spin=0) {
    if(spin!==0)throw new Error('参考流线采样仅适用于经典场；受力旋流须用 flowVelocity 数值积分。');
    const wrapped=((t%loop.period)+loop.period)%loop.period;
    const q=wrapped/loop.dt, i=Math.min(Math.floor(q),loop.points.length-1);
    const a=loop.points[i], b=loop.points[i+1]||loop.points[0];
    const span=i===loop.points.length-1 ? loop.period-i*loop.dt : loop.dt;
    const f=span>0 ? (wrapped-i*loop.dt)/span : 0;
    const radius=a[0]+(b[0]-a[0])*f, y=a[1]+(b[1]-a[1])*f, angle=phi;
    return [radius*Math.cos(angle),y,radius*Math.sin(angle)];
  }
  // 太阳质量固定为 332946 个地球质量；圆轨道、小质量比近似。
  function hillRadius(massEarth,distanceAU) {return distanceAU*Math.cbrt(massEarth/(3*332946));}
  const api={TAU,velocity,pressure,exteriorInvariant,exteriorDomain,inExteriorDomain,layerCoordinate,seedExterior,inletPoint,observationMeridian,angularSpeed,flowVelocity,drivingForce,seedVolume,makeTracer,advanceTracer,trailPoint,step,invariant,makeLoop,sample,hillRadius};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.HillPhysics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
