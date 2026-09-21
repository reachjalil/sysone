import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {login,cloudConnection,logout,selectedTarget,cloudOrigin} from '../dist/cloud-login.js';

test('browser PKCE login, private storage, refresh single flight and revoke',async()=>{
 const home=await mkdtemp(join(tmpdir(),'sysone-cloud-test-'));const original=globalThis.fetch;let redirect,challenge,refreshes=0,revoked=false;
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);
  if(u.origin!==cloudOrigin)return original(url,options);
  if(u.pathname==='/register'){const b=JSON.parse(options.body);redirect=b.redirect_uris[0];assert.match(redirect,/^http:\/\/127\.0\.0\.1:\d+\/callback\//);assert.equal(b.token_endpoint_auth_method,'none');return Response.json({client_id:'test-client'});}
  if(u.pathname==='/token'){const b=options.body;assert.equal(b.get('resource'),cloudOrigin+'/mcp');if(b.get('grant_type')==='authorization_code'){assert.equal(createHash('sha256').update(b.get('code_verifier')).digest('base64url'),challenge);return Response.json({access_token:'sysa_test',refresh_token:'refresh-test',expires_in:1});}refreshes++;return Response.json({access_token:'sysa_new',refresh_token:'refresh-next',expires_in:3600});}
  if(u.pathname==='/revoke'){assert.equal(options.body.get('token'),'refresh-next');revoked=true;return new Response(null,{status:200});}
  throw Error('Unexpected endpoint');
 };
 try{
  let callback;
  await login({home,noOpen:true,onUrl:url=>{const u=new URL(url);challenge=u.searchParams.get('code_challenge');assert.equal(u.searchParams.get('code_challenge_method'),'S256');callback=(async()=>{const invalid=new URL(redirect);invalid.searchParams.set('state','wrong');assert.equal((await original(invalid)).status,400);const target=new URL(redirect);target.searchParams.set('state',u.searchParams.get('state'));target.searchParams.set('iss',cloudOrigin);target.searchParams.set('code','test-code');assert.equal((await original(target)).status,200);})();}});
  await callback;assert.equal(await selectedTarget(home),'cloud');assert.equal((await stat(join(home,'cloud.json'))).mode&0o777,0o600);
  const connection=cloudConnection(home);assert.deepEqual(await Promise.all([connection.token(),connection.token()]),['sysa_new','sysa_new']);assert.equal(refreshes,1);assert.equal(JSON.parse(await readFile(join(home,'cloud.json'))).refreshToken,'refresh-next');
  await logout(home);assert(revoked);assert.equal(await selectedTarget(home),'local');await assert.rejects(readFile(join(home,'cloud.json')));
 }finally{globalThis.fetch=original;await rm(home,{recursive:true,force:true});}
});
