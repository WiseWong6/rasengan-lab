const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../physics.js');

const spins=[0,2,6,8];
const points=[[0,0,0],[0,.53,0],[.2,.3,.4],[.61,-.42,.2],[-.18,.73,.29],[.78,.1,-.13],[1.2,.5,.2],[-.4,-1.4,.7]];
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
function derivative(field,p,axis,h=1e-5){
  const a=p.slice(),b=p.slice();a[axis]+=h;b[axis]-=h;
  const fa=field(a),fb=field(b);
  return Array.isArray(fa)?fa.map((value,i)=>(value-fb[i])/(2*h)):(fa-fb)/(2*h);
}
function along(field,p,u){return u.reduce((sum,value,i)=>sum+value*derivative(field,p,i),0);}

test('受力旋流满足含外力的稳态动量方程，并保持不可压缩',()=>{
  for(const spin of spins)for(const p of points){
    const field=q=>P.flowVelocity(q,spin),u=field(p),force=P.drivingForce(p,spin);
    const acc=[0,0,0],grad=[],jacobian=[];
    for(let j=0;j<3;j++){
      jacobian[j]=derivative(field,p,j);grad[j]=derivative(P.pressure,p,j);
      for(let i=0;i<3;i++)acc[i]+=u[j]*jacobian[j][i];
    }
    assert.ok(Math.hypot(...acc.map((a,i)=>a+grad[i]-force[i]))<1e-6,`动量平衡失败：${p}，强度 ${spin}`);
    assert.ok(Math.abs(jacobian[0][0]+jacobian[1][1]+jacobian[2][2])<1e-7,`不可压缩失败：${p}，强度 ${spin}`);
  }
});

test('旋流角动量的变化由外力矩提供，能量变化等于外力做功',()=>{
  for(const spin of spins)for(const p of points){
    const u=P.flowVelocity(p,spin),force=P.drivingForce(p,spin);
    const angularMomentum=q=>{const v=P.flowVelocity(q,spin);return q[2]*v[0]-q[0]*v[2];};
    const energy=q=>{const v=P.flowVelocity(q,spin);return dot(v,v)/2+P.pressure(q);};
    const torque=p[2]*force[0]-p[0]*force[2];
    assert.ok(Math.abs(along(angularMomentum,p,u)-torque)<1e-6,'绕 y 轴角动量必须由相应外力矩改变');
    assert.ok(Math.abs(along(energy,p,u)-dot(u,force))<1e-6,'动能与压力能的变化必须等于外力功率');
  }
  const p=[.35,.4,.2],force=P.drivingForce(p,6);
  assert.ok(Math.abs(p[2]*force[0]-p[0]*force[2])>.01,'非零旋流需要外力矩，不能误退化成无外力解');
  assert.ok(Math.abs(dot(P.flowVelocity(p,6),force))>.01,'该示意场存在局部能量交换');
});

test('旋转强度为零恢复经典场，球外与远处始终保持经典来流',()=>{
  for(const p of points){
    assert.deepEqual(P.flowVelocity(p,0),P.velocity(p));
    assert.equal(P.angularSpeed(p,0),0);
    assert.ok(P.drivingForce(p,0).every(value=>value===0));
  }
  for(const spin of spins)for(const p of [[1.01,0,0],[0,1.01,0],[2,.5,-1],[100,30,-40]]){
    assert.deepEqual(P.flowVelocity(p,spin),P.velocity(p));
    assert.equal(P.angularSpeed(p,spin),0);
    assert.ok(P.drivingForce(p,spin).every(value=>value===0));
  }
});

test('附加旋流在球面平滑消失，球面不穿透，内外速度和压力连续',()=>{
  for(const spin of spins)for(let i=0;i<32;i++){
    const y=-1+2*i/31,phi=i*2.399963229728653,h=Math.sqrt(Math.max(0,1-y*y));
    const p=[h*Math.cos(phi),y,h*Math.sin(phi)],inner=p.map(v=>v*(1-1e-7)),outer=p.map(v=>v*(1+1e-7));
    const u=P.flowVelocity(p,spin),a=P.flowVelocity(inner,spin),b=P.flowVelocity(outer,spin);
    assert.ok(Math.abs(dot(p,u))<1e-12);
    assert.ok(Math.hypot(...a.map((value,j)=>value-b[j]))<3e-6);
    assert.ok(Math.abs(P.pressure(inner)-P.pressure(outer))<3e-6);
    assert.ok(Math.hypot(...P.drivingForce(inner,spin))<1e-9);
    assert.ok(Math.abs(P.angularSpeed(inner,spin))/1e-7<1e-4,'旋转角速度的一阶导数应在边界归零');
  }
});

test('强旋流的球内流面仍不变，观察层不成为实体隔板',()=>{
  for(const spin of spins)for(const p of points.filter(p=>Math.hypot(...p)<1)){
    assert.ok(Math.abs(along(P.invariant,p,P.flowVelocity(p,spin)))<1e-7);
  }
});

test('高强度旋流长期积分仍留在球内，观察层误差不会累积到可见尺度',()=>{
  const seeds=P.seedVolume(40,82952),dt=.01,steps=20000;
  for(const spin of [6,8])for(const initial of seeds){
    const value=P.invariant(initial);let p=initial.slice();
    for(let i=0;i<steps;i++){
      p=P.step(p,dt,q=>P.flowVelocity(q,spin));
      assert.ok(Math.hypot(...p)<1,`旋转强度 ${spin} 的示踪点穿出了球面`);
      // 流函数误差 1e-6 对应层坐标误差 4e-6，远小于 12 层间隔 1/12。
      // 对 200 个时间单位的四阶数值积分留出误差余量，避免苛求机器精度。
      assert.ok(Math.abs(P.invariant(p)-value)<1e-6,`旋转强度 ${spin} 的长期流面误差过大`);
    }
  }
});

test('球外入口示踪按流量投放，位置和方位分布合理',()=>{
  let seed=3294721;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const count=100000,bins=[0,0,0,0],quadrants=[0,0,0,0],radius=1.65;
  for(let i=0;i<count;i++){
    const p=P.inletPoint(random),h2=p[0]*p[0]+p[2]*p[2];
    assert.ok(p.every(Number.isFinite));assert.equal(p[1],2.1);
    assert.ok(h2<=radius*radius+1e-12);
    assert.ok(P.velocity(p)[1]<0);
    bins[Math.min(3,Math.floor(h2/(radius*radius)*4))]++;
    quadrants[Math.min(3,Math.floor(((Math.atan2(p[2],p[0])+2*Math.PI)%(2*Math.PI))/(Math.PI/2)))]++;
  }
  // 等面积圆环中的投放率应与入口法向速度的积分成比例。
  // 使用独立数值积分，不复制拒绝采样实现。
  const weights=bins.map((_,bin)=>{
    let sum=0;
    for(let j=0;j<1000;j++){
      const q=(bin+(j+.5)/1000)/4;
      sum+=-P.velocity([radius*Math.sqrt(q),2.1,0])[1];
    }
    return sum;
  });
  const total=weights.reduce((sum,value)=>sum+value,0);
  for(let i=0;i<4;i++){
    assert.ok(Math.abs(bins[i]/count-weights[i]/total)<.0055,'入口数量应按流量加权，而非仅按面积均匀');
    assert.ok(Math.abs(quadrants[i]/count-.25)<.008,'入口没有偏向固定方位');
  }
});
