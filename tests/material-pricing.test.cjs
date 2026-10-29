const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const {test}=require('node:test');
test('Approved six built-in checks and 32 independent material/pack scenarios',()=>{
const preview=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
const src=preview.slice(preview.indexOf('const DEFAULT_WEEKLY'),preview.indexOf('function BevHubPricingApp'));
const ctx=vm.createContext({Intl,console});vm.runInContext(src+';globalThis.calc=calculateQuote;globalThis.tests=runTests();',ctx);
console.log(JSON.stringify(ctx.tests));assert(ctx.tests.every(t=>t.pass));
const base={annualCases:300000,productionWeeksPerYear:2,skuCount:2,casePack:24,canSize:'250 ml Slim',tolling:.40045,casesPerPallet:91,canEndCostPerCan:.1681,trayCostPerCase:.2544,caseLabelCostPerCase:.011,palletMaterialCostPerPallet:13.03,sleeveCostPerCan:.1,cartonCostPerCan:.0225};
let cases=0;for(const pack of [12,24])for(const size of ['12 oz Sleek','250 ml Slim','7.5 oz','16 oz'])for(const mode of ['clientSupplied','additional','included','notNeeded']){const i={...base,casePack:pack,canSize:size};for(const k of ['canEnd','tray','caseLabel','pallet','sleeve','carton'])i[k+'Mode']=mode;const r=ctx.calc(i),u=.1681+.2544/pack+.011/pack+13.03/91/pack+.1+.0225;assert(Math.abs(r.pricePerCan-(.40045+(['additional','included'].includes(mode)?u:0)))<1e-12);assert.equal(r.pricePerCase,r.pricePerCan*pack);cases++;}console.log(cases+' independent pricing scenarios passed');

});
