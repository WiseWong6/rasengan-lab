import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {build,transform} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('../physics.js'),A=require('../animations.js');
const out=new URL('../dist/minitool/',import.meta.url),root=new URL('../',import.meta.url);
rmSync(out,{recursive:true,force:true});mkdirSync(new URL('assets/',out),{recursive:true});
const seeds=[192,96].map(count=>[count,A.seedPoints(P,count,'rasengan').map(x=>x.p)]);
writeFileSync(new URL('assets/seeds.js',out),'window.MiniToolHeroSeeds='+JSON.stringify(seeds)+';\n');
const target=['es2017','chrome61'];
for(const name of ['physics','evolution','animations','app']){
 const result=await transform(readFileSync(new URL(name+'.js',root),'utf8'),{target,minify:true,legalComments:'none'});
 writeFileSync(new URL('assets/'+name+'.js',out),result.code);
}
writeFileSync(new URL('assets/compat.js',out),(await transform(readFileSync(new URL('minitool/compat.js',root),'utf8'),{target,minify:true})).code);
await build({absWorkingDir:root.pathname,entryPoints:['rendering/hero.ts'],outfile:new URL('assets/hero-renderer.js',out).pathname,bundle:true,format:'iife',globalName:'RasenganRenderer',target,minify:true,legalComments:'none'});
let html=readFileSync(new URL('index.html',root),'utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
writeFileSync(new URL('assets/style.css',out),(await transform(css,{loader:'css',target,minify:true})).code);
writeFileSync(new URL('assets/compat.css',out),readFileSync(new URL('minitool/compat.css',root),'utf8'));
html=html.replace(/<style>[\s\S]*?<\/style>/,'<link rel="stylesheet" href="./assets/style.css"><link rel="stylesheet" href="./assets/compat.css">');
html=html.replace('<script src="physics.js">','<script src="./assets/seeds.js"></script><script src="./assets/compat.js"></script><script src="./assets/physics.js">');
for(const name of ['evolution','animations','hero-renderer','app'])html=html.replace('src="'+name+'.js"','src="./assets/'+name+'.js"');
writeFileSync(new URL('index.html',out),html);
console.log('已生成 dist/minitool：经典外置脚本、Chrome 61 目标、离线资源');
