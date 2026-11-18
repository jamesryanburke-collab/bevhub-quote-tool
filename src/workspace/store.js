import {validateClient, validateQuote, validateRecord} from '../../shared/validation.js';
import {zipParts,readArchive} from './archive.js';
export async function api(path, options = {}) {
 let result;
 try{result=await fetch('/api/' + path, {credentials:'same-origin',signal:AbortSignal.timeout(90000),...options});window.dispatchEvent(new CustomEvent('bevhub:connection',{detail:'Connected'}));}
 catch{window.dispatchEvent(new CustomEvent('bevhub:connection',{detail:'Connection interrupted'}));throw Error('Connection interrupted. A save may have completed; reopen the record before retrying. Your open edits are kept.')}
 if (result.status === 401 && !['login','session'].includes(path)) window.dispatchEvent(new Event('bevhub:session-expired'));
 if (!result.ok) { const body=await result.json().catch(()=>({})); throw Error(body.error||'The shared workspace is unavailable. Try again.'); }
 return result;
}
const versionHeaders = revision => revision == null ? {} : { 'If-Match':String(revision) };
export class WorkspaceStore {
 constructor() { this.attachmentVersions=new Map();this.quotes=[];this.guards=new Map();this.refreshSequence=0;this.validateClient=validateClient;this.validateQuote=validateQuote; }
 registerGuard(key,guard){this.guards.set(key,guard);return()=>this.guards.delete(key)}
 confirmLeave(key){return [...this.guards.entries()].filter(([name])=>!key||name===key).every(([,guard])=>guard())}
 hasUnsaved(){return [...this.guards.values()].some(guard=>guard(true))}
 async list(kind) { return (await api('records/'+kind)).json(); }
 async refreshQuotes() {const sequence=++this.refreshSequence;const rows=await this.list('quote');if(sequence===this.refreshSequence)this.quotes=rows;return this.quotes;}
 async save(kind,record) {
  validateRecord(kind,record);
  return (await api('records/'+kind+'/'+encodeURIComponent(record.id),{method:'PUT',headers:{'Content-Type':'application/json',...versionHeaders(record._revision)},body:JSON.stringify(record)})).json();
 }
 async remove(kind,record) { await api('records/'+kind+'/'+encodeURIComponent(record.id),{method:'DELETE',headers:versionHeaders(record._revision)}); }
 async listFiles(clientId) {
  const files=await (await api('files?client='+encodeURIComponent(clientId))).json();
  const versions=new Map(),rows=[];
  for(const file of files){
   const key=clientId+':'+file.file_key;versions.set(key,file.revision);
   if(file.deleted)continue;
   const blob=await (await api('files/'+encodeURIComponent(file.object_id))).blob();rows.push({key,name:file.name,blob});
  }
  for(const key of this.attachmentVersions.keys())if(key.startsWith(clientId+':'))this.attachmentVersions.delete(key);
  for(const [key,revision] of versions)this.attachmentVersions.set(key,revision);return rows;
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

const backupFingerprint=snapshot=>JSON.stringify([snapshot.records.map(r=>[r.kind,r.id,r.revision]),snapshot.files.map(f=>[f.object_id,f.revision,f.deleted])]);
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function exportWorkspace(){
 const snapshot=await (await api('backup')).json(),entries=[],checksums={};
 for(const file of snapshot.files){
  const bytes=new Uint8Array(await (await api('backup-file/'+encodeURIComponent(file.object_id))).arrayBuffer());
  if(bytes.length!==file.size)throw Error('Attachment changed or is missing. Retry backup after other users finish saving.');
  entries.push(['files/'+file.object_id,bytes]);checksums[file.object_id]=await digest(bytes);
 }
 const after=await (await api('backup')).json();
 if(backupFingerprint(snapshot)!==backupFingerprint(after))throw Error('Workspace changed during backup. Retry when other users have finished saving.');
 return zipParts([['BevHub_Workspace.json',JSON.stringify({...snapshot,checksums},null,2)],...entries]);
}
export async function inspectWorkspaceBackup(file){
 const entries=await readArchive(file);let manifest;
 try{manifest=JSON.parse(new TextDecoder().decode(entries.get('BevHub_Workspace.json')))}catch{throw Error('Workspace manifest is missing or invalid.')}
 if(manifest.format!=='bevhub-workspace'||manifest.version!==1||!Array.isArray(manifest.records)||!Array.isArray(manifest.files)||!Array.isArray(manifest.history)||manifest.records.length>10000)throw Error('Unsupported workspace backup.');
 const known=new Set();
 for(const row of manifest.records){
  if(!['quote','client'].includes(row.kind)||typeof row.id!=='string'||!row.id.length||row.id.length>200||known.has(row.kind+':'+row.id)||![0,1].includes(row.deleted))throw Error('Invalid or duplicate backup record.');
  const value=JSON.parse(row.payload);validateRecord(row.kind,value);if(new TextEncoder().encode(row.payload).length>950000)throw Error('Backup record exceeds size limits.');known.add(row.kind+':'+row.id);
 }
 const fileKeys=new Set();
 for(const f of manifest.files){
  if(![0,1].includes(f.deleted)||typeof f.object_id!=='string'||!f.object_id.length||f.object_id.length>200||typeof f.client_id!=='string'||!known.has('client:'+f.client_id)||typeof f.file_key!=='string'||!f.file_key.length||f.file_key.length>200||!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream'].includes(f.content_type)||typeof f.name!=='string'||f.name.length>255||fileKeys.has(f.client_id+':'+f.file_key))throw Error('Invalid backup attachment metadata.');
  fileKeys.add(f.client_id+':'+f.file_key);
  const bytes=entries.get('files/'+f.object_id);
  if(!bytes||bytes.length!==f.size||bytes.length>20*1024*1024||await digest(bytes)!==manifest.checksums?.[f.object_id])throw Error('Missing or damaged backup attachment: '+f.name);
 }
 return {manifest,entries};
}
export async function importWorkspaceCopies(store,backup,onProgress=()=>{}){
 const {manifest,entries}=backup,ids=new Map(),created=[],active=manifest.records.filter(r=>!r.deleted);
 const namespace=await digest(new TextEncoder().encode(JSON.stringify(manifest)));
 for(const row of active)ids.set(row.kind+':'+row.id,'copy-'+namespace+'-'+await digest(new TextEncoder().encode(row.kind+':'+row.id)));
 const existing=await (await api('recovery')).json(),known=new Map(existing.map(r=>[r._kind+':'+r.id,r]));
 const activeClients=new Set(active.filter(r=>r.kind==='client'&&!known.get('client:'+ids.get('client:'+r.id))?._deleted).map(r=>r.id));
 const manifests=new Map();
 for(const id of activeClients){const mapped=ids.get('client:'+id);manifests.set(id,known.has('client:'+mapped)?await (await api('files?client='+encodeURIComponent(mapped))).json():[])}
 // A retried import never overwrites edited copies or recreates deliberately deleted files.
 const files=manifest.files.filter(f=>!f.deleted&&activeClients.has(f.client_id)&&!manifests.get(f.client_id).some(row=>row.file_key===f.file_key));
 const storage=await (await api('storage')).json();if(files.reduce((n,f)=>n+f.size,0)+storage.usedBytes>storage.limitBytes)throw Error('Not enough attachment space to import these copies. Nothing was imported.');
 const savedQuotes=new Map();
 for(const row of [...active].sort((a,b)=>(a.kind==='quote'?0:1)-(b.kind==='quote'?0:1))){
  const id=ids.get(row.kind+':'+row.id),previous=known.get(row.kind+':'+id);
  if(previous){if(row.kind==='quote')savedQuotes.set(row.id,previous);continue}
  const value=JSON.parse(row.payload),{_revision,_updatedBy,...copy}=value;copy.id=id;
  if(row.kind==='quote'){copy.status='Draft';copy.originalQuoteNumber=value.quoteNumber;delete copy.quoteNumber}
  if(copy.linkedQuoteKey){
   const linked=savedQuotes.get(copy.linkedQuoteKey),original=manifest.records.find(r=>r.kind==='quote'&&r.id===copy.linkedQuoteKey);
   copy.linkedQuoteKey=ids.get('quote:'+copy.linkedQuoteKey)||'';copy.linkedQuoteNumber=linked?.quoteNumber||'';
   copy.linkedQuoteRevision=original&&value.linkedQuoteRevision===original.revision?linked?._revision:undefined;
  }
  const saved=await store.save(row.kind,copy);if(row.kind==='quote')savedQuotes.set(row.id,saved);created.push(id);onProgress(created.length+' new records copied');
 }
 for(const f of files){const key=ids.get('client:'+f.client_id)+':'+f.file_key;await store.putFile(key,f.name,new Blob([entries.get('files/'+f.object_id)],{type:f.content_type}))}
 await store.refreshQuotes();return created.length;
}
