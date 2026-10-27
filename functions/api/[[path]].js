const COOKIE = '__Host-bevhub_session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_FILE = 20 * 1024 * 1024;
const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async value => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function response(body, status = 200, extra = {}) {
 return new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extra } });
}
async function digest(secret, data) {
 const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function cookie(token = '', age = SESSION_SECONDS) { return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
function tokenOf(request) {
 const cookies = request.headers.get('Cookie') || '';
 return cookies.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1) || '';
}
async function readBody(request, limit = 1000000) {
 if (Number(request.headers.get('Content-Length')) > limit) throw new HttpError(413,'Upload is too large.');
 const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
 const parts=[];let length=0;
 while (true) { const {value,done}=await reader.read(); if(done)break; length+=value.length;
  if(length>limit){await reader.cancel();throw new HttpError(413,'Upload is too large.');}parts.push(value);
 }
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
async function jsonBody(request) {
 try { return JSON.parse(new TextDecoder().decode(await readBody(request))); }
 catch(e) { if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid request.'); }
}
function unpack(row) {
 const payload=JSON.parse(row.payload);
 return { ...payload, id:row.id, ...(row.kind==='quote'?{quoteNumber:`BH-${String(row.quote_number).padStart(3,'0')}`}:{ }), _revision:row.revision };
}
function kindOf(value) { if(!['quote','client'].includes(value))throw new HttpError(404,'Record type not found.');return value; }
function idOf(value) { if(typeof value!=='string'||!value.length||value.length>200)throw new HttpError(400,'Invalid record identifier.');return value; }
function expectedVersion(request, allowNew = true) {
 const raw=request.headers.get('If-Match');
 if(raw===null&&allowNew)return null;
 if(!raw||!/^\d+$/.test(raw)||Number(raw)<1||!Number.isSafeInteger(Number(raw)))throw new HttpError(400,'Record version is required.');
 return Number(raw);
}
export async function onRequest({request,env}) {
 try {
  if(!env.DB||!env.FILES||typeof env.SITE_PASSWORD!=='string'||env.SITE_PASSWORD.length<16||typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32)
   throw new HttpError(503,'The shared workspace is not configured yet.');
  const url=new URL(request.url),parts=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)throw new HttpError(403,'Use this site to submit changes.');
  const now=Math.floor(Date.now()/1000),configVersion=await digest(env.SESSION_SECRET,env.SITE_PASSWORD);
  const token=tokenOf(request);
  if(parts[0]==='login'&&request.method==='POST') {
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';
   const bucket=await digest(env.SESSION_SECRET,ip+':'+Math.floor(now/900));
   await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
   ]);
   const attempt=await env.DB.prepare('INSERT INTO login_attempts(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,now+900).first();
   if(attempt.attempts>5)return response({error:'Too many attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'});
   const body=await jsonBody(request);
   if(typeof body.password!=='string'||body.password.length>1024)throw new HttpError(401,'Incorrect password.');
   const entered=await sha(body.password),actual=await sha(env.SITE_PASSWORD);
   let different=0;for(let i=0;i<actual.length;i++)different|=actual.charCodeAt(i)^entered.charCodeAt(i);
   if(different)throw new HttpError(401,'Incorrect password.');
   const fresh=hex(crypto.getRandomValues(new Uint8Array(32)));
   await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions(token_hash,config_version,expires_at) VALUES(?,?,?)').bind(await sha(fresh),configVersion,now+SESSION_SECONDS),
    env.DB.prepare('DELETE FROM login_attempts WHERE bucket=?').bind(bucket),
   ]);
   return response({authenticated:true},200,{'Set-Cookie':cookie(fresh)});
  }
  if(parts[0]==='logout'&&request.method==='POST'){
   if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
   return response({authenticated:false},200,{'Set-Cookie':cookie('',0)});
  }
  const session=/^[a-f0-9]{64}$/.test(token)?await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>? AND config_version=?').bind(await sha(token),now,configVersion).first():null;
  if(!session)throw new HttpError(401,'Sign in to the shared workspace.');
  if(parts[0]==='session'&&request.method==='GET')return response({authenticated:true});
  if(parts[0]==='records'){
   const kind=kindOf(parts[1]);
   if(parts.length===2&&request.method==='GET'){
    const rows=await env.DB.prepare('SELECT * FROM records WHERE kind=? AND deleted=0 ORDER BY updated_at DESC').bind(kind).all();return response(rows.results.map(unpack));
   }
   const id=idOf(parts[2]),version=expectedVersion(request,request.method!=='DELETE');
   if(request.method==='PUT'){
    const body=await jsonBody(request);if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'Invalid record.');
    const {_revision,_updatedBy,...payload}=body;payload.id=id;
    const time=new Date().toISOString();let saved;
    if(version===null){
     saved=await env.DB.prepare("INSERT INTO records(kind,id,payload,quote_number,updated_at) VALUES(?,?,?,CASE WHEN ?='quote' THEN (SELECT coalesce(max(quote_number),0)+1 FROM records WHERE kind='quote') ELSE NULL END,?) ON CONFLICT(kind,id) DO NOTHING RETURNING *")
      .bind(kind,id,JSON.stringify(payload),kind,time).first();
    }else{
     saved=await env.DB.prepare('UPDATE records SET payload=?,revision=revision+1,updated_at=? WHERE kind=? AND id=? AND revision=? AND deleted=0 RETURNING *')
      .bind(JSON.stringify(payload),time,kind,id,version).first();
    }
    if(!saved)throw new HttpError(409,'CONFLICT: this record changed. Reopen it before saving. Your edits have not replaced the shared version.');
    return response(unpack(saved));
   }
   if(request.method==='DELETE'){
    const result=await env.DB.prepare('UPDATE records SET deleted=1,revision=revision+1,updated_at=? WHERE kind=? AND id=? AND revision=? AND deleted=0 RETURNING id')
     .bind(new Date().toISOString(),kind,id,version).first();
    if(!result)throw new HttpError(409,'CONFLICT: this record changed or was deleted. Reload it.');return response({deleted:true});
   }
  }
  if(parts[0]==='files'){
   if(request.method==='GET'&&parts.length===1){
    const client=idOf(url.searchParams.get('client'));
    const rows=await env.DB.prepare("SELECT f.* FROM files f JOIN records r ON r.kind='client' AND r.id=f.client_id WHERE f.client_id=? AND r.deleted=0").bind(client).all();return response(rows.results);
   }
   if(request.method==='GET'&&parts.length===2){
    const file=await env.DB.prepare("SELECT f.* FROM files f JOIN records r ON r.kind='client' AND r.id=f.client_id WHERE f.object_id=? AND f.deleted=0 AND r.deleted=0").bind(idOf(parts[1])).first();
    if(!file)throw new HttpError(404,'Attachment not found.');const object=await env.FILES.get(file.object_id);
    if(!object)throw new HttpError(404,'Attachment not found.');
    return new Response(object.body,{headers:{'Content-Type':file.content_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   const client=idOf(url.searchParams.get('client')),key=idOf(url.searchParams.get('key'));
   const version=expectedVersion(request,request.method!=='DELETE');
   const parent=await env.DB.prepare("SELECT id FROM records WHERE kind='client' AND id=? AND deleted=0").bind(client).first();
   if(!parent)throw new HttpError(404,'Save the customer before attaching files.');
   if(request.method==='POST'){
    const name=url.searchParams.get('name')||'attachment';if(name.length>255)throw new HttpError(400,'Filename is too long.');
    const type=(request.headers.get('Content-Type')||'application/octet-stream').split(';')[0];
    if(!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream'].includes(type))throw new HttpError(400,'Upload a PDF or Word document.');
    const bytes=await readBody(request,MAX_FILE),objectId=crypto.randomUUID();
    // Reserve space atomically. Retained old versions count toward this conservative app limit.
    const reserved=await env.DB.prepare('UPDATE storage_budget SET bytes=bytes+? WHERE id=1 AND bytes+?<=? RETURNING bytes').bind(bytes.length,bytes.length,512*1024*1024).first();
    if(!reserved)throw new HttpError(413,'Shared attachment storage is full. Export backups and ask the site owner to review retention.');
    async function undoUpload(){await env.FILES.delete(objectId);await env.DB.prepare('UPDATE storage_budget SET bytes=bytes-? WHERE id=1').bind(bytes.length).run();}
    try{await env.FILES.put(objectId,bytes,{httpMetadata:{contentType:type}});}catch(e){await undoUpload();throw e;}
    let saved;
    try{
     if(version===null)saved=await env.DB.prepare('INSERT INTO files(client_id,file_key,object_id,name,content_type,size,revision) VALUES(?,?,?,?,?,?,1) ON CONFLICT(client_id,file_key) DO NOTHING RETURNING revision').bind(client,key,objectId,name,type,bytes.length).first();
     else saved=await env.DB.prepare('UPDATE files SET object_id=?,name=?,content_type=?,size=?,revision=revision+1,deleted=0 WHERE client_id=? AND file_key=? AND revision=? RETURNING revision').bind(objectId,name,type,bytes.length,client,key,version).first();
    }catch(e){await undoUpload();throw e;}
    if(!saved){await undoUpload();throw new HttpError(409,'CONFLICT: attachment changed. Reload the customer.');}
    return response(saved);
   }
   if(request.method==='DELETE'){
    const saved=await env.DB.prepare('UPDATE files SET deleted=1,revision=revision+1 WHERE client_id=? AND file_key=? AND revision=? AND deleted=0 RETURNING revision').bind(client,key,version).first();
    if(!saved)throw new HttpError(409,'CONFLICT: attachment changed. Reload the customer.');return response({deleted:true,revision:saved.revision});
   }
  }
  throw new HttpError(404,'Not found.');
 }catch(e){
  if(e instanceof HttpError)return response({error:e.message},e.status);
  // Do not leak database queries, cookies or secret bindings through API errors.
  return response({error:'The shared workspace could not complete this request. Your local edits are still here. Try again or download a backup.'},500);
 }
}
