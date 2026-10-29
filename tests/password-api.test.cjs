const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');

const {fixture}=require('../test-support/cloudflare-fixture.cjs');

test('Server-side password, sessions, shared records and private files',async()=>{
 const {onRequest}=await import('../functions/api/[[path]].js');
 const f=fixture();const origin='https://preview.example.test';
 const call=(route,method='GET',body,session='',headers={})=>onRequest({env:f.env,request:new Request(origin+'/api/'+route,{method,headers:{...(method==='GET'?{}:{Origin:origin}),...(session?{Cookie:session}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})});
 try{
  assert.equal((await call('session')).status,401);
  assert.equal((await call('records/quote')).status,401);
  assert.equal((await call('files?client=c1')).status,401);
  assert.equal((await call('login','POST',{password:f.env.SITE_PASSWORD},'',{Origin:'https://attacker.test'})).status,403);
  assert.equal((await call('login','POST',{password:'wrong'})).status,401);
  const login=await call('login','POST',{password:f.env.SITE_PASSWORD});assert.equal(login.status,200);
  const cookie=login.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
  const session=cookie.split(';')[0];assert.equal((await call('session','GET',undefined,session)).status,200);
  const session2=(await call('login','POST',{password:f.env.SITE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];assert.notEqual(session,session2);
  const save=(id,body,revision,kind='quote',who=session)=>call('records/'+kind+'/'+id,'PUT',body,who,revision?{'If-Match':String(revision)}:{});
  const q1=await (await save('q1',{clientName:'Shared quote'})).json();assert.equal(q1.quoteNumber,'BH-001');assert.equal(q1._revision,1);
  const q2=await (await save('q2',{})).json();assert.equal(q2.quoteNumber,'BH-002');
  const rows=await (await call('records/quote','GET',undefined,session2)).json();assert.equal(rows.length,2);
  assert.equal((await save('q1',{clientName:'Updated quote'},1)).status,200);
  assert.equal((await save('q1',{clientName:'Stale edit'},1,'quote',session2)).status,409);
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM record_history WHERE id='q1'").get().n,1);
  assert.equal((await save('q1',{})).status,409);
  assert.equal((await save('c1',{profile:{customer:'Shared customer'}},null,'client')).status,200);
  const upload=()=>call('files?client=c1&key=quote&name=approved.pdf','POST','%PDF-synthetic-fixture',session,{'Content-Type':'application/pdf'});
  assert.equal((await upload()).status,200);assert.equal((await upload()).status,409);assert.equal(f.objects.size,1);
  const files=await (await call('files?client=c1','GET',undefined,session2)).json();assert.equal(files.length,1);
  assert.equal((await call('files/'+files[0].object_id)).status,401);
  const downloaded=await call('files/'+files[0].object_id,'GET',undefined,session2);assert.equal(await downloaded.text(),'%PDF-synthetic-fixture');
  assert.equal((await call('files?client=c1&key=quote','DELETE',undefined,session,{'If-Match':'1'})).status,200);
  assert.equal((await call('files/'+files[0].object_id,'GET',undefined,session2)).status,404);
  const tombstones=await (await call('files?client=c1','GET',undefined,session2)).json();assert.equal(tombstones[0].deleted,1);
  assert.equal((await call('files?client=c1&key=quote&name=new.pdf','POST','%PDF-new',session2,{'Content-Type':'application/pdf','If-Match':'2'})).status,200);
  f.sql.prepare('UPDATE storage_budget SET bytes=? WHERE id=1').run(512*1024*1024);
  assert.equal((await call('files?client=c1&key=another&name=x.pdf','POST','x',session,{'Content-Type':'application/pdf'})).status,413);
  assert.equal((await call('records/quote/q1','DELETE',undefined,session2,{'If-Match':'2'})).status,200);
  assert.equal((await (await call('records/quote','GET',undefined,session)).json()).length,1);
  assert.equal((await call('logout','POST',undefined,session)).status,200);
  assert.equal((await call('session','GET',undefined,session)).status,401);
  assert.equal((await call('session','GET',undefined,session2)).status,200);
  f.env.SITE_PASSWORD=randomBytes(24).toString('base64url');assert.equal((await call('session','GET',undefined,session2)).status,401);
  const expiring=(await call('login','POST',{password:f.env.SITE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  f.sql.prepare('UPDATE sessions SET expires_at=0').run();assert.equal((await call('session','GET',undefined,expiring)).status,401);
 }finally{f.sql.close();}
});
test('Login rate limit and fail-closed configuration',async()=>{
 const{onRequest}=await import('../functions/api/[[path]].js');const f=fixture();
 try{
  for(let i=0;i<5;i++){
   const result=await onRequest({env:f.env,request:new Request('https://preview.test/api/login',{method:'POST',headers:{Origin:'https://preview.test'},body:JSON.stringify({password:'incorrect'})})});assert.equal(result.status,401);
  }
  const limited=await onRequest({env:f.env,request:new Request('https://preview.test/api/login',{method:'POST',headers:{Origin:'https://preview.test'},body:JSON.stringify({password:f.env.SITE_PASSWORD})})});assert.equal(limited.status,429);
  assert.equal((await onRequest({env:{},request:new Request('https://preview.test/api/session')})).status,503);
 }finally{f.sql.close();}
});

test('Mutation origin, private-file parent permissions and independent secret rotation',async()=>{
 const {onRequest}=await import('../functions/api/[[path]].js');const f=fixture(),origin='https://review.test';
 const call=(route,method='GET',body,session='',headers={})=>onRequest({env:f.env,request:new Request(origin+'/api/'+route,{method,headers:{...(method==='GET'?{}:{Origin:origin}),...(session?{Cookie:session}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})});
 try{
  const session=(await call('login','POST',{password:f.env.SITE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  assert.equal((await call('records/client/c','PUT',{profile:{}},session,{'Origin':'https://other.test'})).status,403);
  assert.equal((await call('records/client/c','PUT',{profile:{}},session)).status,200);
  assert.equal((await call('files?client=c&key=quote&name=q.pdf','POST','%PDF-test',session,{'Content-Type':'application/pdf'})).status,200);
  const files=await (await call('files?client=c','GET',undefined,session)).json();
  assert.equal((await call('records/client/c','DELETE',undefined,session,{'If-Match':'1'})).status,200);
  assert.equal((await call('files/'+files[0].object_id,'GET',undefined,session)).status,404);
  assert.deepEqual(await (await call('files?client=c','GET',undefined,session)).json(),[]);
  assert.equal((await call('files?client=c&key=quote','POST','x',session)).status,404);
  f.env.SESSION_SECRET=randomBytes(48).toString('base64url');
  assert.equal((await call('session','GET',undefined,session)).status,401);
  for(const [key,value] of [['DB',null],['FILES',null],['SITE_PASSWORD','short'],['SESSION_SECRET','short']]){
   const saved=f.env[key];f.env[key]=value;assert.equal((await call('session')).status,503);f.env[key]=saved;
  }
 }finally{f.sql.close()}
});
