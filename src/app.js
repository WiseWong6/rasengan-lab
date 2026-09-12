/* 原生 Canvas 三维投影；所有图形、粒子、轨迹均由代码绘制。 */
(() => {
  'use strict';
  const A=HillAnimations, P=HillPhysics, $=id=>document.getElementById(id), canvas=$('scene'),ctx=canvas.getContext('2d');
  if(!ctx){$('scene-label').textContent='画布不可用，请换用支持画布的浏览器';return;}
  let frameHandle=0;
  function queueFrame(){frameHandle=requestAnimationFrame(frame);}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state={animation:null,clean:true,topic:'vortex',view:'3d',axis:'horizontal',swirl:false,spin:.8,speed:1,glow:0,rasenganLight:0,slice:.18,boundary:true,rotate:false,playing:!reduced,yaw:.45,pitch:.22,roll:Math.PI/2,zoom:1,time:0,mass:1,distance:1,moon:38.4,editing:'inside'};
  function regionDefaults(outside=false){return {enabled:!outside,density:(outside?720:1440),trail:.42,lines:true,boundary:true,trace:!outside,layers:0,focus:0,layerVisible:true,surfaces:[]};}
  const regions={inside:regionDefaults(),outside:regionDefaults(true)};
  let w=0,h=0,dpr=1,cacheDirty=true,last=0,phase=0,accumulator=0,lastDraw=0;
  let heroRenderer=null,heroUnavailable=false;const heroCanvas=document.createElement("canvas");
  const isHero=()=>state.animation==='rasengan'||state.animation==='lightning';
  heroCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();heroUnavailable=true;$('renderer-status').hidden=false;$('renderer-status').textContent='已切换轻量光线显示，可刷新恢复光效';});
  heroCanvas.addEventListener('webglcontextrestored',()=>{heroUnavailable=true;heroRenderer=null;});
  const base=document.createElement('canvas'),bg=base.getContext('2d'),bloom=document.createElement('canvas'),bloomCtx=bloom.getContext('2d');
  const light=document.createElement('canvas'),lightCtx=light.getContext('2d');
  let seed=7941,evolution=null,steadySnapshot=null,evolutionOutline=[],evolutionCenter=0,evolutionExtent=1.4;
  const evolutionDuration=5,evolutionEnvironment={radius:2.4,halfLength:3.5};
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function currentRegion(){return regions[state.editing];}
  function decorate(tracer){const p=tracer.p;tracer.dye=.18+.82*(.5+.5*Math.sin(p[0]*11+p[1]*7)*Math.cos(p[2]*9))**2;return tracer;}
  function ensureParticles(name){
    const r=regions[name],seedFn=name==='outside'?P.seedExterior:P.seedVolume;
    if(evolution)return; // 演变中的新示踪不能凭空从起始分布补入；精细度控件暂时锁定。
    if(!r.cloud)r.cloud=[];
    if(r.cloud.length<r.density){
      if(name==='inside'&&state.animation){r.cloud.push(...animationTracers(r.density).slice(r.cloud.length));}
      else{const extra=seedFn(r.density-r.cloud.length,Math.floor(random()*4294967296));r.cloud.push(...extra.map(p=>decorate(P.makeTracer(p,state.swirl?state.spin:0,Math.ceil(r.trail/.01)+1))));}
    }
  }
  function animationTracers(count){
    const r=regions.inside,spin=state.swirl?state.spin:0;
    return A.seedPoints(P,count,state.animation).map(({p,band,birth})=>Object.assign(P.makeTracer(p,spin,Math.ceil(r.trail*1.1/.01)+1),{band,birth}));
  }
  function particleColor(p){
    const colorful=A.presets[state.animation]?.palette;
    const hues=[205,215,190,232,267,35];
    return {hue:colorful?hues[(p.band||0)%hues.length]:205,saturation:colorful?76:94};
  }
  function appearance(p){return A.appearance(state.animation,state.time,p.birth||0);}
  function syncAnimation(){
    const preset=A.presets[state.animation];
    for(const kind of Object.keys(A.presets))$('animation-'+kind).setAttribute('aria-pressed',String(kind===state.animation));
    $('animation-title').textContent=preset?.title||'自由观察';
    $('animation-description').textContent=preset?.description||'调整模型、视角和光丝，观察自己的球涡。';
    $('stage').setAttribute('data-clean',String(state.clean&&state.topic==='vortex'));
    $('stage').setAttribute('data-hero',String(isHero()));
    $('clean-view').checked=state.clean;
  }
  function setAnimation(kind){
    const preset=A.presets[kind];if(!preset)return;
    if(evolution)setPerturbation(null);
    Object.assign(state,{animation:kind,swirl:preset.spin>0,spin:preset.spin||.8,axis:preset.axis||'vertical',editing:'inside',time:0,presentation:0,speed:1,zoom:1,glow:0,rasenganLight:preset.light,rotate:preset.rotate,clean:true,playing:!reduced});
    regions.inside={...regionDefaults(),density:preset.density,trail:preset.trail,boundary:false,trace:false};
    regions.outside=regionDefaults(true);
    accumulator=0;last=0;
    makeParticles('inside');makeParticles('outside');
    setTopic('vortex');setView(preset.view);state.yaw=preset.yaw;state.pitch=preset.pitch;
    $('scene-label').textContent=preset.title;
    $('classic').setAttribute('aria-pressed',String(!state.swirl));$('swirl').setAttribute('aria-pressed',String(state.swirl));
    $('spin-control').hidden=!state.swirl;
    $('mode-description').textContent=state.swirl?'外力维持绕轴旋转，内部继续翻卷。显影只改变亮度，不模拟流场启动。':'经典希尔球涡，内部翻卷，没有绕轴旋转。';
    for(const [id,value] of Object.entries({speed:1,spin:state.spin,glow:0,'rasengan-light':preset.light}))$(id).value=value;
    $('speed-value').textContent='1.0 ×';$('spin-value').textContent=state.spin.toFixed(1);$('glow-value').textContent='关闭';$('rasengan-light-value').textContent=preset.light.toFixed(1)+' ×';$('rotate').checked=state.rotate;
    syncAnimation();syncRegion();cacheDirty=true;playLabel();
  }
  function makeParticles(name='inside'){
    const r=regions[name],outside=name==='outside',spin=state.swirl?state.spin:0,seedFn=outside?P.seedExterior:P.seedVolume;
    r.cloud=!outside&&state.animation?animationTracers(r.density):seedFn(r.density).map(p=>decorate(P.makeTracer(p,spin,Math.ceil(r.trail/.01)+1)));
    r.tracked=P.makeTracer(outside?[.65,2.1,0]:[.23,0,0],spin,340);
  }
  function refreshTrails(){
    const spin=state.swirl?state.spin:0;
    for(const r of Object.values(regions))if(r.cloud)for(const p of [...r.cloud,r.tracked]){
      Object.assign(p,P.makeTracer(p.p,spin,p.history.length));
    }
    accumulator=0;state.time=0;last=0;
  }
  function observationWindow(p){return evolution&&state.topic==='vortex'?evolution.contains(p):Math.hypot(...p)<=1||P.inExteriorDomain(p);}
  function replenish(tracer,spin,focusedRegion=null){
    let p;
    do{p=P.inletPoint(random);}while(focusedRegion&&!inLayer(p,focusedRegion,true));
    Object.assign(tracer,decorate(P.makeTracer(p,spin,tracer.history.length)));
  }
  function advanceFlow(dt){
    if(evolution){advanceEvolution(dt);return;}
    accumulator+=dt;const spin=state.swirl?state.spin:0;
    // 每帧最多计算 12 步；保留剩余时间并显示追赶状态，不静默丢失慢帧的时间。
    let steps=0;
    while(accumulator>=.01&&steps++<12){
      for(const [name,r] of Object.entries(regions)){
        const outside=name==='outside';
        for(const p of [...r.cloud,r.tracked]){
          P.advanceTracer(p,.01,spin);
          if(outside&&!P.inExteriorDomain(p.p))replenish(p,spin,p===r.tracked&&r.focus?r:null);
        }
      }
      accumulator-=.01;state.time+=.01;
    }
  }
  function freshTracer(p,length=84){return decorate({p:p.slice(),history:Array.from({length},()=>p.slice()),cursor:0});}
  function seedEvolution(outside,count){
    if(!outside)return P.seedVolume(count).map(p=>evolution.mapInitial(p));
    const points=[];
    const {radius:R,halfLength:L}=evolutionEnvironment;
    while(points.length<count){const radius=R*Math.sqrt(random()),angle=P.TAU*random(),p=[radius*Math.cos(angle),(random()*2-1)*L,radius*Math.sin(angle)];if(!evolution.inside(p))points.push(p);}
    return points;
  }
  function environmentInlet(){
    // 圆柱的两个端面与侧面都参与补充；按面积抽样后，再按朝内速度加权。
    const {radius:R,halfLength:L}=evolutionEnvironment,cap=R/(2*R+4*L);
    for(let attempt=0;attempt<2000;attempt++){
      const face=random(),angle=P.TAU*random(),c=Math.cos(angle),s=Math.sin(angle);let p,normal;
      if(face<2*cap){const sign=face<cap?1:-1,r=R*Math.sqrt(random());p=[r*c,sign*L,r*s];normal=[0,-sign,0];}
      else{p=[R*c,(random()*2-1)*L,R*s];normal=[-c,0,-s];}
      const velocity=evolution.velocity(p),inward=velocity.reduce((sum,v,i)=>sum+v*normal[i],0);
      if(random()*3<inward)return p.map((v,i)=>v+normal[i]*1e-6);
    }
    // 当前入口近乎停滞时保留原标记，下一步重试，不用虚构入口速度。
    return null;
  }
  function setPerturbation(kind){
    if(kind){state.animation=null;state.clean=false;syncAnimation();}
    if(!kind){
      if(steadySnapshot){
        for(const name of ['inside','outside'])Object.assign(regions[name],steadySnapshot[name]);
        Object.assign(state,steadySnapshot.state);
      }
      evolution=null;steadySnapshot=null;evolutionOutline=[];
      $('perturb-status').textContent='两个开关都关闭：保持经典或受力稳态。打开一个，会从新的初始形状重新演变；不是持续挤压。';
    }else{
      if(!steadySnapshot){
        steadySnapshot={state:{swirl:state.swirl,time:state.time}};
        for(const name of ['inside','outside']){const r=regions[name];steadySnapshot[name]={cloud:r.cloud,tracked:r.tracked,enabled:r.enabled};}
      }
      evolution=new VortexEvolution(kind==='stretch'?1.25:.75);
      state.swirl=false;state.time=0;regions.inside.enabled=true;
      for(const [name,r] of Object.entries(regions)){
        r.cloud=seedEvolution(name==='outside',r.density).map(p=>freshTracer(p));
        r.tracked=freshTracer(name==='outside'?[.7,2.5,0]:evolution.mapInitial([.3,0,0]),340);
      }
      evolutionOutline=Array.from({length:241},(_,i)=>{const angle=Math.PI*(.5-.5*Math.cos(i/240*Math.PI));return evolution.mapInitial([Math.sin(angle),Math.cos(angle),0]);});
      evolutionCenter=0;evolutionExtent=1.4;
      $('perturb-status').textContent=(kind==='stretch'?'起始轴向长度增加 25%，横向收窄，观察后方是否拖出细尾。':'起始轴向长度减少 25%，横向展开，观察后方环境流体如何卷入。')+'体积不变；计算到 5 个时间单位后停下，可重播。';
    }
    accumulator=0;last=0;cacheDirty=true;
    $('perturb-stretch').checked=kind==='stretch';$('perturb-flatten').checked=kind==='flatten';$('perturb-replay').hidden=!kind;
    $('classic').setAttribute('aria-pressed',String(!kind&&!state.swirl));$('swirl').setAttribute('aria-pressed',String(!kind&&state.swirl));
    $('spin-control').hidden=!!kind||!state.swirl;
    $('scene-label').textContent=kind?(kind==='stretch'?'初始拉长 · 自由演变':'初始压扁 · 自由演变'):state.swirl?'受力旋流球涡':'经典希尔球涡';
    $('mode-description').textContent=kind?'开关只改变初始条件。内外流体共同决定之后的速度；未模拟挤压装置。选择经典球涡或受力旋流可结束扰动实验。':state.swirl?'外力维持球内螺旋翻卷；旋转在球面平滑消失，球外保持经典流动。':'经典场满足无黏、不可压缩的理想流体模型；沿轴心前行，从外侧返回。';
    $('speed-description').textContent=kind?'只改变播放进度；内外共用同一物理时钟。':'内外同步播放，保持球面两侧的速度衔接。';
    syncRegion();updateNote();playLabel();
  }
  function advanceEvolution(dt){
    if(state.time>=evolutionDuration){state.playing=false;playLabel();return;}
    accumulator+=dt;let steps=0;
    while(accumulator>=.025&&steps++<2&&state.time<evolutionDuration-1e-8){
      evolution.advance(.025);
      const field=p=>evolution.velocity(p);
      for(const [name,r] of Object.entries(regions))for(const tracer of [...r.cloud,r.tracked]){
        // 历史只来自已经发生的演变，不向过去积分当前瞬时速度。
        if(evolution.contains(tracer.p,.02))tracer.p=P.step(tracer.p,.025,field);
        if(name==='outside'&&(Math.hypot(tracer.p[0],tracer.p[2])>evolutionEnvironment.radius||Math.abs(tracer.p[1])>evolutionEnvironment.halfLength)){
          const inlet=environmentInlet();if(inlet){Object.assign(tracer,freshTracer(inlet,tracer.history.length));continue;}
        }
        tracer.cursor=(tracer.cursor+1)%tracer.history.length;tracer.history[tracer.cursor]=tracer.p;
      }
      evolutionOutline=evolutionOutline.map(p=>P.step(p,.025,field));
      const ys=evolutionOutline.map(p=>p[1]);evolutionCenter=(Math.min(...ys)+Math.max(...ys))/2;
      evolutionExtent=Math.max(1.4,...evolutionOutline.map(p=>Math.hypot(p[0],p[1]-evolutionCenter)));
      accumulator-=.025;state.time=evolution.time;
    }
    if(state.time>=evolutionDuration-1e-8){
      state.playing=false;accumulator=0;playLabel();
      $('perturb-status').textContent='本次演变已停在 5 个时间单位。可转动、切剖面或调光效对照，点击「重播本次扰动」再看一遍。有限网格会模糊细尾，不能据此测量真实流体。';
    }
  }
  function drawEvolutionBoundary(){
    if(!Object.values(regions).some(r=>r.enabled&&r.boundary))return;
    const angles=state.view==='section'?[0,Math.PI]:Array.from({length:10},(_,i)=>i/10*P.TAU);
    for(const angle of angles){
      const rotate=p=>[p[0]*Math.cos(angle),p[1],p[0]*Math.sin(angle)];
      strokePath(ctx,evolutionOutline.map(rotate),'#a1daff80',.8);
    }
    const initial=Array.from({length:129},(_,i)=>evolution.mapInitial([Math.sin(i/128*P.TAU),Math.cos(i/128*P.TAU),0]));
    strokePath(ctx,initial,'#ffc38b88',.8,[4,5]);
    const front=project([0,evolutionCenter+evolutionExtent*.85,0]);
    ctx.font='10px sans-serif';ctx.fillStyle='#9bc8dd';ctx.textAlign='left';ctx.fillText('前进方向',front.x+8,front.y-8);
    ctx.fillStyle='#cfb291';ctx.textAlign='left';ctx.fillText('杏色虚线：起始轮廓  ·  蓝线：原涡团随流动变形',24,h-124);
  }
  function sceneScale(){return Math.min(w*.33,h*.335)*state.zoom*(state.topic==='vortex'?(evolution?.95/evolutionExtent:regions.outside.enabled?.72:1):1);}
  function project(p){if(evolution&&state.topic==='vortex')p=[p[0],p[1]-evolutionCenter,p[2]];const c=Math.cos(state.yaw),s=Math.sin(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch);const x=c*p[0]+s*p[2],z=-s*p[0]+c*p[2],y=cp*p[1]-sp*z,depth=sp*p[1]+cp*z;const distance=(evolution)&&state.topic==='vortex'?10:4.5,k=distance/(distance-depth),scale=sceneScale();const cr=Math.cos(state.roll),sr=Math.sin(state.roll);return {x:w*.50+(x*cr+y*sr)*scale*k,y:h*.51+(x*sr-y*cr)*scale*k,z:depth,k};}
  function visible(p){if(!observationWindow(p))return false;return state.view!=='section'||state.topic!=='vortex'||Math.abs(p[2])<=state.slice/2;}
  function clipSectionSegment(a,b){
    if(!observationWindow(a)||!observationWindow(b))return null;
    if(state.view!=='section'||state.topic!=='vortex')return[a,b];
    const half=state.slice/2,d=b[2]-a[2];
    if(Math.abs(d)<1e-12)return Math.abs(a[2])<=half?[a,b]:null;
    const t1=(-half-a[2])/d,t2=(half-a[2])/d,lo=Math.max(0,Math.min(t1,t2)),hi=Math.min(1,Math.max(t1,t2));
    return lo>hi?null:[a.map((v,i)=>v+(b[i]-v)*lo),a.map((v,i)=>v+(b[i]-v)*hi)];
  }
  function pathSegments(target,points){
    target.beginPath();
    for(let i=1;i<points.length;i++){
      const segment=clipSectionSegment(points[i-1],points[i]);if(!segment)continue;
      const a=project(segment[0]),b=project(segment[1]);target.moveTo(a.x,a.y);target.lineTo(b.x,b.y);
    }
  }
  function strokePath(target,points,color,width=1,dash=[]){target.strokeStyle=color;target.lineWidth=width;target.setLineDash(dash);pathSegments(target,points);target.stroke();target.setLineDash([]);}
  function circle3(radius,y=0,plane='xz'){return Array.from({length:129},(_,i)=>{const a=i/128*P.TAU;return plane==='xy'?[radius*Math.cos(a),radius*Math.sin(a),y]:plane==='yz'?[y,radius*Math.cos(a),radius*Math.sin(a)]:[radius*Math.cos(a),y,radius*Math.sin(a)];});}
  function drawBoundary(target,r=1){
    if(state.topic==='gravity'?!state.boundary:!Object.values(regions).some(r=>r.enabled&&r.boundary))return;
    if(state.view==='section'&&state.topic==='vortex'){strokePath(target,circle3(r,0,'xy'),'#82c5ff5c',1.1,[4,5]);return;}
    for(const plane of ['xy','xz','yz'])strokePath(target,circle3(r,0,plane),state.topic==='vortex'?'#69aeed2d':'#8bb6b52d',.8,[3,5]);
    for(const f of [-.65,-.35,.35,.65])strokePath(target,circle3(r*Math.sqrt(1-f*f),r*f),state.topic==='vortex'?'#518bc917':'#6eaa9d17',.7);
    // 透视球体的轮廓：沿相机平面构造切圆。
    const distance=4.5,depth=r*r/distance,rr=r*Math.sqrt(1-r*r/(distance*distance));
    const c=Math.cos(state.yaw),s=Math.sin(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch);
    const ring=Array.from({length:161},(_,i)=>{const a=i/160*P.TAU,X=rr*Math.cos(a),Y=rr*Math.sin(a),Y1=cp*Y+sp*depth,Z=-sp*Y+cp*depth;return[c*X-s*Z,Y1,s*X+c*Z];});
    strokePath(target,ring,state.topic==='vortex'?'#6cbcff43':'#8ce7ce43',1);
  }
  function drawAxis(target,r=1){strokePath(target,[[0,-r*1.24,0],[0,r*1.24,0]],'#6b999849',.8,[3,6]);const t=project([0,r*1.28,0]);target.fillStyle='#7fa5a6';target.font='10px sans-serif';target.textAlign='center';target.fillText(state.topic==='vortex'?'流动轴':'轨道法线',t.x,t.y-5);}
  function rebuildLayers(name){const r=regions[name];r.surfaces=Array.from({length:r.layers},(_,i)=>P.observationMeridian((i+.5)/r.layers,name==='outside'));cacheDirty=true;}
  function inLayer(p,r,outside){return !!evolution||!r.focus||Math.min(r.layers,1+Math.floor(P.layerCoordinate(p,outside)*r.layers))===r.focus;}
  function drawLayers(target,name){
    if(evolution)return;
    const r=regions[name];if(!r.enabled||!r.layerVisible||!r.layers)return;
    r.surfaces.forEach((meridian,index)=>{
      if(r.focus&&r.focus!==index+1)return;
      if(state.view==='section'){
        for(const sign of [-1,1])strokePath(target,meridian.map(p=>[p[0]*sign,p[1],0]),'#71caff88',1.1);
        return;
      }
      const bands=28;
      for(let j=0;j<bands;j++){
        const a=j/bands*P.TAU,b=(j+1)/bands*P.TAU;
        target.fillStyle=`rgba(64,158,244,${r.focus?.055:.021/Math.sqrt(Math.max(1,r.layers/3))})`;
        for(let i=0;i<meridian.length-1;i++){
          const p=meridian[i],q=meridian[i+1];
          const quad=[[p[0]*Math.cos(a),p[1],p[0]*Math.sin(a)],[q[0]*Math.cos(a),q[1],q[0]*Math.sin(a)],[q[0]*Math.cos(b),q[1],q[0]*Math.sin(b)],[p[0]*Math.cos(b),p[1],p[0]*Math.sin(b)]];
          target.beginPath();quad.forEach((p,k)=>{const v=project(p);if(k)target.lineTo(v.x,v.y);else target.moveTo(v.x,v.y);});target.closePath();target.fill();
        }
      }
    });
  }
  function drawStaticVortex(){
    bg.clearRect(0,0,w,h);if(evolution||state.clean)return;drawLayers(bg,'outside');drawLayers(bg,'inside');drawBoundary(bg);drawAxis(bg);
    if(!state.clean&&state.view==='section'&&regions.inside.enabled){
      bg.font='11px sans-serif';bg.textAlign='center';bg.fillStyle='#8dcfff';
      const p=project([0,.1,0]);bg.fillText(state.axis==='horizontal'?'轴心前行 →':'轴心前行 ↑',p.x,p.y);
      const q=project([.96,.1,0]);bg.fillText(state.axis==='horizontal'?'← 外侧返回':'↓ 外侧返回',q.x+22,q.y);
    }
  }
  // 参考 Developer/Rasengan 的 ribbonFragmentShader：深蓝、亮蓝、青色，细线芯与低强度外晕。
  // 仅重绘已有轨迹的亮部，不创建新的旋臂、光球或粒子运动。
  function flowLight(p){
    const inward=1-Math.min(1,Math.hypot(...p)),deep=[7,92,255],blue=[20,156,255],cyan=[116,229,255];
    const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
    return {color:mix(mix(deep,blue,Math.min(1,inward*1.6)),cyan,inward**1.3),weight:1-.72*inward**1.4};
  }
  function drawTail(p,r,alpha,a,thin=false,highlight=true){
    if(!r.lines)return;alpha*=appearance(p);const color=particleColor(p);const age=r.trail/(evolution?.025:.01);
    for(let band=0;band<3;band++){
      const points=Array.from({length:17},(_,j)=>P.trailPoint(p,age*(1-(band*16+j)/48)));
      strokePath(ctx,points,`hsla(${color.hue-band*3},${color.saturation}%,${52+band*14}%,${alpha*(.12+band*.19)*(thin?.55:1)})`,(.65+band*.13)*a.k);
      if(state.rasenganLight&&highlight){
        const style=flowLight(points[8]),power=state.rasenganLight*style.weight*alpha*(.15+band*.19)*(thin?.65:1);
        strokePath(ctx,points,`rgba(7,92,255,${power*.10})`,3.2*a.k);
        strokePath(ctx,points,`rgba(${style.color.join(',')},${power})`,(.72+band*.10)*a.k);
        // 独立亮部画布让辉光避开网格、标签和观察层。
        strokePath(lightCtx,points,`rgba(${style.color.join(',')},${power})`,1.05*a.k);
        if(band===2)strokePath(ctx,points,`rgba(202,244,255,${power*.28})`,.38*a.k);
      }
    }
  }
  function spriteSphereCut(depth){
    if(evolution)return null;
    if(Math.abs(depth)>=1)return null;
    const center=project([0,0,0]);
    return {x:center.x,y:center.y,radius:sceneScale()*Math.sqrt(1-depth*depth)*4.5/(4.5-depth)};
  }
  function drawFlowLight(p,index,r,a,outside){
    if(!state.rasenganLight||!visible(p.p)||index%Math.max(1,Math.ceil(r.density/720))!==0)return;
    const style=flowLight(p.p),alpha=Math.min(.9,state.rasenganLight*.36*style.weight)*appearance(p),cut=spriteSphereCut(a.z);
    for(const target of [ctx,lightCtx]){
      target.save();target.globalCompositeOperation='lighter';
      if(cut){
        target.beginPath();if(outside)target.rect(0,0,w,h);
        target.moveTo(cut.x+cut.radius,cut.y);target.arc(cut.x,cut.y,cut.radius,0,P.TAU);target.clip(outside?'evenodd':'nonzero');
      }
      target.fillStyle=`rgba(${style.color.join(',')},${alpha})`;target.beginPath();target.arc(a.x,a.y,1.6*a.k,0,P.TAU);target.fill();
      target.fillStyle=`rgba(209,247,255,${alpha*.8})`;target.beginPath();target.arc(a.x,a.y,.62*a.k,0,P.TAU);target.fill();target.restore();
    }
  }
  function drawParticle(p,index,r,outside=false){
    const head=p.p,spin=state.swirl?state.spin:0,speed=Math.hypot(...(evolution?evolution.velocity(head):P.flowVelocity(head,spin))),a=project(head);
    const front=Math.max(0,Math.min(1,(a.z+2)/4)),alpha=.24+front*.65;
    drawTail(p,r,alpha,a,false,index%Math.max(1,Math.ceil(r.density/360))===0);
    if(!visible(head))return;
    const color=particleColor(p);
    ctx.fillStyle=`hsla(${color.hue},${color.saturation}%,${Math.min(91,62+speed*13)}%,${alpha*appearance(p)})`;
    ctx.beginPath();ctx.arc(a.x,a.y,(index%7===0?1.3:.85)*a.k,0,P.TAU);ctx.fill();drawFlowLight(p,index,r,a,outside);
  }
  function drawTrace(r,outside){
    if(!r.trace)return;const p=r.tracked;
    if(!inLayer(p.p,r,outside))return;
    const points=Array.from({length:140},(_,i)=>P.trailPoint(p,(139-i)*Math.min(2,(p.history.length-1)/139)));
    ctx.save();ctx.shadowColor='#159cff';ctx.shadowBlur=13;strokePath(ctx,points,'#75caffbd',1.8);ctx.restore();
    if(!visible(p.p))return;
    const a=project(p.p),glow=ctx.createRadialGradient(a.x,a.y,0,a.x,a.y,15);glow.addColorStop(0,'#d6f3ffcc');glow.addColorStop(.3,'#44b6ff66');glow.addColorStop(1,'#147eff00');ctx.fillStyle=glow;ctx.fillRect(a.x-15,a.y-15,30,30);
    ctx.fillStyle='#e7f8ff';ctx.beginPath();ctx.arc(a.x,a.y,3,0,P.TAU);ctx.fill();ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillStyle='#bde9ff';ctx.fillText(outside?(evolution?'环境示踪':'球外示踪'):(evolution?'原涡团示踪':'球内示踪'),a.x+12,a.y-14);
  }
  function collectRenderItems(){
    const items=[];
    for(const [name,r] of Object.entries(regions))if(r.enabled){
      for(let i=0;i<r.density;i++){const p=r.cloud[i];if(inLayer(p.p,r,name==='outside'))items.push({p,index:i,r,name,depth:project(p.p).z});}
    }
    // 所有透明示踪共同排序，避免整个球内区域永远盖住球外区域。
    return items.sort((a,b)=>a.depth-b.depth);
  }
  function renderFlow(){
    lightCtx.clearRect(0,0,w,h);
    if(isHero()&&state.clean&&state.view!=='section'&&!regions.outside.enabled&&!regions.inside.layers&&regions.inside.lines&&!heroUnavailable){
      if(!regions.inside.enabled)return;
      try{
        if(!heroRenderer){heroCanvas.width=heroCanvas.height=Math.min(1080,Math.round(Math.min(w,h)*dpr));heroRenderer=RasenganRenderer.create(heroCanvas,undefined);}
        heroRenderer.draw(P,regions.inside.cloud.slice(0,regions.inside.density),state,regions.inside.trail);
        const side=Math.min(w,h);ctx.drawImage(heroCanvas,(w-side)/2,(h-side)/2,side,side);return;
      }catch(error){heroUnavailable=true;$('renderer-status').hidden=false;$('renderer-status').textContent='当前设备使用轻量光线显示';}
    }
    const center=project([0,0,0]),radius=sceneScale()/Math.sqrt(1-1/4.5**2);
    for(const item of collectRenderItems()){
      ctx.save();
      if(item.name==='inside'&&!evolution){ctx.beginPath();ctx.arc(center.x,center.y,radius,0,P.TAU);ctx.clip();}
      ctx.globalCompositeOperation='lighter';
      drawParticle(item.p,item.index,item.r,item.name==='outside');ctx.restore();
    }
  }
  function drawBloom(){
    if(state.glow){
      bloomCtx.clearRect(0,0,w,h);bloomCtx.drawImage(canvas,0,0,w,h);
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.min(1,state.glow*.55);ctx.filter='blur(7px)';ctx.drawImage(bloom,0,0,w,h);
      ctx.globalAlpha=state.glow*.28;ctx.filter='blur(22px)';ctx.drawImage(bloom,0,0,w,h);ctx.restore();
    }
    if(state.rasenganLight&&!isHero()){
      ctx.save();ctx.globalCompositeOperation='screen';
      ctx.globalAlpha=.28*state.rasenganLight;ctx.filter='blur(3px)';ctx.drawImage(light,0,0,w,h);
      ctx.globalAlpha=.14*state.rasenganLight;ctx.filter='blur(10px)';ctx.drawImage(light,0,0,w,h);ctx.restore();
    }
  }
  function drawOrientation(){
    if(state.topic!=='vortex')return;
    if(state.clean){$('frame-label').textContent=state.view==='top'?'沿流动轴观察':state.view==='section'?'内部薄片':'拖动可查看内部空间';return;}
    const center=project([0,0,0]),origin={x:52,y:125};
    for(const [v,name,color] of [[[1,0,0],'x','#b9c4e9'],[[0,1,0],'y','#8edaff'],[[0,0,1],'z','#759dcd']]){
      const a=project(v),scale=sceneScale();
      const dx=(a.x-center.x)/scale*24,dy=(a.y-center.y)/scale*24;
      ctx.strokeStyle=color;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(origin.x+dx,origin.y+dy);ctx.stroke();
      ctx.fillStyle=color;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(name,origin.x+dx*1.35,origin.y+dy*1.35-3);
    }
    const alongY=Math.abs(Math.sin(state.pitch))>.94;
    const label=state.view==='section'?`真实薄片 · 厚 ${state.slice.toFixed(2)} 个球半径`:alongY?'接近沿 y 轴观察 · 流动轴朝向你':`立体观察 · ${state.axis==='horizontal'?'横轴':'纵轴'} · y 轴为流动轴`;
    if($('frame-label').textContent!==label)$('frame-label').textContent=label;
  }
  function gravityScales(){const rh=P.hillRadius(state.mass,state.distance)*14959.78707;const scale=Math.max(rh,state.moon,70);return{rh,r:rh/scale,orbit:state.moon/scale,scale};}
  function drawGravity(){
    const {r,orbit}=gravityScales(),center=project([0,0,0]);
    if(state.boundary){const edge=project([r,0,0]),size=Math.max(12,sceneScale()*r);const g=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,size);g.addColorStop(0,'#4cdcb108');g.addColorStop(.86,'#62d4bb0b');g.addColorStop(1,'#94ffe425');ctx.fillStyle=g;ctx.beginPath();ctx.arc(center.x,center.y,size,0,P.TAU);ctx.fill();drawBoundary(ctx,r);}
    drawAxis(ctx,Math.max(.65,r));
    strokePath(ctx,circle3(orbit),'#f4c19188',1.15,[4,5]);
    strokePath(ctx,[[-r,0,0],[r,0,0]],'#a6e6d04d',.8,[2,4]);
    const rad=Math.max(7,Math.min(21,10*Math.pow(state.mass,.12)))*Math.sqrt(state.zoom);
    const g=ctx.createRadialGradient(center.x-rad*.3,center.y-rad*.4,1,center.x,center.y,rad);g.addColorStop(0,'#c6f4e3');g.addColorStop(.32,'#639ca1');g.addColorStop(.67,'#315c70');g.addColorStop(1,'#142b3a');ctx.save();ctx.shadowBlur=22;ctx.shadowColor='#91e5d95a';ctx.fillStyle=g;ctx.beginPath();ctx.arc(center.x,center.y,rad,0,P.TAU);ctx.fill();ctx.restore();
    const moon=project([Math.cos(phase)*orbit,0,Math.sin(phase)*orbit]);
    // 球内外的深度关系只影响卫星与行星的遮挡；两者相隔足够大时正常绘制。
    if(moon.z>=0||Math.hypot(moon.x-center.x,moon.y-center.y)>rad+4){ctx.fillStyle='#ffdfb5';ctx.shadowColor='#ffbb77';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(moon.x,moon.y,3.5,0,P.TAU);ctx.fill();ctx.shadowBlur=0;ctx.textAlign='left';ctx.font='11px sans-serif';ctx.fillStyle='#d8c5ae';ctx.fillText('卫星',moon.x+11,moon.y-8);}
    ctx.fillStyle='#aec9c8';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('行星',center.x,center.y+rad+19);
    if(state.boundary){const label=project([r*.72,r*.72,0]);ctx.fillStyle='#8de3ca';ctx.fillText('希尔球边界',label.x,label.y-13);}
    ctx.fillStyle='#edc79e';ctx.textAlign='left';ctx.fillText('☀ 太阳方向',24,h*.45);ctx.font='10px sans-serif';ctx.fillStyle='#8fa1a7';ctx.fillText('远在画面之外',24,h*.45+19);
    ctx.strokeStyle='#ad895c70';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(26,h*.45+33);ctx.lineTo(92,h*.45+33);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(26,h*.45+33);ctx.lineTo(32,h*.45+29);ctx.moveTo(26,h*.45+33);ctx.lineTo(32,h*.45+37);ctx.stroke();
  }
  function resize(){const rect=canvas.getBoundingClientRect();w=rect.width;h=rect.height;dpr=Math.min(devicePixelRatio||1,2);for(const c of [canvas,base,bloom,light]){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}for(const g of [ctx,bg,bloomCtx,lightCtx])g.setTransform(dpr,0,0,dpr,0,0);cacheDirty=true;}
  function frame(now){
    frameHandle=0;
    if(document.hidden){last=0;return;}
    if((w<740)&&now-lastDraw<32){queueFrame();return;}lastDraw=now;
    const elapsed=last?Math.min(.08,Math.max(0,(now-last)/1000)):0;last=now;
    if(state.playing)state.presentation=(state.presentation||0)+elapsed*state.speed;
    const dt=state.playing?elapsed*state.speed*.42:0;
    if(state.playing)phase+=elapsed*.32*Math.sqrt(state.mass)/Math.pow(state.moon/38.4,1.5);
    if(state.rotate&&state.view==='3d'&&state.playing){state.yaw+=elapsed*(isHero()?.18:.11)*state.speed;cacheDirty=true;}
    ctx.clearRect(0,0,w,h);
    if(state.topic==='vortex'){
      if(cacheDirty){drawStaticVortex();cacheDirty=false;}
      if(state.playing)advanceFlow(dt);
      renderFlow();drawBloom();
      ctx.save();ctx.globalCompositeOperation='destination-over';ctx.drawImage(base,0,0,w,h);ctx.restore();
      if(evolution)drawEvolutionBoundary();
      for(const [name,r] of Object.entries(regions))if(r.enabled)drawTrace(r,name==='outside');
      drawOrientation();$('simulation-time').textContent=`模拟时间 ${state.time.toFixed(2)}${accumulator>.12?' · 计算追赶中':''}`;
    }else drawGravity();
    queueFrame();
  }
  function playLabel(){if(state.topic==='vortex'&&evolution&&state.time>=evolutionDuration-1e-8){$('play').textContent='↺ 重播扰动';$('play').setAttribute('aria-pressed','true');return;}$('play').textContent=state.playing?(state.topic==='vortex'?'Ⅱ 暂停流动':'Ⅱ 暂停运行'):'▷ 继续播放';$('play').setAttribute('aria-pressed',String(!state.playing));}
  function updateGravity(){const {rh}=gravityScales();$('mass-value').textContent=state.mass.toFixed(1)+' 个地球';$('distance-value').textContent=state.distance.toFixed(2)+' 天文单位';$('moon-value').textContent=state.moon.toFixed(1)+' 万千米';$('hill-value').textContent=rh.toFixed(1);$('orbit-status').textContent=state.moon>rh?'轨道超出希尔球 · 很难维持束缚':state.moon>rh*.5?'轨道接近边界 · 稳定性需进一步判断':'轨道位于球内 · 不等于保证稳定';}
  function syncAxis(){
    state.roll=state.topic==='vortex'&&state.view!=='top'&&state.axis==='horizontal'?Math.PI/2:0;
    $('axis-controls').hidden=state.topic!=='vortex';
    for(const axis of ['horizontal','vertical'])$('axis-'+axis).setAttribute('aria-pressed',String(state.view!=='top'&&state.axis===axis));
    cacheDirty=true;
  }
  function setAxis(axis){
    state.axis=axis;
    // 沿轴看时方向投影成一个点，回到立体视角才能展示横向或纵向。
    if(state.view==='top')setView('3d');else syncAxis();
  }
  function setView(view){state.view=view;syncAxis();if(view==='3d'){state.yaw=.45;state.pitch=state.topic==='gravity'?.68:.22;}else{state.yaw=0;state.pitch=view==='top'?Math.PI/2:0;}for(const v of ['3d','section','top'])$('view-'+v).setAttribute('aria-pressed',String(v===view));$('slice-control').hidden=state.topic!=='vortex'||view!=='section';cacheDirty=true;updateNote();}
  function updateLegend(){
    if(state.topic!=='vortex')return;
    $('legend-title').textContent='光色区分路径 · 亮度为艺术表现';
    $('legend-low').textContent='深蓝';$('legend-high').textContent='青白';
  }
  function updateNote(){
    let note;if(state.topic==='gravity')note='轨道为运动示意；行星尺寸已放大';
    else if(evolution)note='初始形变后的近似演变 · 无持续挤压 · 不含浮力与三维紊乱';
    else if(state.swirl)note='外力维持的理想旋流 · 发光为艺术表现';
    else note='经典希尔球涡 · 无黏、不可压缩 · 光点为示踪标记';
    $('model-note').textContent=note;$('model-note').style.display='block';$('model-note').setAttribute('data-model',state.topic==='gravity'?'illustration':evolution?'evolving':state.swirl?'driven':'classic');
  }
  function syncRegion(){
    const r=currentRegion(),outside=state.editing==='outside';
    $('region-inside').setAttribute('aria-pressed',String(!outside));$('region-outside').setAttribute('aria-pressed',String(outside));$('region-name').textContent=evolution?(outside?'环境流体':'原始涡团'):(outside?'球外显示':'球内显示');
    $('region-inside').textContent=evolution?'原始涡团':'球内流动';$('region-outside').textContent=evolution?'环境流体':'球外流动';
    $('boundary-label').textContent=evolution?'显示初始与当前轮廓':'显示球形边界';
    for(const id of ['density','layer-count','layer-more','layer-less','layer-focus','layer-visible'])$(id).disabled=!!evolution;
    $('region-enabled').checked=r.enabled;
    $('density').min=(isHero()?96:360);$('density').max=(isHero()?768:2880);$('density').step=(isHero()?96:360);
    $('trail').max=isHero()?4:2.8;
    for(const key of ['density','trail'])$(key).value=r[key];
    $('density-value').textContent=r.density+' 点';$('trail-value').textContent=r.trail.toFixed(2)+' 时间单位';
    for(const key of ['lines','boundary','trace'])$(key).checked=r[key];$('layer-visible').checked=r.layerVisible;
    $('layer-count').value=r.layers;$('layer-count-value').textContent=r.layers+' 层';$('layer-focus-control').hidden=!!evolution||!r.layers;
    $('layer-focus').max=r.layers;$('layer-focus').value=r.focus;$('layer-focus-value').textContent=r.focus?'第 '+r.focus+' / '+r.layers+' 层':'全部';
    $('layer-description').textContent=outside?'球外是开放流面，按来流位置分层。最左查看全部。':'从外围流面到环形涡核分层，并非同心球壳。最左查看全部。';
    $('region-tip').textContent=evolution?'两组颜色设置按流体的初始来源区分，原来的球面不再是边界。演变中暂不增加示踪点或套用稳态观察层；关闭扰动后恢复。':outside?'球外显示一束绕球而过的来流。球前、球后的气流会投影到圆内，剖面可看清绕行；明暗不表示气体疏密。':'球内、球外分别保存显示设置；改变层数不会改变流动。';
    updateLegend();
  }
  function setRegion(name){state.editing=name;syncRegion();}
  function alignTrace(){
    const r=currentRegion(),outside=state.editing==='outside';
    if(!r.focus||inLayer(r.tracked.p,r,outside))return;
    const p=r.cloud.find(p=>inLayer(p.p,r,outside))?.p||P.observationMeridian((r.focus-.5)/r.layers,outside)[0];
    Object.assign(r.tracked,P.makeTracer(p,state.swirl?state.spin:0,340));
  }
  function setLayers(count){if(evolution)return;const r=currentRegion();r.layers=Math.max(0,Math.min(12,Math.round(count)));r.focus=Math.min(r.focus,r.layers);rebuildLayers(state.editing);alignTrace();syncRegion();}
  function setTopic(topic){
    state.topic=topic;const vortex=topic==='vortex';$('animation-gallery').hidden=!vortex;
    $('simulation-time').hidden=!vortex;
    $('vortex-controls').style.display=vortex?'block':'none';$('gravity-controls').style.display=vortex?'none':'block';$('gravity-boundary-row').style.display=vortex?'none':'flex';
    $('scene-label').textContent=vortex?(evolution?(evolution.stretch>1?'初始拉长 · 自由演变':'初始压扁 · 自由演变'):state.swirl?'受力旋流球涡':'经典希尔球涡'):'行星的希尔球';$('frame-label').textContent=vortex?'随球移动的视角 · 球心保持静止':'以行星为中心 · 太阳质量固定';$('view-section').textContent=vortex?'剖面':'侧视';$('view-top').textContent=vortex?'沿 y 轴':'俯视';
    $('legend-title').textContent='青色 / 希尔球 · 杏色 / 卫星轨道';$('legend-gradient').hidden=!vortex;document.querySelector('.legend-labels').hidden=!vortex;
    canvas.setAttribute('aria-label',vortex?'希尔球涡三维演示。拖动或方向键旋转，滚轮或加减键缩放。':'希尔球三维演示。拖动或方向键旋转，滚轮或加减键缩放。');
    setView('3d');syncAnimation();updateGravity();syncRegion();playLabel();
  }
  function setSwirl(on){state.animation=null;syncAnimation();if(evolution)setPerturbation(null);const changed=state.swirl!==on;state.swirl=on;if(changed)refreshTrails();$('classic').setAttribute('aria-pressed',String(!on));$('swirl').setAttribute('aria-pressed',String(on));$('spin-control').hidden=!on;$('scene-label').textContent=on?'受力旋流球涡':'经典希尔球涡';$('mode-description').textContent=on?'外力维持球内螺旋翻卷；旋转在球面平滑消失，球外保持经典流动。切换强度重新计算稳态路径，不模拟启动过程。':'经典场满足无黏、不可压缩的理想流体模型；沿轴心前行，从外侧返回。';cacheDirty=true;updateNote();}
  for(const kind of Object.keys(A.presets))$('animation-'+kind).onclick=()=>setAnimation(kind);
  $('animation-replay').onclick=()=>{if(state.animation)setAnimation(state.animation);else $('reset').onclick();};
  $('clean-view').onchange=e=>{state.clean=e.target.checked;syncAnimation();cacheDirty=true;};
  $('classic').onclick=()=>setSwirl(false);$('swirl').onclick=()=>setSwirl(true);
  for(const kind of ['stretch','flatten'])$('perturb-'+kind).onchange=e=>setPerturbation(e.target.checked?kind:null);
  $('perturb-replay').onclick=()=>{if(evolution){const kind=evolution.stretch>1?'stretch':'flatten';setPerturbation(kind);state.playing=true;playLabel();}};
  for(const view of ['3d','section','top'])$('view-'+view).onclick=()=>setView(view);
  for(const axis of ['horizontal','vertical'])$('axis-'+axis).onclick=()=>setAxis(axis);
  $('region-inside').onclick=()=>setRegion('inside');$('region-outside').onclick=()=>setRegion('outside');
  $('region-enabled').onchange=e=>{currentRegion().enabled=e.target.checked;cacheDirty=true;};
  for(const name of ['lines','boundary','trace'])$(name).onchange=e=>{currentRegion()[name]=e.target.checked;cacheDirty=true;};
  $('layer-visible').onchange=e=>{currentRegion().layerVisible=e.target.checked;cacheDirty=true;};
  $('layer-count').oninput=e=>setLayers(+e.target.value);$('layer-more').onclick=()=>setLayers(currentRegion().layers+1);$('layer-less').onclick=()=>setLayers(currentRegion().layers-1);
  $('layer-focus').oninput=e=>{if(evolution)return;const r=currentRegion();r.focus=Math.max(0,Math.min(r.layers,+e.target.value));alignTrace();syncRegion();cacheDirty=true;};
  $('gravity-boundary').onchange=e=>{state.boundary=e.target.checked;};$('rotate').onchange=e=>{state.rotate=e.target.checked;};
  $('speed').oninput=e=>{state.speed=+e.target.value;$('speed-value').textContent=state.speed.toFixed(2).replace(/0$/,'')+' ×';};
  $('trail').oninput=e=>{const r=currentRegion();r.trail=+e.target.value;const length=Math.ceil(r.trail/.01)+1;for(const p of r.cloud)if(p.history.length<length)Object.assign(p,P.makeTracer(p.p,state.swirl?state.spin:0,length));syncRegion();};
  $('density').oninput=e=>{if(evolution)return;currentRegion().density=+e.target.value;ensureParticles(state.editing);syncRegion();};
  $('spin').oninput=e=>{state.spin=+e.target.value;refreshTrails();$('spin-value').textContent=state.spin.toFixed(1);};
  $('glow').oninput=e=>{state.glow=+e.target.value;$('glow-value').textContent=state.glow?state.glow.toFixed(1):'关闭';};
  $('rasengan-light').oninput=e=>{state.rasenganLight=Math.max(0,Math.min(2,+e.target.value));$('rasengan-light-value').textContent=state.rasenganLight?state.rasenganLight.toFixed(1)+' ×':'关闭';};
  $('slice').oninput=e=>{state.slice=+e.target.value;$('slice-value').textContent=state.slice.toFixed(2)+' 球半径';cacheDirty=true;};
  for(const name of ['mass','distance','moon'])$(name).oninput=e=>{state[name]=name==='mass'?10**(+e.target.value):+e.target.value;updateGravity();};
  const togglePlay=()=>{if(state.topic==='vortex'&&evolution&&state.time>=evolutionDuration-1e-8){$('perturb-replay').onclick();return;}state.playing=!state.playing;playLabel();};$('play').onclick=togglePlay;
  function zoom(f){state.zoom=Math.max(.6,Math.min(1.65,state.zoom*f));cacheDirty=true;}
  $('zoom-in').onclick=()=>zoom(1.12);$('zoom-out').onclick=()=>zoom(1/1.12);
  $('reset').onclick=()=>{
    if(state.animation){setAnimation(state.animation);return;}
    if(evolution)setPerturbation(null);
    Object.assign(state,{animation:null,clean:false,axis:'horizontal',speed:1,spin:.8,glow:0,rasenganLight:0,slice:.18,boundary:true,rotate:false,playing:!reduced,time:0,zoom:1,mass:1,distance:1,moon:38.4,editing:'inside'});phase=0;accumulator=0;
    regions.inside=regionDefaults();regions.outside=regionDefaults(true);
    for(const [name,value] of Object.entries({speed:1,spin:.8,glow:0,slice:.18,mass:0,distance:1,moon:38.4}))$(name).value=value;
    $('rotate').checked=false;$('gravity-boundary').checked=true;$('speed-value').textContent='1.0 ×';$('spin-value').textContent='0.8';$('glow-value').textContent='关闭';$('slice-value').textContent='0.18 球半径';last=0;
    $('rasengan-light').value=0;$('rasengan-light-value').textContent='关闭';
    setSwirl(false);makeParticles('inside');makeParticles('outside');setTopic(state.topic);
  };
  $('controls-toggle').onclick=()=>{const expanded=$('controls-toggle').getAttribute('aria-expanded')!=='true';$('controls-toggle').setAttribute('aria-expanded',String(expanded));$('controls-toggle').textContent=expanded?'收起参数':'调整参数';$('control-panel').setAttribute('data-expanded',String(expanded));};
  function rotateView(dx,dy){const c=Math.cos(state.roll),s=Math.sin(state.roll);state.yaw+=(dx*c+dy*s)*.006;state.pitch=Math.max(-1.5,Math.min(1.5,state.pitch+(-dx*s+dy*c)*.006));cacheDirty=true;}
  const pointers=new Map();let pinch=0;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
  canvas.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch>0)zoom(d/pinch);pinch=d;return;}if(state.view!=='3d')return;rotateView(e.clientX-old.x,e.clientY-old.y);state.rotate=false;$('rotate').checked=false;cacheDirty=true;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);pinch=0;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.001));},{passive:false});canvas.ondblclick=()=>{state.zoom=1;setView(state.view);};
  document.addEventListener('keydown',e=>{if(/INPUT|BUTTON|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.target!==canvas)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(state.view==='3d'){rotateView(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0,e.key==='ArrowUp'?20:e.key==='ArrowDown'?-20:0);cacheDirty=true;}}if(e.key==='+'||e.key==='=')zoom(1.12);if(e.key==='-')zoom(1/1.12);});
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frameHandle);frameHandle=0;}else if(!frameHandle){queueFrame();}});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);else {window.addEventListener('resize',resize);$('controls-toggle').addEventListener('click',()=>setTimeout(resize,0));}
  makeParticles('inside');makeParticles('outside');setAnimation('rasengan');resize();queueFrame();
})();
