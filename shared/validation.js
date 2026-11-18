// Shared validation for browser imports and Pages Functions. Never changes pricing math.
export const QUOTE_FIELDS = ['annualCases','productionWeeksPerYear','skuCount','casePack','tolling','casesPerPallet','canEndCostPerCan','trayCostPerCase','caseLabelCostPerCase','palletMaterialCostPerPallet','sleeveCostPerCan','cartonCostPerCan','weeklyOutput12Pack','weeklyOutput24Pack','lowWeeklyOH','highWeeklyOH','cogsBuffer','campaignCans','minDayRevenueTarget','flexPremiumPerCan','trialFacilityRate','trialExpectedCans','trialDaysReserved'];
const modes=['clientSupplied','additional','included','notNeeded'];
const modeFields=['canEndMode','trayMode','caseLabelMode','palletMode','sleeveMode','cartonMode'];
const sizes=['12 oz Sleek','250 ml Slim','7.5 oz','16 oz'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(message){throw Error(message)}
function safeTree(x,depth=0){
 if(depth>12)fail('File nesting is too deep.');
 if(typeof x==='string'&&x.length>100000)fail('A text field is too long.');
 if(typeof x==='number'&&!Number.isFinite(x))fail('Numbers must be finite.');
 if(x&&typeof x==='object')for(const [key,value] of Object.entries(x)){
  if(['__proto__','prototype','constructor'].includes(key))fail('Unsupported field name.');safeTree(value,depth+1);
 }
}
function number(value,label,{positive=false}={}){
 if(!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1e12||(positive&&Number(value)<=0))fail(label+' must be a '+(positive?'positive':'nonnegative')+' number.');
}
function text(value,label,max=10000){if(typeof value!=='string'||value.length>max)fail(label+' must be text of at most '+max+' characters.')}
export function validateQuote(q,{strict=false}={}){
 if(!object(q))fail('Quote must be an object.');safeTree(q);
 if(q.clientName!==undefined)text(q.clientName,'Customer name',500);
 if(q.canSize!==undefined&&!sizes.includes(q.canSize))fail('Unsupported can size.');
 if(q.pricingProgram!==undefined&&!['annual','flex','trial'].includes(q.pricingProgram))fail('Unsupported pricing program.');
 if(q.status!==undefined&&!['Draft','Sent','Approved','Declined','Expired','Archived'].includes(q.status))fail('Unsupported quote status.');
 for(const key of QUOTE_FIELDS)if(q[key]!==undefined)number(q[key],key,{positive:['casePack','productionWeeksPerYear','skuCount','casesPerPallet','weeklyOutput12Pack','weeklyOutput24Pack','lowWeeklyOH','highWeeklyOH','trialDaysReserved'].includes(key)});
 if(q.casePack!==undefined&&![12,24].includes(Number(q.casePack)))fail('Case pack must be 12 or 24.');
 for(const key of modeFields)if(q[key]!==undefined&&!modes.includes(q[key]))fail('Unsupported material supply mode.');
 if(q.customTerms!==undefined)text(q.customTerms,'Custom terms');
 if(q.quoteDisplay!==undefined&&(!object(q.quoteDisplay)||Object.values(q.quoteDisplay).some(v=>typeof v!=='boolean')))fail('Quote display options must be true or false.');
 if(strict){
  if(!q.clientName?.trim())fail('Customer name is required.');
  for(const key of ['canSize','casePack','tolling','productionWeeksPerYear','skuCount','casesPerPallet',...modeFields])if(q[key]===undefined)fail('Missing quote input: '+key);
  const program=q.pricingProgram||'annual';
  for(const key of program==='annual'?['annualCases']:program==='flex'?['campaignCans','minDayRevenueTarget','flexPremiumPerCan']:['trialExpectedCans','trialFacilityRate','trialDaysReserved'])if(q[key]===undefined)fail('Missing quote input: '+key);
  const costs=['canEndCostPerCan','trayCostPerCase','caseLabelCostPerCase','palletMaterialCostPerPallet','sleeveCostPerCan','cartonCostPerCan'];
  modeFields.forEach((key,i)=>{if(['additional','included'].includes(q[key])&&q[costs[i]]===undefined)fail('Missing supplied-material price: '+costs[i])});
 }
 return q;
}
export function validateClient(c,{strict=false}={}){
 if(!object(c)||!object(c.profile))fail('Customer profile is required.');safeTree(c);
 for(const [key,value] of Object.entries(c.profile)){
  if(['annualCases','casePack','term'].includes(key)){if(value!==''&&value!==undefined)number(value,key)}
  else text(value,key);
 }
 for(const key of ['skus','materials','exhibitD']){
  if(c[key]===undefined&&!strict)continue;
  if(!Array.isArray(c[key])||c[key].length>1000||c[key].some(v=>!object(v)))fail(key+' must be a list with at most 1000 entries.');
 }
 for(const s of c.skus||[])for(const key of ['name','sku','can','end','fill'])if(s[key]!==undefined)text(s[key],key);
 for(const m of c.materials||[]){text(m.name,'Material name');if(m.included!==undefined&&typeof m.included!=='boolean')fail('Material inclusion must be true or false.');if(m.owner!==undefined&&!['','Customer','Bev-Hub','N/A'].includes(m.owner))fail('Unsupported material owner.');if(m.notes!==undefined)text(m.notes,'Material notes')}
 for(const d of c.exhibitD||[])for(const key of ['heading','text'])if(d[key]!==undefined)text(d[key],'Exhibit D '+key);
 for(const key of ['bTerms','bSpecsNotice'])if(c[key]!==undefined)text(c[key],key);
 return c;
}
export function validateRecord(kind,value,options){return kind==='quote'?validateQuote(value,options):kind==='client'?validateClient(value,options):fail('Unsupported record type.')}
export function parseQuoteFile(text){
 if(text.length>1000000)fail('Quote file must be smaller than 1 MB.');
 let doc;try{doc=JSON.parse(text)}catch{fail('This is not a valid JSON quote file.')}
 if(doc?.format!=='bevhub-quote'||doc.version!==1)fail('Unsupported quote file. Use a Bev-Hub quote file, version 1.');
 validateQuote(doc.quote,{strict:true});
 // Never import calculated totals, shared identity, approval status or concurrency tokens.
 const {_revision,id,quoteNumber,summary,status,createdAt,updatedAt,...inputs}=doc.quote;
 return {...inputs,status:'Draft'};
}
