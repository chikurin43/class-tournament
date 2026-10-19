import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {VERSION,CLASSES,canonical,hex,chachaBlock,RandomStream,draw,verify,layoutFor,validSlots,normalizeConfig,parsePrice,validDate,shuffled} from '../src/engine.js';
const config=(counts)=>({version:VERSION,title:'テスト大会',counts:[...counts,...Array(18-counts.length).fill(0)],drawDate:'20261020',source:'https://indexes.nikkei.co.jp/nkave/',contingency:'休場時は次の取引日。公表を待ち、抽選実行後の訂正では再抽選しない。'});
test('RFC8439 section 2.3.2 block known-answer test',()=>{
 const key=Uint8Array.from({length:32},(_,i)=>i),nonce=Uint8Array.from([0,0,0,9,0,0,0,0x4a,0,0,0,0]);
 assert.equal(hex(chachaBlock(key,nonce,1)),'10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4ed2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e');
});
test('ChaCha20 multi-block stream agrees with independent Node OpenSSL implementation',()=>{
 const key=Uint8Array.from({length:32},(_,i)=>255-i),iv=Buffer.alloc(16);
 const expected=createCipheriv('chacha20',key,iv).update(Buffer.alloc(256));
 const rng=new RandomStream(key),actual=Buffer.alloc(256);
 for(let i=0;i<64;i++)actual.writeUInt32LE(rng.uint32(),i*4);
 assert.deepEqual(actual,expected);
});
test('bounded sampling discards the incomplete range',()=>{
 const rng=new RandomStream(new Uint8Array(32));const words=[0xffffffff,0xfffffffe,5];rng.uint32=()=>words.shift();assert.equal(rng.below(3),2);assert.deepEqual(words,[5]);
});
test('all Fisher-Yates choice paths produce each small permutation exactly once',()=>{
 const counts=new Map();for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){const choices=[a,b,c];const value=shuffled([0,1,2,3],{below:n=>{const x=choices.shift();assert.ok(x<n);return x;}}).join('');counts.set(value,(counts.get(value)||0)+1);}
 assert.equal(counts.size,24);assert.ok([...counts.values()].every(n=>n===1));
});
test('0/1 teams, overcapacity, decimals, negative counts and infeasible class rejected',()=>{
 for(const c of [[],[1],[31],[17,13],[-1,3],[1.5,2],[NaN,3]])assert.throws(()=>normalizeConfig(config(c)));
 assert.throws(()=>normalizeConfig({...config([1,1]),extra:true}));
 assert.throws(()=>normalizeConfig({...config([1,1]),source:'javascript:alert(1)'}));
 assert.throws(()=>normalizeConfig({...config([1,1]),source:'https://u:p@example.org/'}));
});
test('date and decimal parsing are strict and integer-exact',()=>{
 assert.equal(parsePrice('50123.45'),5012345);
 for(const p of ['50,123.45','50123.4','50123.450','-1.00','0.00','1e4','NaN',' 1.00','01.00'])assert.throws(()=>parsePrice(p));
 for(const d of ['20260230','20261018','20261301','2026102'])assert.throws(()=>validDate(d));
 assert.equal(validDate('20240229'),'20240229');
});
test('bye placement is minimal, no empty match, recursively balanced for every size',()=>{
 for(let n=2;n<=30;n++){const {size,byes}=layoutFor(n);assert.equal(byes.length,size-n);assert.equal(new Set(byes).size,byes.length);for(const slot of byes)assert.equal(slot%2,1);
 for(let width=2;width<=size;width*=2)for(let start=0;start<size;start+=width){const left=byes.filter(x=>x>=start&&x<start+width/2).length,right=byes.filter(x=>x>=start+width/2&&x<start+width).length;assert.ok(Math.abs(left-right)<=1);}}
});
test('conditional sampling has equal accepted multiplicities for a small bracket',()=>{
 const teams=[{id:'A1',class:'A'},{id:'A2',class:'A'},{id:'B1',class:'B'},{id:'B2',class:'B'}],seen=new Map();
 for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){const choices=[a,b,c],slots=shuffled(teams,{below:()=>choices.shift()});if(validSlots(slots)){const k=slots.map(x=>x.id).join();seen.set(k,(seen.get(k)||0)+1);}}
 assert.equal(seen.size,16);assert.ok([...seen.values()].every(n=>n===1));
});
test('every total 2..30: roster, byes, constraints, reproducibility and record verification',async()=>{
 for(let n=2;n<=30;n++){
 const counts=Array(18).fill(0);for(let i=0;i<n;i++)counts[i%18]++;
 const result=await draw(config(counts),'50123.45');
 assert.deepEqual(result,await draw(config(counts),'50123.45'));
 assert.equal(result.slots.filter(Boolean).length,n);assert.equal(new Set(result.slots.filter(Boolean)).size,n);
 assert.equal(result.seed,'25273365');
 assert.ok(validSlots(result.slots.map(id=>id?{class:id.split('-')[0]}:null)));
 assert.deepEqual(await verify(JSON.parse(JSON.stringify(result))),result);
 }
});
test('tampering with a result, roster, price or metadata is detected',async()=>{
 const record=await draw(config([2,2,2]),'50123.45');
 const edits=[x=>x.slots.reverse(),x=>x.seed='0',x=>x.attempts++,x=>x.config.title='変更',x=>x.price='50124.45',x=>x.price100++,x=>x.extra=true];
 for(const edit of edits){const x=structuredClone(record);edit(x);await assert.rejects(()=>verify(x));}
});
test('30-team concentration benchmark and valid outcome',async t=>{
 for(const counts of [[16,14],[15,15],[16,...Array(14).fill(1)]]){
 const start=performance.now();const result=await draw(config(counts),'50123.45');
 assert.ok(validSlots(result.slots.map(id=>id?{class:id.split('-')[0]}:null)));
 t.diagnostic(`${counts.join('/')}: ${result.attempts} attempts, ${Math.round(performance.now()-start)} ms`);
 }
});
test('canonical encoding does not depend on object key insertion order',()=>{assert.equal(canonical({b:2,a:[1,null]}),canonical({a:[1,null],b:2}));assert.equal(CLASSES.length,18);});
test('published sample record remains reproducible',async()=>{
 const {readFile}=await import('node:fs/promises');const record=JSON.parse(await readFile(new URL('../examples/sample-result.json',import.meta.url),'utf8'));assert.deepEqual(await verify(record),record);
});
