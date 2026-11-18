const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../test-support/cloudflare-fixture.cjs');
test('Recovery, storage and backup are authenticated and revision guarded',async()=>{
 const {onRequest}=await import('../functions/api/[[path]].js'),f=fixture(),origin='https://workspace.test';
 const call=(route,method='GET',body,session='',headers={})=>onRequest({env:f.env,request:new Request(origin+'/api/'+route,{method,headers:{...(method==='GET'?{}:{Origin:origin}),...(session?{Cookie:session}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})});
 try{
  for(const route of ['backup','storage','recovery','history/quote/q','backup-file/id'])assert.equal((await call(route)).status,401);
  const session=(await call('login','POST',{password:f.env.SITE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  assert.equal((await call('records/quote/q','PUT',{clientName:'First',casePack:'bad'},session)).status,400);
  assert.equal((await call('records/client/c','PUT',{profile:{customer:'Client'},skus:[],materials:[],exhibitD:[]},session)).status,200);
  assert.equal((await call('records/quote/q','PUT',{clientName:'First',casePack:24},session)).status,200);
  assert.equal((await call('records/quote/q','PUT',{clientName:'Second',casePack:24},session,{'If-Match':'1'})).status,200);
  const history=await (await call('history/quote/q','GET',undefined,session)).json();assert.equal(history[0].clientName,'First');
  assert.equal((await call('restore/quote/q','POST',{revision:1},session,{'If-Match':'1'})).status,409);
  assert.equal((await call('restore/quote/q','POST',{revision:1},session,{'If-Match':'2',Origin:'https://other.test'})).status,403);
  const restored=await (await call('restore/quote/q','POST',{revision:1},session,{'If-Match':'2'})).json();assert.equal(restored.clientName,'First');assert.equal(restored._revision,3);assert.equal(restored.quoteNumber,'BH-001');
  assert.equal((await call('records/quote/q','DELETE',undefined,session,{'If-Match':'3'})).status,200);
  const rows=await (await call('recovery','GET',undefined,session)).json();assert(rows.find(r=>r.id==='q')._deleted);
  assert.equal((await call('restore/quote/q','POST',{},session,{'If-Match':'4'})).status,200);
  const before=await (await call('storage','GET',undefined,session)).json();assert.equal(before.usedBytes,0);
  assert.equal((await call('files?client=c&key=quote&name=..%2Fescape.pdf','POST','%PDF-test',session,{'Content-Type':'application/pdf'})).status,400);
  await call('files?client=c&key=quote&name=backup.pdf','POST','%PDF-fixture',session,{'Content-Type':'application/pdf'});
  const backup=await (await call('backup','GET',undefined,session)).json();assert.equal(backup.format,'bevhub-workspace');assert.equal(backup.records.length,2);assert.equal(backup.files.length,1);assert(backup.history.length>=4);assert.equal(backup.sessions,undefined);assert(!JSON.stringify(backup).includes(f.env.SITE_PASSWORD));
  const after=await (await call('storage','GET',undefined,session)).json();assert.equal(after.usedBytes,12);
  assert.equal(await (await call('backup-file/'+backup.files[0].object_id,'GET',undefined,session)).text(),'%PDF-fixture');
  assert.equal((await call('backup-file/'+backup.files[0].object_id)).status,401);
 }finally{f.sql.close()}
});
