import {mkdir,rm,cp,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const file of ['index.html','style.css','src','README.md','SPEC.md','LICENSE'])await cp(file,`dist/${file}`,{recursive:true});
await writeFile('dist/build.json',JSON.stringify({version:'1.0.0',repository:process.env.GITHUB_REPOSITORY??'',commit:process.env.GITHUB_SHA??''},null,2)+'\n');
await writeFile('dist/.nojekyll','');
const hashes={};for(const path of ['src/engine.js','src/worker.js','src/app.js','index.html','style.css'])hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile('dist/source-hashes.json',JSON.stringify(hashes,null,2)+'\n');
console.log('Static site generated in dist/');
