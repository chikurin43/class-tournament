import {VERSION,CLASSES,normalizeConfig,teamsFor,layoutFor,parsePrice,validDate,canonical,sha256,hex} from './engine.js';
const $=id=>document.getElementById(id);
let currentResult=null,activeWorker=null,revision=0,hashRevision=0;
const countsInputs=[];
function el(tag,text,cls) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
for(let grade=0;grade<3;grade++) {
  const col=el('div');col.append(el('h3',`${grade+1}年 / GRADE ${grade+1}`,'grade-title'));
  for(let c=grade*6;c<grade*6+6;c++) {
    const row=el('div',undefined,'count-row'),label=el('label',CLASSES[c]);label.htmlFor=`count-${c}`;
    const stepper=el('div',undefined,'stepper');
    const minus=el('button','−'),plus=el('button','+'),input=el('input');
    input.id=`count-${c}`;input.type='number';input.min='0';input.max='30';input.step='1';input.value='0';input.inputMode='numeric';
    minus.type=plus.type='button';minus.setAttribute('aria-label',`${CLASSES[c]}を1チーム減らす`);plus.setAttribute('aria-label',`${CLASSES[c]}を1チーム増やす`);
    minus.onclick=()=>{input.value=String(Math.max(0,(Number(input.value)||0)-1));changed();};
    plus.onclick=()=>{input.value=String(Math.min(30,(Number(input.value)||0)+1));changed();};
    input.addEventListener('input',changed);countsInputs.push(input);stepper.append(minus,input,plus);row.append(label,stepper);col.append(row);
  }
  $('class-grid').append(col);
}
function configFromUI() {
  return {version:VERSION,title:$('title').value,counts:countsInputs.map(x=>x.value.trim()===''?NaN:Number(x.value)),drawDate:$('date').value,source:$('source').value,contingency:$('contingency').value};
}
function setStatus(text,error=false) {$('status').textContent=text;$('status').className='status'+(error?' error-text':'');}
function hideResult(){currentResult=null;$('result').hidden=true;$('empty-state').hidden=false;$('result-caption').textContent='抽選後、ここに組み合わせが表示されます。';}
function changed() {
  revision++;$('confirm').checked=false;
  if(activeWorker) {activeWorker.terminate();activeWorker=null;setBusy(false);setStatus('入力が変わったため、処理を中断しました。');}
  hideResult();$('verify-status').textContent='';updateSummary();void updateHash();
}
function updateSummary() {
  const config=configFromUI(),counts=config.counts,total=counts.reduce((a,b)=>a+b,0);
  $('total-badge').replaceChildren(document.createTextNode(Number.isFinite(total)?String(total):'—'),el('small',' / 30'));
  let error='';
  if(counts.some(n=>!Number.isInteger(n)||n<0||n>30))error='各クラスは0～30の整数で入力してください。';
  else if(total<2)error='抽選には2チーム以上必要です。';
  else if(total>30)error='合計は30チーム以下にしてください。';
  else {const {size}=layoutFor(total);if(Math.max(...counts)>size/2)error=`${size}枠では同じクラスは最大${size/2}チームです。`;
    else $('summary').textContent=`${total}チーム / ${size}枠 / 不戦勝 ${size-total}チーム / 1回戦の実試合 ${total-size/2}試合`;}
  if(error)$('summary').textContent=error;
  $('summary').className='summary'+(error?' error':'');
  $('roster').replaceChildren();
  if(!counts.some(n=>!Number.isInteger(n)||n<0||n>30)&&total<=30)teamsFor(counts).forEach(t=>$('roster').append(el('span',t.id)));
  try{const d=validDate($('date').value),p=parsePrice($('price').value);$('seed-preview').textContent=`${d} + ${p.toLocaleString('en-US')} = ${(Number(d)+p).toLocaleString('en-US')}（シード）`;}
  catch{$('seed-preview').textContent='日付と終値を入力するとシードを表示します。';}
}
async function updateHash() {
  const own=++hashRevision;
  try {const config=normalizeConfig(configFromUI());const hash=hex(await sha256(canonical(config)));if(own===hashRevision)$('config-hash').textContent='設定ハッシュ（SHA-256）：'+hash;}
  catch {if(own===hashRevision)$('config-hash').textContent='設定ハッシュ：大会名・参加数・取引日・出典・例外ルールを入力すると表示します。';}
}
for(const id of ['title','date','price','source','contingency'])$(id).addEventListener('input',changed);
$('demo').onclick=()=>{countsInputs.forEach((x,i)=>x.value=i%3===0?'2':'1');changed();};
$('clear').onclick=()=>{countsInputs.forEach(x=>x.value='0');changed();};
function download(name,data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
  const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('save-config').onclick=async()=>{
  try{const config=normalizeConfig(configFromUI());const configHash=hex(await sha256(canonical(config)));download(`class-draw-settings-${config.drawDate}.json`,{config,configHash});setStatus('設定を保存しました。ファイルとハッシュを終値公表前に共有してください。');}
  catch(e){setStatus(e.message,true);}
};
async function readJSON(file){if(!file)throw new Error('ファイルを選択してください。');if(file.size>100000)throw new Error('100KB以下のJSONファイルを選択してください。');try{return JSON.parse(await file.text());}catch{throw new Error('JSONファイルを読み取れません。');}}
$('load-config').onchange=async e=>{
  try{
    const data=await readJSON(e.target.files[0]);
    if(!data||Object.keys(data).sort().join('|')!=='config|configHash')throw new Error('設定JSONの形式が違います。');
    const config=normalizeConfig(data.config),hash=hex(await sha256(canonical(config)));
    if(hash!==data.configHash)throw new Error('設定ハッシュが一致しません。');
    countsInputs.forEach((input,i)=>input.value=String(config.counts[i]));
    for(const [id,key] of [['title','title'],['date','drawDate'],['source','source'],['contingency','contingency']])$(id).value=config[key];
    $('price').value='';changed();setStatus('設定とハッシュを確認して読み込みました。終値を入力してください。');
  }catch(error){setStatus(error.message,true);}finally{e.target.value='';}
};
function setBusy(busy) {$('draw').disabled=busy;$('cancel').hidden=!busy;$('verify-file').disabled=busy;$('save-config').disabled=busy;}
function runWorker(data,verifyMode=false) {
  if(activeWorker)throw new Error('処理中です。完了を待つか中断してください。');
  const own=revision;
  const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});activeWorker=worker;setBusy(true);
  const status=verifyMode?$('verify-status'):$('status');status.className=verifyMode?'':'status';status.textContent=verifyMode?'再計算して検証しています…':'抽選しています…';
  const finish=()=>{worker.terminate();if(activeWorker===worker){activeWorker=null;setBusy(false);}};
  worker.onmessage=({data:message})=>{
    if(own!==revision){finish();return;}
    if(message.type==='progress'){status.textContent=`${verifyMode?'検証':'抽選'}中：${message.attempts.toLocaleString()}配置を確認…`;return;}
    finish();
    if(message.type==='error'){status.textContent=message.message;status.className=verifyMode?'error-text':'status error-text';return;}
    if(verifyMode){applyConfig(message.result.config,message.result.price);revision++;void updateHash();renderResult(message.result);status.textContent='一致しました。入力・シード・試行回数・配置を再計算で確認しました。事前周知と終値の正しさは出典と照合してください。';status.className='success-text';}
    else{renderResult(message.result);setStatus(`抽選完了。${message.result.attempts.toLocaleString()}回目の配置を採用しました。`);}
  };
  worker.onerror=e=>{e.preventDefault();finish();status.textContent='処理を開始できませんでした。HTTPSの公開サイト、またはローカルWebサーバーで開いてください。';status.className=verifyMode?'error-text':'status error-text';};
  worker.postMessage(data);
}
function applyConfig(config,price){countsInputs.forEach((x,i)=>x.value=String(config.counts[i]));for(const id of ['title','source','contingency'])$(id).value=config[id];$('date').value=config.drawDate;$('price').value=price;$('confirm').checked=false;updateSummary();}
$('draw').onclick=()=>{
  try {const config=normalizeConfig(configFromUI());parsePrice($('price').value);if(!$('confirm').checked)throw new Error('事前周知・試用についての確認にチェックしてください。');hideResult();runWorker({mode:'draw',config,price:$('price').value});}
  catch(error){setStatus(error.message,true);}
};
$('cancel').onclick=()=>{if(activeWorker)activeWorker.terminate();activeWorker=null;setBusy(false);setStatus('処理を中断しました。同じ条件で再実行すると、最初から同じ乱数列を使います。');$('verify-status').textContent='';};
$('verify-file').onchange=async e=>{try{const record=await readJSON(e.target.files[0]);runWorker({mode:'verify',record},true);}catch(error){$('verify-status').textContent=error.message;$('verify-status').className='error-text';}finally{e.target.value='';}};
function renderResult(result) {
  currentResult=result;$('result').hidden=false;$('empty-state').hidden=true;
  $('result-caption').textContent=result.config.title;
  const total=result.config.counts.reduce((a,b)=>a+b,0),size=result.slots.length;
  $('result-meta').replaceChildren(...[`${total}チーム`,`${size}枠`,`不戦勝 ${size-total}`,`シード ${result.seed}`].map(x=>el('span',x)));
  const bracket=$('bracket');bracket.replaceChildren();
  const rounds=Math.log2(size),baseHeight=(size/2)*80;
  for(let r=0;r<rounds;r++) {
    const round=el('section',undefined,'round');round.append(el('h3',r===rounds-1?'決勝':r===rounds-2?'準決勝':`${r+1}回戦`));
    const body=el('div',undefined,'round-body');body.style.height=`${baseHeight}px`;
    const count=size/(2**(r+1));
    for(let m=0;m<count;m++) {
      const match=el('div',undefined,'match');match.setAttribute('aria-label',`${r+1}回戦 第${m+1}試合`);
      for(let s=0;s<2;s++) {
        if(r===0) {const id=result.slots[m*2+s];match.append(el('div',id??'不戦勝（空き枠）','slot'+(id?'':' bye')));}
        else {
          const prev=m*2+s;
          const a=r===1?result.slots[prev*2]:undefined,b=r===1?result.slots[prev*2+1]:undefined;
          const auto=r===1&&(a===null||b===null)?a??b:null;
          match.append(el('div',auto??`${r}回戦 ${prev+1} の勝者`,'slot'+(auto?'':' pending')));
        }
      }
      body.append(match);
    }
    round.append(body);bracket.append(round);
  }
  const audit=$('audit');audit.replaceChildren();
  const items=[['仕様',result.version],['日付',result.config.drawDate],['終値',result.price],['終値 × 100',String(result.price100)],['シード',result.seed],['試行回数',String(result.attempts)],['消費した32ビット整数',String(result.randomWords)],['設定SHA-256',result.configHash],['出典',result.config.source],['例外ルール',result.config.contingency]];
  for(const [key,value] of items)audit.append(el('dt',key),el('dd',value));
}
$('save-result').onclick=()=>{if(currentResult)download(`class-draw-result-${currentResult.config.drawDate}.json`,currentResult);};
$('print').onclick=()=>window.print();
async function buildInfo(){try{const r=await fetch(new URL('../build.json',import.meta.url),{cache:'no-store'});if(!r.ok)return;const info=await r.json();if(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(info.repository)&&/^[0-9a-f]{40}$/.test(info.commit)){$('source-link').href=`https://github.com/${info.repository}/tree/${info.commit}`;const a=el('a',`公開コード ${info.commit.slice(0,7)} ↗`);a.href=$('source-link').href;$('build-info').replaceChildren(a);}}catch{/* Local source checkout has no generated build metadata. */}}
updateSummary();void updateHash();void buildInfo();
