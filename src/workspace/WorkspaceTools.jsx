import React,{useEffect,useRef,useState} from 'react';
import {api,exportWorkspace,inspectWorkspaceBackup,importWorkspaceCopies} from './store.js';
export function downloadFile(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function HistoryValues({row}){
 const fields=row.profile?{
  Customer:row.profile.customer,'Legal entity':row.profile.legalName,Facility:row.profile.facility,'Agreement date':row.profile.effectiveDate,'Term (years)':row.profile.term,'Start date':row.profile.startDate,'End date':row.profile.endDate,'Can size':row.profile.package,'Case pack':row.profile.casePack,'Annual cases':row.profile.annualCases,'SKU count':row.skus?.length,'Exhibit D provisions':row.exhibitD?.filter(d=>d.text).length
 }:{Customer:row.clientName,'Can size':row.canSize,'Case pack':row.casePack,'Annual cases':row.annualCases,'Pricing program':row.pricingProgram||'annual','Tolling per can':row.tolling,'Campaign cans':row.campaignCans,'Custom terms':row.customTerms,Status:row.status};
 return <dl>{Object.entries(fields).filter(([,value])=>value!==undefined&&value!=='').map(([label,value])=><div key={label}><dt><b>{label}</b></dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(value)}</dd></div>)}</dl>;
}
export default function WorkspaceTools({store}){
 const dialog=useRef(null),picker=useRef(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[storage,setStorage]=useState(null),[records,setRecords]=useState([]),[selected,setSelected]=useState(null),[history,setHistory]=useState([]),[backup,setBackup]=useState(null),[search,setSearch]=useState('');
 useEffect(()=>store.registerGuard('workspace-tools',check=>check?busy:busy?(setMessage('Wait for the workspace operation to finish.'),false):true),[store,busy]);
 async function refresh(){const [budget,rows]=await Promise.all([(await api('storage')).json(),(await api('recovery')).json()]);setStorage(budget);setRecords(rows);setSelected(null);setHistory([])}
 async function run(action){setBusy(true);setMessage('');try{await action()}catch(e){setMessage(e.message+' Completed imports, if any, remain saved; inspect the library before retrying.')}finally{setBusy(false)}}
 async function open(){dialog.current.showModal();await run(refresh)}
 async function select(row){setSelected(row);setHistory(await (await api('history/'+row._kind+'/'+encodeURIComponent(row.id))).json())}
 async function restore(revision){
  if(!store.confirmLeave('calculator')||!store.confirmLeave('contracts'))return;
  if(!window.confirm('Restore this saved record? A new revision will be created. Reopen the record after restoration. Attachment versions are not rewound.'))return;
  await api('restore/'+selected._kind+'/'+encodeURIComponent(selected.id),{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(selected._revision)},body:JSON.stringify(revision?{revision}:{})});
  await store.refreshQuotes();await refresh();setMessage('Record restored. Reopen it to load the restored revision.');
 }
 return <>
 <button onClick={open}>Backup & recovery</button>
 <dialog ref={dialog} aria-labelledby="workspace-tools-title" className="workspace-dialog" onCancel={e=>{if(busy)e.preventDefault()}}>
  <div className="workspace-dialog-heading"><h2 id="workspace-tools-title">Workspace backup & recovery</h2><button disabled={busy} onClick={()=>dialog.current.close()}>Close</button></div>
  <p>Everyone with the site password can use these tools. Backups contain private customer information; store them securely.</p>
  {storage&&<p>Attachment storage: {(storage.usedBytes/1048576).toFixed(1)} of {(storage.limitBytes/1048576).toFixed(0)} MiB used, including retained uploads. Maximum file: 20 MiB. This is not a Cloudflare billing cap.</p>}
  <div className="workspace-actions">
   <button disabled={busy} onClick={()=>run(async()=>{
    if(store.hasUnsaved()&&!window.confirm('The backup contains saved records only. Unsaved drafts are not included. Continue?'))return;
    setMessage('Preparing saved records and attachments…');const blob=await exportWorkspace();downloadFile('BevHub_Workspace_'+new Date().toISOString().slice(0,10)+'.zip',blob);setMessage('Backup downloaded. Keep it private.');
   })}>Download workspace backup</button>
   <button disabled={busy} onClick={()=>picker.current.click()}>Import workspace backup as copies</button>
   <button disabled={busy} onClick={()=>run(refresh)}>Refresh recovery list</button>
  </div>
  <input ref={picker} type="file" accept=".zip" hidden onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)run(async()=>{const checked=await inspectWorkspaceBackup(file);setBackup(checked);setMessage('Backup checked. Review the import below; nothing has been saved.');})}}/>
  {backup&&<section className="workspace-card"><h3>Review backup import</h3><p>{backup.manifest.records.filter(r=>!r.deleted).length} active records will be created as new copies with new quote numbers. Existing records are never overwritten. Reimporting the same backup skips copies already created. Deleted records and historical revisions remain in the backup but are not imported.</p><p>An interrupted import may leave completed copies. Retrying the exact same backup resumes missing records and attachments without replacing existing copies.</p><button disabled={busy} onClick={()=>run(async()=>{
   if(!store.confirmLeave('calculator')||!store.confirmLeave('contracts'))return;
   if(!window.confirm('Create new copies from this backup?'))return;
   const count=await importWorkspaceCopies(store,backup,setMessage);setBackup(null);await refresh();setMessage(count+' records copied. Refresh the calculator or reload shared clients to see them.');
  })}>Confirm import as copies</button><button disabled={busy} onClick={()=>setBackup(null)}>Cancel import</button></section>}
  <p role="status" aria-live="polite">{busy?'Working… ':''}{message}</p>
  <h3>Saved record history and deleted records</h3>
  <label>Find a record<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Customer or quote number"/></label>
  <div className="workspace-records">{records.filter(r=>(r.clientName||r.profile?.customer||r.quoteNumber||'').toLowerCase().includes(search.toLowerCase())).map(row=><button disabled={busy} key={row._kind+row.id} onClick={()=>run(()=>select(row))}>{row._kind==='quote'?row.quoteNumber+' · ':''}{row.clientName||row.profile?.customer||'Untitled customer'} · {row._deleted?'Deleted':'Active'} · revision {row._revision}</button>)}</div>
  {selected&&<section className="workspace-card"><h3>{selected.clientName||selected.profile?.customer||'Selected record'}</h3>
   {selected._deleted&&<button disabled={busy} onClick={()=>run(()=>restore())}>Restore deleted record</button>}
   {history.length===0?<p>No earlier record revisions.</p>:history.map(row=><div className="workspace-history" key={row._revision}><span>Revision {row._revision} · {new Date(row._updatedAt).toLocaleString()} · {row._deleted?'Deleted':'Active'}</span><details><summary>Review saved values</summary><HistoryValues row={row}/></details><button disabled={busy||row._deleted} onClick={()=>run(()=>restore(row._revision))}>Restore revision {row._revision}</button></div>)}
   <p>Restoration creates a new revision. Previously replaced file versions require administrator recovery; this screen restores record fields only.</p>
  </section>}
 </dialog>
 </>;
}
