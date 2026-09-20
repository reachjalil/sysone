import {createClient} from 'sysone/client';
const engine=createClient({url:process.env.SYSONE_URL,token:process.env.SYSONE_TOKEN});
console.log(await engine.run('decide',{state:'The support agent issued a full refund.',questions:{refunded:{type:'boolean',instructions:'Was a refund issued?'}}}));
