import React,{useRef,useState} from 'react';
import {parseQuoteFile,validateQuote} from '../../shared/validation.js';
import {downloadFile} from './WorkspaceTools.jsx';
export default function QuoteFileTools({snapshot,onImport}){
 const picker=useRef(null),dialog=useRef(null),[quote,setQuote]=useState(null),[message,setMessage]=useState('');
 return <>
  <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" onClick={()=>{try{const quote=snapshot();validateQuote(quote,{strict:true});downloadFile('BevHub_Quote.json',new Blob([JSON.stringify({format:'bevhub-quote',version:1,quote},null,2)],{type:'application/json'}));setMessage('Quote file downloaded. It contains private client and pricing inputs.')}catch(e){setMessage(e.message)}}}>Download editable quote</button>
  <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" onClick={()=>picker.current.click()}>Import quote file</button>
  <input ref={picker} type="file" accept=".json" hidden onChange={async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>1000000)throw Error('Quote file must be smaller than 1 MB.');const q=parseQuoteFile(await file.text());setQuote(q);setMessage('');dialog.current.showModal()}catch(error){setMessage(error.message)}}}/>
  {message&&<p role="status" className="text-sm">{message}</p>}
  <dialog ref={dialog} aria-labelledby="quote-file-title" className="workspace-dialog"><h2 id="quote-file-title">Review imported quote</h2>{quote&&<><p>{quote.clientName} · {quote.canSize} · {quote.casePack} pack</p><p>Program: {quote.pricingProgram||'annual'} · {quote.pricingProgram==='flex'?quote.campaignCans+' campaign cans':quote.pricingProgram==='trial'?quote.trialExpectedCans+' trial cans':quote.annualCases+' annual cases'}</p><p>This loads a new, unsaved draft. The calculator recalculates prices from these inputs using its existing formulas. Review all input costs and the calculated total, then choose Save Quote. Imported totals and approval status are ignored.</p><button onClick={()=>{if(onImport(quote)!==false){dialog.current.close();setMessage('Imported as a new draft. Review the recalculated pricing and save when ready.')}}}>Load draft for review</button></>}<button onClick={()=>dialog.current.close()}>Cancel import</button></dialog>
 </>;
}
