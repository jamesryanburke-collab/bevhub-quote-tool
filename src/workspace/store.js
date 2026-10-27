export async function api(path, options = {}) {
 const result = await fetch('/api/' + path, { credentials:'same-origin', ...options });
 if (result.status === 401 && !['login','session'].includes(path)) window.dispatchEvent(new Event('bevhub:session-expired'));
 if (!result.ok) { const body=await result.json().catch(()=>({})); throw Error(body.error||'The shared workspace is unavailable. Try again.'); }
 return result;
}
const versionHeaders = revision => revision == null ? {} : { 'If-Match':String(revision) };
export class WorkspaceStore {
 constructor() { this.attachmentVersions=new Map();this.quotes=[]; }
 async list(kind) { return (await api('records/'+kind)).json(); }
 async refreshQuotes() { this.quotes=await this.list('quote');return this.quotes; }
 async save(kind,record) {
  return (await api('records/'+kind+'/'+encodeURIComponent(record.id),{method:'PUT',headers:{'Content-Type':'application/json',...versionHeaders(record._revision)},body:JSON.stringify(record)})).json();
 }
 async remove(kind,record) { await api('records/'+kind+'/'+encodeURIComponent(record.id),{method:'DELETE',headers:versionHeaders(record._revision)}); }
 async listFiles(clientId) {
  const files=await (await api('files?client='+encodeURIComponent(clientId))).json();
  for(const key of this.attachmentVersions.keys())if(key.startsWith(clientId+':'))this.attachmentVersions.delete(key);
  const rows=[];
  for(const file of files){
   const key=clientId+':'+file.file_key;this.attachmentVersions.set(key,file.revision);
   if(file.deleted)continue;
   const blob=await (await api('files/'+encodeURIComponent(file.object_id))).blob();rows.push({key,name:file.name,blob});
  }
  return rows;
 }
 fileQuery(key) { const split=key.indexOf(':');return new URLSearchParams({client:key.slice(0,split),key:key.slice(split+1)}); }
 async putFile(key,name,blob) {
  if(blob.size>20*1024*1024)throw Error('Attachments must be 20 MB or smaller.');
  const query=this.fileQuery(key);query.set('name',name);
  const result=await (await api('files?'+query,{method:'POST',headers:{'Content-Type':blob.type||'application/octet-stream',...versionHeaders(this.attachmentVersions.get(key))},body:blob})).json();
  this.attachmentVersions.set(key,result.revision);
 }
 async removeFile(key) {
  const result=await (await api('files?'+this.fileQuery(key),{method:'DELETE',headers:versionHeaders(this.attachmentVersions.get(key))})).json();
  this.attachmentVersions.set(key,result.revision);
 }
}
