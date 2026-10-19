/** Public deterministic drawing protocol. See SPEC.md. No hidden randomness. */
export const VERSION = 'class-tournament/v1';
export const CLASSES = Array.from({length: 18}, (_, i) => `${Math.floor(i / 6) + 1}${i % 6 + 1}H`);
const encoder = new TextEncoder();
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}
export const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== keys.sort().join('|')) throw new Error('ファイルの項目が仕様と一致しません。');
}
export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{8}$/.test(date) || +date.slice(0, 4) < 1900) throw new Error('日付をYYYYMMDDの8桁で入力してください。');
  const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const d = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== iso) throw new Error('実在する日付を入力してください。');
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) throw new Error('土日は取引日ではありません。事前に指定した取引日を入力してください。');
  return date;
}
export function parsePrice(text) {
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,6})\.\d{2}$/.test(text)) throw new Error('終値はカンマなし・小数第2位まで入力してください（例：50123.45）。');
  const value = Number(text.replace('.', ''));
  if (value <= 0) throw new Error('終値は0より大きい値を入力してください。');
  return value;
}
export function normalizeConfig(input) {
  exactKeys(input, ['version','title','counts','drawDate','source','contingency']);
  if (input.version !== VERSION) throw new Error('対応していない抽選仕様です。');
  if (typeof input.title !== 'string' || input.title.length > 120 || !input.title.trim()) throw new Error('大会名を1～120文字で入力してください。');
  if (!Array.isArray(input.counts) || input.counts.length !== 18 || input.counts.some(n => !Number.isInteger(n) || n < 0 || n > 30)) throw new Error('各クラスのチーム数は0～30の整数で入力してください。');
  const total = input.counts.reduce((a,b) => a+b, 0);
  if (total < 2 || total > 30) throw new Error('参加チームの合計は2～30にしてください。');
  const size = 2 ** Math.ceil(Math.log2(total));
  if (Math.max(...input.counts) > size/2) throw new Error(`${size}枠では、同じクラスは最大${size/2}チームです。1回戦の同クラス対戦を回避できません。`);
  validDate(input.drawDate);
  if (typeof input.source !== 'string' || input.source.length > 500) throw new Error('終値の出典URLを入力してください。');
  let url; try { url = new URL(input.source); } catch { throw new Error('出典はhttps://で始まるURLにしてください。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('出典は認証情報を含まないHTTPS URLにしてください。');
  if (typeof input.contingency !== 'string' || !input.contingency.trim() || input.contingency.length > 1000) throw new Error('休場・遅延・訂正時の扱いを1～1000文字で指定してください。');
  return {version: VERSION, title: input.title, counts: [...input.counts], drawDate: input.drawDate, source: input.source, contingency: input.contingency};
}
export function teamsFor(counts) {
  return counts.flatMap((count, c) => Array.from({length: count}, (_, i) => ({id: `${CLASSES[c]}-${String.fromCharCode(65+i)}`, class: CLASSES[c]})));
}
const rotl = (v,n) => (v << n) | (v >>> (32-n));
function quarter(x,a,b,c,d) {
  x[a]=(x[a]+x[b])>>>0; x[d]=rotl(x[d]^x[a],16);
  x[c]=(x[c]+x[d])>>>0; x[b]=rotl(x[b]^x[c],12);
  x[a]=(x[a]+x[b])>>>0; x[d]=rotl(x[d]^x[a],8);
  x[c]=(x[c]+x[d])>>>0; x[b]=rotl(x[b]^x[c],7);
}
export function chachaBlock(key, nonce, counter) {
  if (key.length !== 32 || nonce.length !== 12 || !Number.isInteger(counter) || counter < 0 || counter > 0xffffffff) throw new Error('Invalid ChaCha20 parameters');
  const state = new Uint32Array(16);
  state.set([0x61707865,0x3320646e,0x79622d32,0x6b206574]);
  const k = new DataView(key.buffer,key.byteOffset,key.byteLength), n = new DataView(nonce.buffer,nonce.byteOffset,nonce.byteLength);
  for(let i=0;i<8;i++) state[i+4]=k.getUint32(i*4,true);
  state[12]=counter;
  for(let i=0;i<3;i++) state[i+13]=n.getUint32(i*4,true);
  const x = state.slice();
  for(let i=0;i<10;i++) {
    quarter(x,0,4,8,12); quarter(x,1,5,9,13); quarter(x,2,6,10,14); quarter(x,3,7,11,15);
    quarter(x,0,5,10,15); quarter(x,1,6,11,12); quarter(x,2,7,8,13); quarter(x,3,4,9,14);
  }
  const out = new Uint8Array(64), view = new DataView(out.buffer);
  for(let i=0;i<16;i++) view.setUint32(i*4,(x[i]+state[i])>>>0,true);
  return out;
}
export class RandomStream {
  constructor(key) {this.key=key;this.counter=0;this.index=64;this.block=null;this.words=0;}
  uint32() {
    if(this.index===64) {if(this.counter>0xffffffff) throw new Error('乱数列の上限に達しました。条件を変更せず、実装を確認してください。'); this.block=new DataView(chachaBlock(this.key,new Uint8Array(12),this.counter++).buffer);this.index=0;}
    const x=this.block.getUint32(this.index,true);this.index+=4;this.words++;return x;
  }
  below(n) {
    if(!Number.isInteger(n)||n<1||n>0x100000000) throw new Error('Invalid range');
    const limit=Math.floor(0x100000000/n)*n;
    let x; do {x=this.uint32();} while(x>=limit);
    return x%n;
  }
}
export function shuffled(values, rng) {
  const a=[...values];
  for(let i=a.length-1;i>0;i--) {const j=rng.below(i+1);[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
export function layoutFor(total) {
  const size=2**Math.ceil(Math.log2(total)), matches=size/2, bits=Math.log2(matches);
  const reverse=i=>{let r=0;for(let b=0;b<bits;b++) {r=r*2+(i&1);i>>>=1;}return r;};
  const byes=Array.from({length:size-total},(_,i)=>reverse(i)*2+1).sort((a,b)=>a-b);
  return {size,byes};
}
export function validSlots(slots) {
  for(let i=0;i<slots.length;i+=2) if(slots[i]&&slots[i+1]&&slots[i].class===slots[i+1].class) return false;
  return true;
}
export async function draw(configInput, price, onProgress=()=>{}) {
  const config=normalizeConfig(configInput), price100=parsePrice(price);
  const seed=String(Number(config.drawDate)+price100);
  const configHash=hex(await sha256(canonical(config)));
  const rng=new RandomStream(await sha256(VERSION+':'+seed));
  const teams=teamsFor(config.counts), {size,byes}=layoutFor(teams.length), byeSet=new Set(byes);
  let attempts=0, slots;
  do {
    attempts++;
    const order=shuffled(teams,rng);let k=0;
    slots=Array.from({length:size},(_,i)=>byeSet.has(i)?null:order[k++]);
    if(attempts%2000===0) {onProgress(attempts);await new Promise(resolve=>setTimeout(resolve,0));}
  } while(!validSlots(slots));
  return {version: VERSION,config,configHash,price,price100,seed,attempts,randomWords:rng.words,slots:slots.map(t=>t?.id??null)};
}
export async function verify(record, onProgress) {
  exactKeys(record,['version','config','configHash','price','price100','seed','attempts','randomWords','slots']);
  if(record.version!==VERSION) throw new Error('対応していない抽選仕様です。');
  const actual=await draw(record.config,record.price,onProgress);
  if(canonical(actual)!==canonical(record)) throw new Error('不一致：入力条件から再計算した結果と、読み込んだ結果が一致しません。');
  return actual;
}
