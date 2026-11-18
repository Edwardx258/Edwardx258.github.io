import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
const pages=['index.html','leaselens.html','responsematch.html','materniflow.html'];
const assets=['assets/redesign/site.css','assets/redesign/site.js','assets/resume.pdf'];
for(const page of pages){
  const html=readFileSync(page,'utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:page});
  for(const match of html.matchAll(/href="([^"#]+\.html)(?:#[^"]*)?"/g)) if(!pages.includes(match[1])) throw Error('Missing page: '+match[1]);
  for(const match of html.matchAll(/(?:href|src)="(assets\/[^"#]+)"/g)) if(!assets.includes(match[1])) throw Error('Missing asset: '+match[1]);
}
new vm.Script(readFileSync('assets/redesign/site.js','utf8'),{filename:'site.js'});
mkdirSync('dist/assets/redesign',{recursive:true});
for(const file of [...pages,...assets]) copyFileSync(file,`dist/${file}`);
console.log('Built 4 static pages; JavaScript syntax, local page links and asset links checked.');
