const {test}=require('node:test');
const assert=require('node:assert/strict');
const Evolution=require('../src/evolution.js');
const P=require('../src/physics.js');

test('未变形初始场接近希尔解析场，轴心与球内外速度有限',()=>{
  const flow=new Evolution(1),points=P.seedVolume(160).concat(P.seedExterior(160));
  let squared=0;
  for(const p of points){const a=flow.velocity(p),b=P.velocity(p);squared+=a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);}
  assert.ok(Math.sqrt(squared/points.length)<.03,'网格初始速度的均方根误差须低于平移速度的 3%');
  for(const p of [[0,0,0],[0,1,0],[0,-1,0],[2,3,0]])assert.ok(flow.velocity(p).every(Number.isFinite));
  assert.ok(flow.solveError<2e-6,'初始速度恢复的松弛求解需收敛');
});

test('初始拉长、压扁保持体积，离散通量不凭空制造流体',()=>{
  for(const stretch of [1.25,.75]){
    const flow=new Evolution(stretch),a=flow.mapInitial([1,0,0]),b=flow.mapInitial([0,1,0]),c=flow.mapInitial([0,0,1]);
    assert.ok(Math.abs(a[0]*b[1]*c[2]-1)<1e-12);
    assert.equal(b[1],stretch);
    let maximum=0;
    for(let j=1;j<flow.ny-1;j++)for(let i=0;i<flow.nr-1;i++){
      const k=j*flow.nr+i;
      maximum=Math.max(maximum,Math.abs(flow.fluxR[k]-(i?flow.fluxR[k-1]:0)+flow.fluxY[k]-flow.fluxY[k-flow.nr]));
    }
    assert.ok(maximum<1e-14,'四个面的体积流量必须相消');
  }
});

test('有限时间演变保持涡量积分有界，拉长偏向拖尾、压扁偏向轴心卷入',()=>{
  const results=[];
  for(const stretch of [1.25,.75]){
    const flow=new Evolution(stretch),initial=flow.initial;
    let outline=Array.from({length:121},(_,i)=>flow.mapInitial([Math.sin(i/120*Math.PI),Math.cos(i/120*Math.PI),0]));
    for(let step=0;step<200;step++){
      flow.advance(.025);
      outline=outline.map(p=>P.step(p,.025,q=>flow.velocity(q)));
    }
    const result=flow.diagnostics();results.push(result);
    assert.ok(Math.abs(flow.time-5)<1e-10);
    assert.ok(Math.abs(result.mass/initial.mass-1)<1e-8,'守恒输运不能制造涡量积分');
    assert.ok(Math.abs(result.impulse/initial.impulse-1)<.09,'五个时间单位内冲量误差限 9%，仍不作定量预测');
    assert.ok(flow.q.every(q=>Number.isFinite(q)&&q>=-1e-9&&q<=7.500001),'输运不得产生负值或虚假峰值');
    assert.ok(outline.every(p=>flow.contains(p,.05)),'显示轮廓应留在计算范围内，不能冻结在数值边缘');
    const axialGap=Math.abs(outline[0][1]-outline.at(-1)[1]);
    if(stretch>1)assert.ok(axialGap>2*stretch,'实际跟随流体的轮廓应在后方伸长');
    else assert.ok(axialGap<.8,'压扁后的轴上接触区应收窄，而不只是把整张图压缩');
    console.log(`${stretch>1?'拉长':'压扁'}：冲量漂移 ${(100*(result.impulse/initial.impulse-1)).toFixed(2)}%，后方比例 ${(100*result.tailFraction).toFixed(1)}%，轴上最大 q ${result.axisMax.toFixed(2)}`);
  }
  assert.ok(results[0].tailFraction>results[1].tailFraction*1.7,'相同阈值下拉长的后方涡量比例应明显更多');
  assert.ok(results[0].axisMax>5&&results[1].axisMax<3.5,'压扁实验中轴上涡量应显著降低，表现环境流体卷入');
});
