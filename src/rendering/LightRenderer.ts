
// Light is accumulated before display conversion, as in the live reference.
// Geometry is supplied by the Hill field; this module only renders materials.
export type LightVertex = [number,number,number,number,number,number,number,number,number,number,number,number];

const vertexShader=`#version 300 es
precision highp float;
layout(location=0) in vec4 aPositionUv;
layout(location=1) in vec4 aLight;
layout(location=2) in vec4 aMaterial;
out vec2 vUv;
out vec4 vLight;
out vec4 vMaterial;
void main(){
  gl_Position=vec4(aPositionUv.x/540.0-1.0,1.0-aPositionUv.y/540.0,0.0,1.0);
  vUv=aPositionUv.zw;vLight=aLight;vMaterial=aMaterial;
}`;

const fragmentShader=`#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vLight;
in vec4 vMaterial;
out vec4 outputLight;
float hash(vec2 p){
  vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
void main(){
  vec3 radiance;
  if(vMaterial.x<.5){
    float side=abs(vUv.y);
    float core=1.0-smoothstep(.08,.48,side);
    float halo=.042*(1.0-smoothstep(.24,1.0,side));
    radiance=(vLight.rgb*core+vec3(.006,.13,.95)*halo)*vLight.a;
  }else if(vMaterial.x<1.5){
    // The longitudinal coordinate is the physical travel time of each
    // integrated helical streamline. Noise is transported by the flow.
    float travel=vUv.x-vMaterial.w;
    float side=abs(vUv.y);
    float crossSection=pow(1.0-smoothstep(.04,1.0,side),1.45);
    vec2 uv=vec2(travel*1.55+vMaterial.y*7.1,vUv.y*1.7);
    float density=smoothstep(.24,.88,noise(uv)*.72+noise(uv*vec2(2.15,2.55)+8.7)*.28);
    float cloud=crossSection*(.012+.988*pow(density,1.5));
    vec2 starsUv=vec2(travel*41.0+vMaterial.y*17.0,(vUv.y+1.0)*7.2);
    vec2 cell=floor(starsUv),local=fract(starsUv)-.5;
    vec2 offset=vec2(hash(cell+5.2),hash(cell+22.51))-.5;
    float stars=step(.969,hash(cell+36.93))*(1.0-smoothstep(.025,.085,length(local-offset*.68)))*crossSection;
    vec3 gas=mix(vec3(.002,.035,.18),vec3(.022,.30,.94),density);
    radiance=(gas*cloud+vec3(.12,.66,1.4)*stars*.24)*vLight.a;
  }else{
    float r=length(vUv);
    radiance=vLight.rgb*exp(-r*r*5.5)*vLight.a*(1.0-smoothstep(.65,1.0,r));
  }
  outputLight=vec4(radiance,1.0);
}`;

const outputVertex=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  vUv=p;gl_Position=vec4(p*2.0-1.0,0,1);
}`;
const outputFragment=`#version 300 es
precision highp float;
uniform sampler2D uLight;
in vec2 vUv;
out vec4 color;
vec3 displayColor(vec3 light){
  // ACES fitted display transform, matching the reference's Three.js output.
  const mat3 inputMatrix=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
  const mat3 outputMatrix=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
  vec3 v=inputMatrix*(light/.6);
  vec3 a=v*(v+.0245786)-.000090537;
  vec3 b=v*(.983729*v+.4329510)+.238081;
  v=clamp(outputMatrix*(a/b),0.0,1.0);
  return mix(v*12.92,1.055*pow(v,vec3(1.0/2.4))-.055,step(vec3(.0031308),v));
}
void main(){
  vec2 sampleOffset=vec2(.25/1080.0,.25/1080.0);
  vec3 light=(texture(uLight,vUv+sampleOffset).rgb+texture(uLight,vUv-sampleOffset).rgb
    +texture(uLight,vUv+vec2(sampleOffset.x,-sampleOffset.y)).rgb
    +texture(uLight,vUv+vec2(-sampleOffset.x,sampleOffset.y)).rgb)*.25;
  // Only a narrow, faint optical halo; no broad blur over the filaments.
  vec2 px=vec2(1.0/1080.0,1.0/1080.0);
  vec3 halo=texture(uLight,vUv+vec2(px.x*2.0,0)).rgb+texture(uLight,vUv-vec2(px.x*2.0,0)).rgb
    +texture(uLight,vUv+vec2(0,px.y*2.0)).rgb+texture(uLight,vUv-vec2(0,px.y*2.0)).rgb;
  vec3 display=displayColor(light+halo*.012);
  // A dark layer must remain transparent during the torus/sphere crossfade.
  // Store premultiplied light so a single layer over black keeps its color.
  color=vec4(display,max(display.r,max(display.g,display.b)));
}`;

export class LightRenderer {
  private gl:WebGL2RenderingContext;
  private program:WebGLProgram;
  private output:WebGLProgram;
  private buffer:WebGLBuffer;
  private vao:WebGLVertexArrayObject;
  private target:WebGLFramebuffer;
  private texture:WebGLTexture;
  private vertices:Float32Array;
  private size:number;
  private maxTriangles:number;
  private cursor=0;

  constructor(canvas:HTMLCanvasElement,options:{size?:number;maxTriangles?:number}={}){
    this.size=options.size??2160;this.maxTriangles=options.maxTriangles??Infinity;
    this.vertices=new Float32Array(36*Math.min(131072,this.maxTriangles));
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});
    if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw new Error('当前浏览器不支持浮点光照画面');
    this.gl=gl;
    const compile=(source:string,type:number)=>{
      const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)??'光照编译失败');
      return shader;
    };
    const program=(vs:string,fs:string)=>{
      const p=gl.createProgram()!,v=compile(vs,gl.VERTEX_SHADER),f=compile(fs,gl.FRAGMENT_SHADER);
      gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)??'光照程序连接失败');
      gl.deleteShader(v);gl.deleteShader(f);return p;
    };
    this.program=program(vertexShader,fragmentShader);this.output=program(outputVertex,outputFragment);
    this.buffer=gl.createBuffer()!;this.vao=gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(let i=0;i<3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,48,i*16);}
    this.texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,this.size,this.size,0,gl.RGBA,gl.HALF_FLOAT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.target=gl.createFramebuffer()!;gl.bindFramebuffer(gl.FRAMEBUFFER,this.target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('浮点光照缓冲不可用');
    gl.disable(gl.DEPTH_TEST);
  }
  begin(){this.cursor=0;}
  triangle(a:LightVertex,b:LightVertex,c:LightVertex){
    if(this.cursor/36>=this.maxTriangles)return;
    if(this.cursor+36>this.vertices.length){const next=new Float32Array(this.vertices.length*2);next.set(this.vertices);this.vertices=next;}
    this.vertices.set(a,this.cursor);this.vertices.set(b,this.cursor+12);this.vertices.set(c,this.cursor+24);this.cursor+=36;
  }
  finish(){
    const gl=this.gl;
    gl.viewport(0,0,this.size,this.size);gl.bindFramebuffer(gl.FRAMEBUFFER,this.target);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,this.vertices.subarray(0,this.cursor),gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,this.cursor/12);
    gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.useProgram(this.output);gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.uniform1i(gl.getUniformLocation(this.output,'uLight'),0);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  dispose(){
    const gl=this.gl;gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);gl.deleteFramebuffer(this.target);
    gl.deleteTexture(this.texture);gl.deleteProgram(this.program);gl.deleteProgram(this.output);
  }
}
