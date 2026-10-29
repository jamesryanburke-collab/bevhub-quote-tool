from playwright.sync_api import sync_playwright
import json,re,pathlib,os,socket,subprocess,tempfile,time,shutil,zipfile
import fitz
ROOT=pathlib.Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'.artifacts'/'browser'
ARTIFACTS.mkdir(parents=True,exist_ok=True)
# This runner always starts its own isolated loopback fixture; no live URL or cloud credentials.
if not (ROOT/'dist'/'index.html').exists():raise RuntimeError('Run npm run build first')
tmp=tempfile.TemporaryDirectory(prefix='bevhub-test-')
credentials=pathlib.Path(tmp.name)/'credentials.json'
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
log=(ARTIFACTS/'server.log').open('w')
server=subprocess.Popen(['node','test-support/browser-server.cjs'],cwd=ROOT,env={**os.environ,'BEVHUB_TEST_PORT':str(port),'BEVHUB_TEST_CREDENTIAL_FILE':str(credentials)},stdout=log,stderr=log)
import atexit
def cleanup():
 server.terminate()
 try:server.wait(timeout=5)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 log.close();tmp.cleanup()
atexit.register(cleanup)
for _ in range(100):
 if server.poll() is not None:raise RuntimeError('Test server failed; see .artifacts/browser/server.log')
 if credentials.exists() and 'ready on port' in (ARTIFACTS/'server.log').read_text():break
 time.sleep(.05)
