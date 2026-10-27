const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const path=require('node:path');
const {test}=require('node:test');
const s=fs.readFileSync(path.join(__dirname,'../public/contracts/index.html'),'utf8');
test('quote imports transfer annual volume and require an explicit nonannual volume choice',()=>{
const fn=s.slice(s.indexOf('function importPricingQuote('),s.indexOf("window.addEventListener('message'"));
let count=0;
for(const program of ['annual',undefined,'flex','trial'])for(const action of ['CLEAR','RETAIN',null,'invalid']){
 const quote={id:'new',clientName:'New Customer',canSize:'16 oz',casePack:'12',annualCases:'12345',pricingProgram:program};
 const data={profile:{customer:'Old Customer',annualCases:'250000',legalName:'Old LLC',facility:'MHK'},linkedQuoteKey:'old'};
 const ctx=vm.createContext({data,library:{},activeId:'c1',quoteCandidates:()=>[quote],confirm:()=>true,prompt:()=>action,alert:()=>{},saveNow:()=>Promise.resolve(),render:()=>{},setStatus:()=>{},tab:'profile'});
 vm.runInContext(fn+';globalThis.result=importPricingQuote()',ctx);
 const annual=program==='annual'||program===undefined;
 if(!annual&&(action===null||action==='invalid')){assert.equal(ctx.result,false);assert.equal(data.profile.customer,'Old Customer');assert.equal(data.profile.annualCases,'250000');}
 else{assert.equal(ctx.result,true);assert.equal(data.profile.customer,'New Customer');assert.equal(data.profile.annualCases,annual?'12345':action==='CLEAR'?'':'250000');}
 assert.equal(data.profile.legalName,'Old LLC');assert.equal(data.profile.facility,'MHK');count++;
}
for(const program of ['flex','trial']){
 const data={profile:{customer:'',annualCases:''}};
 const ctx=vm.createContext({data,library:{},activeId:'c1',quoteCandidates:()=>[{id:'q',clientName:'Blank import',pricingProgram:program}],prompt:()=>{throw Error('Unexpected prompt')},confirm:()=>{throw Error('Unexpected confirm')},saveNow:()=>Promise.resolve(),render:()=>{},setStatus:()=>{}});
 vm.runInContext(fn+';globalThis.result=importPricingQuote(true)',ctx);assert.equal(ctx.result,true);assert.equal(data.profile.annualCases,'');count++;
}
assert.equal(count,18);
});
