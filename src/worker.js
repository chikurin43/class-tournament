import {draw,verify} from './engine.js';
self.onmessage=async ({data})=>{
  try {
    const progress=attempts=>self.postMessage({type:'progress',attempts});
    const result=data.mode==='verify'?await verify(data.record,progress):await draw(data.config,data.price,progress);
    self.postMessage({type:'result',result});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