else:raise RuntimeError('Test server startup timed out')
base='http://127.0.0.1:'+str(port);password=json.loads(credentials.read_text())['password']
out=ARTIFACTS
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser'),headless=True,args=['--no-sandbox']);errors=[]
 def browser():
  ctx=b.new_context(accept_downloads=True,viewport={'width':1440,'height':1000});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept('1') if d.type=='prompt' else d.accept());return ctx,page
 def sign_in(page):
  page.goto(base);page.get_by_label('Site password').fill(password);page.get_by_role('button',name='Sign in',exact=True).click();page.get_by_role('button',name='Save Quote',exact=True).wait_for()
 def field(page,label):return page.locator('label').filter(has=page.locator('span').filter(has_text=re.compile('^'+re.escape(label)+'$'))).locator('input')
 c1,a=browser();c2,z=browser();sign_in(a);sign_in(z);print('Two independent browsers signed in with the shared password',flush=True)
 field(a,'Client / Brand').fill('Shared Password Customer');a.get_by_role('button',name='Save Quote',exact=True).click();a.get_by_text('BH-001 saved to the shared workspace.',exact=True).wait_for()
 z.reload();z.get_by_role('button',name='Open',exact=True).first.click();assert field(z,'Client / Brand').input_value()=='Shared Password Customer';print('Shared quote reopened in the other browser',flush=True)
 field(a,'Client / Brand').fill('New Shared Revision');a.get_by_role('button',name='Update Saved Quote').click();a.get_by_text('BH-001 saved to the shared workspace.',exact=True).wait_for()
 field(z,'Client / Brand').fill('Stale Draft Kept');z.get_by_role('button',name='Update Saved Quote').click();z.get_by_text(re.compile('CONFLICT:')).first.wait_for();assert field(z,'Client / Brand').input_value()=='Stale Draft Kept';print('Conflicting edit blocked and draft retained',flush=True)
 a.get_by_role('button',name='Contract Exhibits A–D').click();f=a.frame_locator('iframe');f.locator('#p_customer').wait_for();f.locator('#importPricingQuote').click();assert f.locator('#p_customer').input_value()=='New Shared Revision'
 assert f.locator('#p_package').input_value()=='250 ml Slim'
 assert f.locator('#p_casePack').input_value()=='24'
 assert f.locator('#p_annualCases').input_value()=='300000'
 print('Quote import transferred customer, can size, case pack and annual volume',flush=True)
 f.locator('#p_legalName').fill('Shared Client LLC');f.locator('#saveClient').click();f.locator('#saveStatus').filter(has_text='Saved to shared workspace').wait_for()
 # Download a real generated quote PDF and upload it as the approved quote attachment.
 a.get_by_role('button',name='Tolling Calculator').click()
 with a.expect_download(timeout=60000) as dl:a.get_by_role('button',name='Download Client PDF',exact=True).click()
 dl.value.save_as(out/'quote.pdf');a.get_by_role('button',name='Contract Exhibits A–D').click();f.locator('#quoteFile').set_input_files(str(out/'quote.pdf'));a.wait_for_function("window.BevHubWorkspace.attachmentVersions.size > 0")
 z.get_by_role('button',name='Contract Exhibits A–D').click();zf=z.frame_locator('iframe');zf.locator('#p_customer').wait_for();assert zf.locator('#p_legalName').input_value()=='Shared Client LLC';zf.locator('[data-tab=a]').click();assert 'quote.pdf' in zf.locator('#editor').inner_text();print('Customer and PDF attachment shared across browsers',flush=True)
 with z.expect_download() as dl:zf.locator('#downloadZip').click()
 dl.value.save_as(out/'shared-package.zip')
 with zipfile.ZipFile(out/'shared-package.zip') as package:
  pdf=package.read('Exhibits_A-D_Selected_Pages.pdf')
  text=' '.join(pg.get_text() for pg in fitz.open(stream=pdf,filetype='pdf'))
  for title in ['EXHIBIT A','Exhibit B','EXHIBIT C','EXHIBIT D']:assert title in text,title
  source=next(n for n in package.namelist() if n.startswith('Source_Documents/Exhibit_A_Approved_Quote_'))
  assert package.read(source)==(out/'quote.pdf').read_bytes()
 print('A–D package PDF and byte-identical original quote attachment verified',flush=True)
 for exhibit,title in [('a','EXHIBIT A'),('b','Exhibit B'),('c','EXHIBIT C'),('d','EXHIBIT D')]:
  zf.locator('[data-tab='+exhibit+']').click();assert title in zf.locator('#preview').inner_text()
 with z.expect_download() as dl:zf.locator('#downloadPdf').click()
 dl.value.save_as(out/'selected-exhibits.pdf')
 assert len(fitz.open(out/'selected-exhibits.pdf'))>=4
 z.reload();z.get_by_role('button',name='Contract Exhibits A–D').click();zf=z.frame_locator('iframe');zf.locator('#p_legalName').wait_for()
 assert zf.locator('#p_legalName').input_value()=='Shared Client LLC'
 print('Saved client reopened after full page reload; all four exhibit previews and selected PDF loaded',flush=True)
 z.get_by_role('button',name='Tolling Calculator',exact=True).click()
 def choice(label):return z.locator('label').filter(has=z.locator('span').filter(has_text=re.compile('^'+re.escape(label)+'$'))).locator('select')
 detail=z.locator('div.mb-5.rounded-xl').filter(has=z.get_by_text('Material and Service Pricing',exact=True))
 for mode,status in [('additional','Additional cost'),('included','Included in tolling'),('clientSupplied','Client supplied'),('notNeeded','Not needed')]:
  for label in ['Cans + Ends','Trays','Case Labels','Pallet Materials','Sleeve Application','Carton Application']:choice(label).select_option(mode)
  text=detail.inner_text();assert text.count(status)==6,(mode,text)
  if mode in ['additional','included']:assert text.count('/ can')==6 and text.count('/ case')==6
 for label in ['Cans + Ends','Trays','Case Labels','Pallet Materials','Sleeve Application','Carton Application']:choice(label).select_option('additional')
 for pack in ['12','24']:
  choice('Case Pack').select_option(pack)
  expected=[.1681,.2544/int(pack),.011/int(pack),13.03/91/int(pack),.1,.0225]
  for cost in expected:assert '${:.4f} / can (${:.2f} / case)'.format(cost,cost*int(pack)) in detail.inner_text()
 with z.expect_download() as dl:z.get_by_role('link',name='Download Client Quote',exact=True).click()
 dl.value.save_as(out/'quote.html')
 html=(out/'quote.html').read_text()
 for group in ['Cans and Ends','Trays','Case Labels','Pallet Materials','Sleeve Application','Carton Application']:assert group in html
 for button,name in [('Download Client PDF','client.pdf'),('Download Internal PDF','internal.pdf')]:
  with z.expect_download(timeout=60000) as dl:z.get_by_role('button',name=button,exact=True).click()
  dl.value.save_as(out/name);assert len(fitz.open(out/name))>0
 print('Six material groups, all supply modes, 12/24-pack prices, quote HTML/client/internal PDFs passed',flush=True)
 anonymous,outsider=browser();outsider.goto(base);outsider.get_by_label('Site password').wait_for();assert outsider.get_by_role('button',name='Save Quote',exact=True).count()==0
 assert anonymous.request.get(base+'/api/records/quote').status==401;assert anonymous.request.get(base+'/api/files?client=unknown').status==401;print('Signed-out browser cannot read shared records or attachments',flush=True)
 a.get_by_role('button',name='Tolling Calculator').click();a.get_by_role('button',name='Sign out',exact=True).click();a.get_by_label('Site password').wait_for();assert a.evaluate("fetch('/api/session').then(r=>r.status)")==401;assert z.evaluate("fetch('/api/session').then(r=>r.status)")==200;print('Sign out revokes only that browser session',flush=True)
 assert not errors,errors;print('No uncaught browser errors',flush=True);b.close()
