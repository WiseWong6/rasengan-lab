const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../physics.js');
test('经典场满足稳态动量平衡，球面两侧压力连续',()=>{
  for(const p of [[0,0,0],[.2,.3,.4],[.7,-.3,.2],[1.2,.5,.2],[-.2,-1.4,.7]]){
    const u=P.velocity(p),e=1e-5,acc=[0,0,0],grad=[];
    for(let j=0;j<3;j++){
      const a=p.slice(),b=p.slice();a[j]+=e;b[j]-=e;
      const va=P.velocity(a),vb=P.velocity(b);grad[j]=(P.pressure(a)-P.pressure(b))/(2*e);
      for(let i=0;i<3;i++)acc[i]+=u[j]*(va[i]-vb[i])/(2*e);
    }
    assert.ok(Math.hypot(...acc.map((x,i)=>x+grad[i]))<1e-7);
  }
  for(let i=1;i<25;i++){
    const p=[Math.sin(i*.12),Math.cos(i*.12),0];
    assert.ok(Math.abs(P.pressure(p.map(x=>x*(1-1e-8)))-P.pressure(p.map(x=>x*(1+1e-8))))<1e-6);
    for(const spin of [0,.8,2]){
      const a=P.flowVelocity(p.map(x=>x*(1-1e-8)),spin),b=P.flowVelocity(p.map(x=>x*(1+1e-8)),spin);
      assert.ok(Math.hypot(...a.map((v,j)=>v-b[j]))<1e-6);
    }
  }
});
test('观察层对应真实流面，改变层数不改变速度场',()=>{
  for(const exterior of [false,true])for(const count of [1,4,12])for(let i=0;i<count;i++){
    const level=(i+.5)/count,points=P.observationMeridian(level,exterior);
    for(const p of points){
      assert.ok(Math.abs(P.layerCoordinate(p,exterior)-level)<5e-5);
      assert.ok(exterior?Math.hypot(...p)>1:Math.hypot(...p)<1);
    }
    if(exterior){assert.equal(points[0][1],2.1);assert.ok(points.at(-1)[1]<-2.1);}
  }
});
test('球外示踪在内外连续速度场中绕行，不穿入球内',()=>{
  for(const planar of [false,true])for(const seed of P.seedExterior(25,13,planar)){
    const tracer=P.makeTracer(seed,0);
    for(let i=0;i<800;i++){
      P.advanceTracer(tracer);
      assert.ok(Math.hypot(...tracer.p)>1-1e-7);
      if(planar)assert.equal(tracer.p[2],0);
    }
    assert.ok(Math.abs(P.exteriorInvariant(seed)-P.exteriorInvariant(tracer.p))<1e-6);
  }
});
test('粒子覆盖整个球体，半径、方位和流面不量化成少数层',()=>{
  const points=P.seedVolume(4096),sectors=Array(36).fill(0),volumes=Array(8).fill(0);
  const surfaces=new Set();let y2=0;
  for(const p of points){
    const radius=Math.hypot(...p);assert.ok(radius<1);
    const angle=(Math.atan2(p[2],p[0])+P.TAU)%P.TAU;
    sectors[Math.floor(angle/P.TAU*36)]++;
    volumes[Math.min(7,Math.floor((radius/.995)**3*8))]++;
    surfaces.add(P.invariant(p).toFixed(8));y2+=p[1]*p[1];
  }
  assert.ok(surfaces.size>4000,'粒子应分布在独立流面上');
  assert.ok(Math.min(...sectors)>65,'所有方位均应覆盖');
  assert.ok(volumes.every(n=>Math.abs(n-512)<100),'等体积球壳的粒子数量应接近');
  assert.ok(Math.abs(y2/points.length-.995**2/5)<.01);
});
test('实时粒子积分保持流面，轨迹缓存不会制造接缝',()=>{
  for(const spin of [0,.8,2])for(const p of P.seedVolume(40)){
    const tracer=P.makeTracer(p,spin),value=P.invariant(p);
    for(let i=0;i<1200;i++)P.advanceTracer(tracer,.01,spin);
    assert.ok(Math.hypot(...tracer.p)<1);
    assert.ok(Math.abs(P.invariant(tracer.p)-value)<2e-7);
    assert.deepEqual(P.trailPoint(tracer,0),tracer.p);
    for(let age=0;age<80;age++){
      const a=P.trailPoint(tracer,age),b=P.trailPoint(tracer,age+1);
      assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<.04);
    }
  }
});
test('剖面示踪点保持在经线面内',()=>{
  for(const p of P.seedVolume(80,12,true)){
    const tracer=P.makeTracer(p);
    for(let i=0;i<50;i++)P.advanceTracer(tracer);
    assert.equal(tracer.p[2],0);
  }
});
test('希尔半径：地球基准与质量、距离的比例关系',()=>{
  const earth=P.hillRadius(1,1)*14959.78707;
  assert.ok(Math.abs(earth-149.65)<.15);
  assert.ok(Math.abs(P.hillRadius(8,1)/P.hillRadius(1,1)-2)<1e-12);
  assert.ok(Math.abs(P.hillRadius(1,2)/P.hillRadius(1,1)-2)<1e-12);
});
test('经典球涡：球面不穿透，内外速度连续，远场向下',()=>{
  for(let i=1;i<30;i++){
    const a=i*.1,b=i*.7,p=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
    const v=P.velocity(p);assert.ok(Math.abs(v.reduce((s,x,j)=>s+x*p[j],0))<1e-12);
    const inner=P.velocity(p.map(x=>x*(1-1e-7))),outer=P.velocity(p.map(x=>x*(1+1e-7)));
    assert.ok(Math.hypot(...inner.map((x,j)=>x-outer[j]))<2e-6);
  }
  assert.ok(Math.abs(P.velocity([0,100,0])[1]+1)<2e-6);
});
test('流体不可压缩：内外速度场的散度接近零',()=>{
  for(const p of [[.2,.3,.4],[.8,.1,.1],[1.2,.3,.4],[-.3,-1.8,.5]]){
    let div=0;const e=1e-5;
    for(let j=0;j<3;j++){const a=p.slice(),b=p.slice();a[j]+=e;b[j]-=e;div+=(P.velocity(a)[j]-P.velocity(b)[j])/(2*e);}
    assert.ok(Math.abs(div)<1e-8);
  }
});
test('长时间积分：粒子留在球内，并保持流函数值',()=>{
  for(const r of [.075,.23,.44,.65]){
    let p=[r,0,0],value=P.invariant(p);
    for(let i=0;i<15000;i++)p=P.step(p,.008);
    assert.ok(Math.hypot(...p)<1);assert.ok(Math.abs(P.invariant(p)-value)<1e-7);
  }
});
test('经典参考轨迹：周期接缝连续，流面保持一致',()=>{
  for(const radius of [.075,.14,.23,.33,.44,.55,.65]){
    const loop=P.makeLoop(radius),a=P.sample(loop,loop.period-1e-6),b=P.sample(loop,1e-6);
    assert.ok(loop.period>0&&loop.period<30);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-5);
    for(let t=0;t<loop.period;t+=.17){const p=P.sample(loop,t,.3);assert.ok(Math.hypot(...p)<1);assert.ok(Math.abs(P.invariant(p)-P.invariant([radius,0,0]))<2e-5);}
  }
});

test('经典参考轨迹接口拒绝用旧的刚体旋转冒充受力轨迹',()=>{
  assert.throws(()=>P.sample(P.makeLoop(.23),.5,0,6),/受力旋流/);
});
