const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('Contract ZIP stores PDF bytes and unchanged source attachment bytes',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/contracts/index.html'),'utf8');
 const functions=source.slice(source.indexOf('function crc32('),source.indexOf('async function readZipAny('));
 const original=new Uint8Array([37,80,68,70,45,49,46,52,10]);
 const context=vm.createContext({Blob,TextEncoder,Uint8Array,Set,JSON,data:{profile:{}},files:{quote:{name:'original.pdf',blob:new Blob([original])},specs:{}},selected:new Set(),excludedPages:new Set(),saveNow:async()=>{},collectPages:()=>[{key:'A1'}],buildPdf:()=>new Blob([original]),warningList:()=>[],slug:()=> 'Test',download:(name,blob)=>{context.output=blob}});
 vm.runInContext(functions,context);await vm.runInContext('downloadPackage()',context);
 const bytes=Buffer.from(await context.output.arrayBuffer()),entries=new Map();let offset=0;
 while(bytes.readUInt32LE(offset)===0x04034b50){
  const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
  const start=offset+30+nameLength+extra;entries.set(bytes.subarray(offset+30,offset+30+nameLength).toString(),bytes.subarray(start,start+size));offset=start+size;
 }
 assert.deepEqual(entries.get('Exhibits_A-D_Selected_Pages.pdf'),Buffer.from(original));
 assert.deepEqual(entries.get('Source_Documents/Exhibit_A_Approved_Quote_original.pdf'),Buffer.from(original));
});
