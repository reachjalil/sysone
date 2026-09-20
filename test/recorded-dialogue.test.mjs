import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendRecordedReaction} from '../examples/recorded-dialogue.mjs';
const input={contextId:'scene-1',room:'room',trigger:'look',elapsedSeconds:60,silenceSeconds:5,completedCues:[],recentCues:[],facts:{},candidates:[{id:'lamp',text:'A lamp.'},{id:'wait',text:'Take your time.'}]};
const reply={contextId:'scene-1',action:'speak',candidateId:'lamp',probability:.9};
test('one request receives all eligible candidates and returns a proposal',async()=>{
 let calls=0;const engine={run:async(service,value)=>{calls++;assert.equal(service,'dialogue');assert.equal(value.candidates.length,2);return {result:reply};}};
 assert.deepEqual(await recommendRecordedReaction(engine,input,{isCurrent:()=>true}),{action:'speak',candidateId:'lamp'});assert.equal(calls,1);
});
test('a stale scene or cancellation rejects an otherwise valid reply',async()=>{
 for(const cancel of [false,true]){let current=true;const abort=new AbortController();const engine={run:async()=>{if(cancel)abort.abort();else current=false;return {result:reply};}};
 assert.equal((await recommendRecordedReaction(engine,input,{isCurrent:()=>current,signal:abort.signal})).action,'silence');}
});
test('completed recordings and silence spacing do not need a model',async()=>{
 const engine={run:()=>{throw Error('should not be called');}};
 for(const change of [{silenceSeconds:1},{completedCues:['lamp','wait']}])assert.equal((await recommendRecordedReaction(engine,{...input,...change},{isCurrent:()=>true})).action,'silence');
});
test('unknown cues and missing confidence cannot become playback proposals',async()=>{
 for(const result of [{...reply,candidateId:'invented'},{...reply,probability:null},{...reply,contextId:'old'},{...reply,probability:.79}])assert.equal((await recommendRecordedReaction({run:async()=>({result})},input,{isCurrent:()=>true})).action,'silence');
});
test('an unavailable provider requests the hosts authored fallback',async()=>{
 assert.equal((await recommendRecordedReaction({run:async()=>{throw Error('unavailable');}},input,{isCurrent:()=>true})).action,'fallback');
});
