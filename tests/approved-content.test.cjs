const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
// Frozen sections from reviewed preview commit bbbb053. These are deliberately unchanged by storage/auth work.
const sections=[
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
