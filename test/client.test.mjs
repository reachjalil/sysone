import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createClient,engineUrl,ServiceError} from '../dist/index.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const input={state:'The refund was issued.',questions:{refunded:{type:'boolean',instructions:'Was the refund issued?'}}};
async function server(handler,fn){const s=createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await fn(`http://127.0.0.1:${s.address().port}`);}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}}
test('origin validation supports loopback and HTTPS and rejects credential-bearing destinations',()=>{
 for(const url of ['http://127.0.0.1:4319','http://localhost:4319','https://engine.example'])assert.equal(engineUrl(url),url);
 for(const url of ['http://engine.example','https://user:secret@engine.example','https://engine.example/path','https://engine.example?token=secret','file:///etc/passwd'])assert.throws(()=>engineUrl(url));
});
test('HTTP client uses consumer authorization and preserves supplied cancellation',()=>server((req,res)=>{
 assert.equal(req.headers.authorization,'Bearer fixture-token');if(req.url==='/v1/capabilities'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({services:['decide']}));}else{req.resume();}
},async url=>{const client=createClient({url,token:'fixture-token'});assert.deepEqual(await client.capabilities(),{services:['decide']});const cancel=new AbortController();const pending=client.run('decide',input,cancel.signal);cancel.abort();await assert.rejects(pending);await assert.rejects(async()=>client.run('../../admin/status',{}));}));
test('redirects never forward tokens and HTTP errors do not echo sensitive response text',async()=>{
 let forwarded=false;await server((_req,res)=>{forwarded=true;res.end('{}');},async target=>{
  await server((_req,res)=>{res.writeHead(302,{Location:target});res.end();},async url=>{await assert.rejects(createClient({url,token:'private'}).capabilities());});
 });assert.equal(forwarded,false);
 await server((_req,res)=>{res.writeHead(401);res.end('sensitive-provider-detail');},async url=>{await assert.rejects(createClient({url,token:'private'}).capabilities(),e=>e instanceof ServiceError&&e.status===401&&!e.message.includes('sensitive'));});
});
test('response byte bound and JSON object check reject malformed engine responses',async()=>{
 for(const payload of ['x'.repeat(256001),'null','[]'])await server((_req,res)=>res.end(payload),async url=>{await assert.rejects(createClient({url,token:'private'}).capabilities());});
});
test('published CLI MCP bridge initializes and forwards tool calls with client metadata',()=>server(async(req,res)=>{
 assert.equal(req.headers.authorization,'Bearer fixture-token');assert.equal(req.headers['x-sysone-transport'],'mcp-stdio');
 let body='';for await(const part of req)body+=part;
 res.setHeader('Content-Type','application/json');
 if(req.url==='/v1/capabilities')res.end(JSON.stringify({services:['decide'],connection:{name:'fixture'},usage:[]}));
 else if(req.url==='/v1/patterns/run'){assert.equal(JSON.parse(body).pattern,'item-match');res.end(JSON.stringify({recipe:{id:'item-match'},meta:{calls:1}}));}
 else{assert.equal(req.url,'/v1/decide');assert.equal(decodeURIComponent(req.headers['x-sysone-client-name']),'Public client test');assert.deepEqual(JSON.parse(body),input);res.end(JSON.stringify({result:{answers:{refunded:{probability:.95}}},meta:{calls:1}}));}
},async url=>{
 const home=await mkdtemp(join(tmpdir(),'sysone-client-'));const connection=join(home,'agent.json');await writeFile(connection,JSON.stringify({url,token:'fixture-token'}),{mode:0o600});
 const client=new Client({name:'Public client test',version:'1.0'});const transport=new StdioClientTransport({command:process.execPath,args:[resolve('dist/cli.js'),'mcp','--connection',connection],stderr:'pipe'});
 try{await client.connect(transport);assert.equal((await client.listTools()).tools.length,7);const result=await client.callTool({name:'sysone_decide',arguments:input});assert.equal(result.structuredContent.meta.calls,1);const recipe=await client.callTool({name:'sysone_run',arguments:{pattern:'item-match',state:'A small light',candidates:{a:'Small lamp'}}});assert.equal(recipe.structuredContent.recipe.id,'item-match');}finally{await client.close();await rm(home,{recursive:true,force:true});}
}));

test('recipe client validates input and sends the saved recipe request without provider credentials', () => server(async (req,res) => {
 assert.equal(req.url,'/v1/patterns/run'); assert.equal(req.headers.authorization,'Bearer fixture-token');
 let body=''; for await(const part of req) body+=part;
 const value=JSON.parse(body);assert.equal(value.pattern,'item-match');assert.deepEqual(value.candidates,{a:'Small lamp'});
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({recipe:{id:'item-match'},meta:{calls:1}}));
},async url=>{
 const client=createClient({url,token:'fixture-token'});
 assert.equal((await client.runPattern({pattern:'item-match',state:'A small light',candidates:{a:'Small lamp'}})).recipe.id,'item-match');
 assert.throws(()=>client.runPattern({pattern:'item-match',state:'A small light',candidates:{review:'Override'}}));
}));
