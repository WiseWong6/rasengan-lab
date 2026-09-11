const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
function createHarness(preset=false,bundled=false,reduced=false,mini=false){
  const html=fs.readFileSync(path.join(dir,bundled?'希尔实验室.html':'index.html'),'utf8');
  let calls=0,raf,now=0,tracerCreations=0,captureAdvance=false,processingCost=0,processingClock=0;
  const advances=[],documentEvents={},dyePaint=[];
  const draw=new Proxy({}, {get(target,key){if(key==='createImageData')return(w,h)=>({data:new Uint8ClampedArray(w*h*4)});if(key==='createRadialGradient')return()=>({addColorStop(){}});return target[key]||((...args)=>{calls++;if(key==='fill'){const opacity=/^rgba\(33,139,255,([\d.eE+-]+)\)$/.exec(target.fillStyle||'');if(opacity)dyePaint.push(Number(opacity[1]));}for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${key} 收到非有限数值`);});},set(t,k,v){t[k]=v;return true;}});
  class Element{constructor(){this.style={};this.attrs={};this.events={};this.tagName='DIV';}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}addEventListener(k,v){this.events[k]=v;}getContext(){return draw;}getBoundingClientRect(){return{width:900,height:598};}setPointerCapture(){}showModal(){this.open=true;}}
  const nodes={};for(const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1])){assert.ok(!nodes[id],`重复标识 ${id}`);nodes[id]=new Element();}
  const document={getElementById(id){assert.ok(nodes[id],`页面缺少 ${id}`);return nodes[id];},createElement(){return new Element();},querySelector(){return new Element();},addEventListener(name,fn){documentEvents[name]=fn;}};
  const physics=require('../physics.js');
  const scope={HillAnimations:require('../animations.js'),VortexEvolution:require('../evolution.js'),HillPhysics:{...physics,makeTracer(...args){tracerCreations++;return physics.makeTracer(...args);},advanceTracer(tracer,dt,spin){if(captureAdvance)advances.push({tracer,dt,spin});return physics.advanceTracer(tracer,dt,spin);}},document,matchMedia:()=>({matches:reduced}),devicePixelRatio:1,ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn();}},requestAnimationFrame(fn){raf=fn;return 1;},cancelAnimationFrame(){raf=null;},performance:{now(){processingClock+=processingCost;return processingClock;}}};
  if(mini){scope.MiniToolRuntime={level:0,count:192,buffer:960,renderOptions:()=>({size:1024,maxTriangles:99999,samples:40})};delete scope.ResizeObserver;scope.window={addEventListener(){}};}
  const program=bundled?[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'):fs.readFileSync(path.join(dir,'app.js'),'utf8');
  const instrumented=program.replace(/\}\)\(\);\s*$/, 'globalThis.inspect=()=>({state,regions,accumulator,evolution,evolutionOutline});globalThis.testApi={clipSectionSegment,collectRenderItems,pathSegments,project,advanceFlow,spriteSphereCut,setAnimation,renderFlow,appearance,particleColor};})();');
  vm.runInNewContext(instrumented,scope);
  if(!preset)nodes.classic.onclick();
  const tick=(milliseconds=16.7)=>raf(now+=milliseconds);
  const frames=()=>{for(let i=0;i<3;i++)tick();};
  const input=(id,value)=>nodes[id].oninput({target:{value}});
  const check=(id,checked)=>nodes[id].onchange({target:{checked}});
  return {html,scope,nodes,tick,frames,setProcessingCost(value){processingCost=value;},hasScheduledFrame(){return !!raf;},input,check,documentEvents,advances,startAdvanceCapture(){captureAdvance=true;advances.length=0;},getCalls:()=>calls,getTracerCreations:()=>tracerCreations,takeDyePaint:()=>dyePaint.splice(0)};
}
function near(actual,expected,message){assert.ok(Math.abs(actual-expected)<1e-10,`${message}: ${actual} ≠ ${expected}`);}
function plain(value){return JSON.parse(JSON.stringify(value));}

test('五个动画入口，移除顶部两项切换，默认横轴螺旋丸',()=>{
 const {nodes,scope,html,frames}=createHarness(true);
 assert.doesNotMatch(html,/id="topic-(vortex|gravity)"/);
 for(const id of ['overturn','filaments','spiral','rasengan','lightning'])assert.ok(nodes['animation-'+id]);
 const {state,regions}=scope.inspect();assert.equal(state.animation,'rasengan');assert.equal(state.axis,'horizontal');
 assert.equal(state.roll,Math.PI/2);assert.equal(state.pitch,.65);assert.equal(regions.inside.density,384);frames();
});
test('切换、暂停和重播保持当前动画并恢复确定的粒子起点',()=>{
 const {nodes,scope,frames}=createHarness(true);
 for(const name of ['overturn','filaments','spiral','rasengan','lightning']){
  nodes['animation-'+name].onclick();const before=plain(scope.inspect().regions.inside.cloud.map(p=>p.p));
  frames();nodes.play.onclick();const t=scope.inspect().state.time;frames();assert.equal(scope.inspect().state.time,t);
  nodes.reset.onclick();assert.equal(scope.inspect().state.animation,name);
  assert.equal(scope.inspect().state.time,0);assert.equal(scope.inspect().state.presentation,0);
  assert.deepEqual(plain(scope.inspect().regions.inside.cloud.map(p=>p.p)),before);
 }
});
test('手机参数展开按钮同步可访问状态，手指拖动会停止自动转动',()=>{
 const {nodes,scope}=createHarness(true);
 nodes['controls-toggle'].onclick();assert.equal(nodes['controls-toggle'].attrs['aria-expanded'],'true');
 assert.equal(nodes['control-panel'].attrs['data-expanded'],'true');nodes['controls-toggle'].onclick();
 assert.equal(nodes['control-panel'].attrs['data-expanded'],'false');
 nodes.scene.events.pointerdown({pointerId:1,clientX:100,clientY:100});
 nodes.scene.events.pointermove({pointerId:1,clientX:120,clientY:105});assert.equal(scope.inspect().state.rotate,false);
 nodes.scene.events.pointercancel({pointerId:1});
});
test('球状闪电沿用同一流场，不重写粒子位置或绕轴强度',()=>{
 const {nodes,scope}=createHarness(true);const before=plain(scope.inspect().regions.inside.cloud.map(p=>p.p));
 nodes['animation-lightning'].onclick();assert.deepEqual(plain(scope.inspect().regions.inside.cloud.map(p=>p.p)),before);
 assert.equal(scope.inspect().state.spin,6);assert.equal(scope.inspect().state.axis,'horizontal');
});
test('独立页面包含全部脚本，离线运行不依赖其他项目',()=>{
 const html=fs.readFileSync(path.join(dir,'螺旋丸实验室.html'),'utf8');
 assert.doesNotMatch(html,/<script\s+src=|fetch\s*\(|XMLHttpRequest|new Worker|type="module"/);
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 assert.ok(html.includes('id="animation-lightning"'));
});
test('减少动态效果时等待手动播放',()=>{
 const {nodes,scope,frames}=createHarness(true,false,true);frames();assert.equal(scope.inspect().state.time,0);
 assert.equal(scope.inspect().state.playing,false);nodes.play.onclick();frames();assert.ok(scope.inspect().state.time>0);
});

test('小工具在无 ResizeObserver 时能启动，限制粒子并在隐藏后停止循环',()=>{
 const h=createHarness(true,false,false,true);h.frames();
 assert.equal(h.scope.inspect().regions.inside.density,192);
 assert.equal(h.nodes.density.max,'192');
 h.scope.document.hidden=true;h.documentEvents.visibilitychange();assert.equal(h.hasScheduledFrame(),false);
 h.scope.document.hidden=false;h.documentEvents.visibilitychange();assert.equal(h.hasScheduledFrame(),true);
 h.frames();
});
test('小工具持续高耗时会降低精细度，继续卡顿则暂停而不是无限重试',()=>{
 const h=createHarness(true,false,false,true);h.setProcessingCost(60);
 for(let i=0;i<46;i++)h.tick(34);
 assert.equal(h.scope.MiniToolRuntime.level,1);assert.equal(h.scope.inspect().regions.inside.density,96);
 for(let i=0;i<91;i++)h.tick(34);
 assert.ok(h.scope.MiniToolRuntime.level>=3);assert.equal(h.scope.inspect().state.playing,false);
 assert.match(h.nodes['renderer-status'].textContent,/已暂停/);
});
