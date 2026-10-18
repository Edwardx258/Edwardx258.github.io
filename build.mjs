import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
const pages=['index.html','leaselens.html','responsematch.html','materniflow.html'];
for(const page of pages){
  const html=readFileSync(page,'utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:page});
  for(const match of html.matchAll(/href="([^"#]+\.html)(?:#[^"]*)?"/g)) if(!pages.includes(match[1])) throw Error('Missing page: '+match[1]);
}
for(const file of ['printer.js','arch3d.js']) new vm.Script(readFileSync(file,'utf8'),{filename:file});
mkdirSync('dist',{recursive:true});
for(const file of [...pages,'base.css','refinement.css','printer.css','printer.js','arch3d.js']) copyFileSync(file,`dist/${file}`);
console.log('Built 4 static pages; JavaScript syntax and local page links checked.');
