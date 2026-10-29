const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
// Approved preview sections: pricing/PDF from bbbb053 and matching display/CSS sections
// verified again during the df32c866 release review. Never regenerate hashes to hide a change.
const sections=[
  {
    "file": "public/contracts/index.html",
    "start": "<style>",
    "end": "</style>",
    "sha": "67c8c83db960f6bb8121e89e1614d24b1e4879edfdfca8dfb6357b741155d3d5"
  },
  {
    "file": "public/contracts/index.html",
    "start": "if(tab==='a'){main=",
    "end": "el.innerHTML=main+footer}",
    "sha": "b5b728a1f4ab8759a7ffc474a80ea0340b43faafd3083cf7ffe4ef37f2e37a3f"
  },
  {
    "file": "src/App.jsx",
    "start": "const MATERIAL_DEFAULTS =",
    "end": "function toNumber(",
    "sha": "e9fe79682e7d70ae80813eedb8e61049b3150142485083383b2ccb89d387a89d"
  },
  {
    "file": "src/App.jsx",
    "start": "  const selectedMaterialDefaults =",
    "end": "  // Additional-cost materials only;",
    "sha": "6cfb50c1e8778a8e5e560c671b78679983aca13f340edd9613ea346fa661b78e"
  },
  {
    "file": "src/App.jsx",
    "start": "function calculateQuote(",
    "end": "function runTests(",
    "sha": "fcbc2b6ba31b0376e1115c905d42b3faa83c7b789b59857978340cde4b1b262e"
  },
  {
    "file": "src/App.jsx",
    "start": "  const programPricing = useMemo(",
    "end": "  const quoteHeaderHtml =",
    "sha": "634ab485ac42da69871513c6a958d10d9ac89923e55758b2b3ef47002e26cedf"
  },
  {
    "file": "public/contracts/index.html",
    "start": "function makeDoc(",
    "end": "function collectPages(",
    "sha": "3d49620463de51dbd1e3d6f38a4af0608fc593f6db37a7c6d77cc8232405438a"
  }
];
for(const section of sections)test('Preserve approved section: '+section.start,()=>{
 const source=fs.readFileSync(path.join(__dirname,'..',section.file),'utf8');
 const slice=source.slice(source.indexOf(section.start),source.indexOf(section.end));
 assert.equal(createHash('sha256').update(slice).digest('hex'),section.sha);
});
