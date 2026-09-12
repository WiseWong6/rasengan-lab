const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../src/physics.js'),D=P.exteriorDomain;

function rawStreamfunction(h2,y){return h2*(1-(h2+y*y)**-1.5);}
function radiusAt(y){
  let lo=D.inletRadius,hi=D.inletRadius+1;
  for(let i=0;i<52;i++){
    const h=(lo+hi)/2;
    if(rawStreamfunction(h*h,y)<D.streamfunctionMax)lo=h;else hi=h;
  }
  return (lo+hi)/2;
}
function statistics(points){
  const q=[0,0,0,0],y=[0,0,0,0];let expanded=0,skin=0;
  for(const p of points){
    q[Math.min(3,Math.floor(P.exteriorInvariant(p)/D.streamfunctionMax*4))]++;
    y[Math.min(3,Math.floor((p[1]+D.halfLength)/(2*D.halfLength)*4))]++;
    if(Math.hypot(p[0],p[2])>D.inletRadius)expanded++;
    if(Math.hypot(...p)<1.012)skin++;
  }
  return {q:q.map(n=>n/points.length),y:y.map(n=>n/points.length),expanded:expanded/points.length,skin:skin/points.length};
}
// 在等体积的二维轴对称网格上独立积分，不调用生产代码的播种器或体积积分。
function referenceDistribution(){
  const bins=800,q=[0,0,0,0],yBins=[0,0,0,0];let accepted=0,expanded=0,skin=0;
  for(let iy=0;iy<bins;iy++)for(let ih=0;ih<bins;ih++){
    const y=(2*(iy+.5)/bins-1)*D.halfLength,h2=(ih+.5)/bins*D.maxRadius**2,r2=h2+y*y;
    if(r2<=1)continue;
    const value=rawStreamfunction(h2,y);if(value>D.streamfunctionMax)continue;
    accepted++;q[Math.min(3,Math.floor(value/D.streamfunctionMax*4))]++;yBins[Math.floor(iy/bins*4)]++;
    if(h2>D.inletRadius**2)expanded++;
    if(r2<1.012**2)skin++;
  }
  return {volume:2*D.halfLength*Math.PI*D.maxRadius**2*accepted/(bins*bins),q:q.map(n=>n/accepted),y:yBins.map(n=>n/accepted),expanded:expanded/accepted,skin:skin/accepted};
}
const reference=referenceDistribution();

test('球外观察域是同一束开放流面，范围常量不可被意外更改',()=>{
  assert.ok(Object.isFrozen(D));
  assert.equal(D.halfLength,2.1);assert.equal(D.inletRadius,1.65);
  assert.ok(D.maxRadius>D.inletRadius);
  assert.ok(Math.abs(rawStreamfunction(D.maxRadius**2,0)-D.streamfunctionMax)<1e-12);
  assert.ok(Math.abs(D.volume-reference.volume)/D.volume<.001,'公开体积与独立体积网格一致');
  assert.ok(P.inExteriorDomain([D.inletRadius,D.halfLength,0]));
  assert.ok(P.inExteriorDomain([D.maxRadius,0,0]));
  assert.ok(!P.inExteriorDomain([D.maxRadius+.001,0,0]));
  assert.ok(!P.inExteriorDomain([0,D.halfLength+.001,0]));
  assert.ok(!P.inExteriorDomain([.99,0,0]));
  assert.ok(!P.inExteriorDomain([NaN,0,0]));
});

test('球外初始示踪覆盖鼓起的流管和贴球区域，并按体积均匀分布',()=>{
  const points=P.seedExterior(40000,718202);
  for(const p of points){
    assert.ok(P.inExteriorDomain(p,0));assert.ok(Math.hypot(...p)>1);
    assert.ok(P.exteriorInvariant(p)<=D.streamfunctionMax,'真实域内不依赖层坐标截断兜底');
  }
  const measured=statistics(points);
  assert.ok(measured.expanded>.06,'入口外侧膨胀区域从初始状态就应有流体');
  assert.ok(measured.skin>.002,'不能人为剔除距球面 1.2% 半径的皮层');
  assert.ok(Math.abs(measured.expanded-reference.expanded)<.008);
  assert.ok(Math.abs(measured.skin-reference.skin)<.0018);
  for(let i=0;i<4;i++){
    assert.ok(Math.abs(measured.q[i]-reference.q[i])<.012,'各流面区间的占比与体积相符');
    assert.ok(Math.abs(measured.y[i]-reference.y[i])<.012,'各轴向区间的占比与体积相符');
  }
  const planar=P.seedExterior(5000,51942,true);
  assert.ok(planar.every(p=>p[2]===0&&P.inExteriorDomain(p,0)));
  assert.ok(planar.some(p=>p[0]>D.inletRadius)&&planar.some(p=>p[0]<-D.inletRadius));
});

test('完整流管侧界没有法向通量，全部入口流量等于流函数跨度',()=>{
  for(let i=0;i<=60;i++){
    const y=(i/60*2-1)*D.halfLength,h=radiusAt(y),phi=i*.714,p=[h*Math.cos(phi),y,h*Math.sin(phi)];
    const h2=h*h,r=Math.hypot(...p),common=2*(1-r**-3)+3*h2*r**-5;
    const normal=[p[0]*common,3*h2*y*r**-5,p[2]*common],u=P.velocity(p);
    assert.ok(Math.abs(normal.reduce((sum,n,j)=>sum+n*u[j],0))<1e-11,'侧面为真实流面，因此无需补造侧向入口');
    assert.ok(P.inExteriorDomain(p));
  }
  let flux=0;const bins=10000;
  for(let i=0;i<bins;i++){
    const h=D.inletRadius*Math.sqrt((i+.5)/bins);
    flux+=-P.velocity([h,D.halfLength,0])[1]*Math.PI*D.inletRadius**2/bins;
  }
  assert.ok(Math.abs(flux-Math.PI*D.streamfunctionMax)<1e-7);
});

test('球外长期补投维持同一流管和体积分布，不会逐渐填充初始空白',()=>{
  let points=P.seedExterior(4000,125751),seed=812531,respawned=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const snapshots=[];
  for(let step=1;step<=1600;step++){
    points=points.map(p=>{
      const next=P.step(p,.01);
      if(P.inExteriorDomain(next))return next;
      assert.ok(next[1]<-D.halfLength,'流体只从下游离开，不穿过侧界或球面');
      const replacement=P.inletPoint(random);assert.ok(P.inExteriorDomain(replacement));respawned++;
      return replacement;
    });
    if(step%400===0)snapshots.push(statistics(points));
  }
  assert.ok(respawned>8000,'验证必须经历充分的下游离开与入口补投');
  for(let i=0;i<4;i++){
    const q=snapshots.reduce((sum,s)=>sum+s.q[i],0)/snapshots.length;
    const y=snapshots.reduce((sum,s)=>sum+s.y[i],0)/snapshots.length;
    assert.ok(Math.abs(q-reference.q[i])<.025,'长期流面占比保持体积分布');
    assert.ok(Math.abs(y-reference.y[i])<.025,'长期轴向占比保持体积分布');
  }
  const expanded=snapshots.reduce((sum,s)=>sum+s.expanded,0)/snapshots.length;
  assert.ok(Math.abs(expanded-reference.expanded)<.02,'膨胀区域不应存在持续的缺流');
});
