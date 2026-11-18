const {test}=require('node:test'),assert=require('node:assert/strict');
test('Quote import requires real inputs, rejects malformed files and strips identity/totals',async()=>{
 const {parseQuoteFile,validateClient,validateQuote,validateFilename}=await import('../shared/validation.js');
 const quote={clientName:'Import sample',canSize:'16 oz',casePack:'12',annualCases:'500000',tolling:'.4',productionWeeksPerYear:'4',skuCount:'2',casesPerPallet:'100',canEndMode:'clientSupplied',trayMode:'clientSupplied',caseLabelMode:'clientSupplied',palletMode:'clientSupplied',sleeveMode:'notNeeded',cartonMode:'notNeeded',id:'other',_revision:99,status:'Approved',summary:{totalQuote:1}};
 for(const name of ['../escape.pdf','folder/file.pdf','folder\\file.pdf','x\n.pdf'])assert.throws(()=>validateFilename(name));validateFilename('Approved quote.pdf');
 const parse=q=>parseQuoteFile(JSON.stringify({format:'bevhub-quote',version:1,quote:q}));
 const draft=parse(quote);assert.equal(draft.status,'Draft');assert.equal(draft.id,undefined);assert.equal(draft._revision,undefined);assert.equal(draft.summary,undefined);assert.equal(draft.annualCases,'500000');
 for(const change of [{tolling:'NaN'},{casePack:6},{annualCases:-1},{canSize:'Unknown'},{canEndMode:'additional'},{clientName:''},{annualCases:undefined}])assert.throws(()=>parse({...quote,...change}));
 assert.throws(()=>parseQuoteFile('{invalid'));assert.throws(()=>parseQuoteFile(JSON.stringify({format:'bevhub-quote',version:2,quote})));
 assert.throws(()=>validateQuote(JSON.parse('{"__proto__":{"isAdmin":true}}')));
 assert.throws(()=>validateClient({profile:{customer:'Example'},skus:[null]}));
 assert.throws(()=>validateClient({profile:{annualCases:'abc'}}));
 assert.throws(()=>validateClient({profile:{},materials:[{name:'Cans',owner:'Random'}]}));
 validateClient({profile:{customer:'Example',annualCases:''},skus:[],materials:[],exhibitD:[]},{strict:true});
});
test('Workspace ZIP rejects corrupted data, duplicate and unsafe paths',async()=>{
 const {zipParts,readArchive}=await import('../src/workspace/archive.js');
 const good=zipParts([['BevHub_Workspace.json','{}'],['files/id',new Uint8Array([1,2,3])]]);
 assert.equal((await readArchive(good)).size,2);
 const bytes=new Uint8Array(await good.arrayBuffer());bytes[60]^=1;await assert.rejects(()=>readArchive(new Blob([bytes])));
 for(const name of ['../escape','/absolute','files/../escape','files\\escape'])await assert.rejects(()=>readArchive(zipParts([[name,'x']])));
 await assert.rejects(()=>readArchive(zipParts([['same','a'],['same','b']])));
});
