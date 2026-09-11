import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
const dir=new URL('./',import.meta.url);
await build({absWorkingDir:new URL('.',dir).pathname,entryPoints:['rendering/hero.ts'],outfile:'hero-renderer.js',bundle:true,format:'iife',globalName:'RasenganRenderer',minify:true,target:'es2020'});
let html=readFileSync(new URL('index.html',dir),'utf8');
for(const file of ['physics.js','evolution.js','animations.js','hero-renderer.js','app.js']){
  const tag=`<script src="${file}"></script>`;
  if(!html.includes(tag))throw new Error('缺少入口 '+file);
  const code=readFileSync(new URL(file,dir),'utf8').replace(/<\/script/gi,'<\\/script');
  html=html.replace(tag,()=>`<script>\n${code}\n</script>`);
}
writeFileSync(new URL('螺旋丸实验室.html',dir),html);
console.log('已生成可离线直开的螺旋丸实验室.html');
