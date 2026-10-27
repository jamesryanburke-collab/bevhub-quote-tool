import React, { useEffect, useState } from 'react';
import { WorkspaceStore, api } from './store.js';

export default function WorkspaceGate({ children }) {
 const [loading,setLoading]=useState(true),[authenticated,setAuthenticated]=useState(false);
 const [store,setStore]=useState(null),[password,setPassword]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function signOut(){
  try { await api('logout',{method:'POST'});window.BevHubWorkspace=null;setStore(null);setAuthenticated(false);setPassword('');setMessage('Signed out.'); }
  catch(e){setMessage(e.message);}
 }
 async function openWorkspace(existing){
  const workspace=existing||new WorkspaceStore();
  await workspace.refreshQuotes();workspace.signOut=signOut;window.BevHubWorkspace=workspace;
  setStore(workspace);setAuthenticated(true);setPassword('');setMessage('');
 }
 useEffect(()=>{
  let live=true;
  (async()=>{
   try{await api('session');if(live)await openWorkspace(null);}
   catch(e){if(live&&!e.message.startsWith('Sign in'))setMessage(e.message);}
   finally{if(live)setLoading(false);}
  })();
  const expired=()=>{setAuthenticated(false);setMessage('Your session expired. Sign in again to continue. Your open drafts are kept.');};
  window.addEventListener('bevhub:session-expired',expired);
  return()=>{live=false;window.removeEventListener('bevhub:session-expired',expired);};
 },[]);
 return <>
  {loading?<main className="workspace-screen">Opening the shared workspace…</main>:!authenticated?<main className="workspace-screen">
   <h1>Bev-Hub shared workspace</h1><p>Enter the site password to open shared quotes, customers, and attachments.</p>
   <form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{
    await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});await openWorkspace(store);
   }catch(error){setMessage(error.message);}finally{setBusy(false);}}}>
    <label htmlFor="site-password">Site password</label><input id="site-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required />
    <button disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
   </form>{message&&<p role="status">{message}</p>}
  </main>:<section className="workspace-bar" aria-label="Shared workspace"><span>Shared workspace</span><button onClick={signOut}>Sign out</button>{message&&<span role="alert">{message}</span>}</section>}
  <div hidden={!authenticated||loading}>{store?children:null}</div>
 </>;
}
