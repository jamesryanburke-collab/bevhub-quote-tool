from playwright.sync_api import expect
from pathlib import Path
import json,re,zipfile,hashlib

def run(browser,base,password,out):
 ctx=browser.new_context(accept_downloads=True,viewport={'width':1440,'height':1000});p=ctx.new_page();errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 dismiss={'value':False}
 p.on('dialog',lambda d:d.dismiss() if dismiss['value'] else d.accept() if d.type!='prompt' else d.accept('CLEAR'))
 def sign_in():
  p.get_by_label('Site password').fill(password);p.get_by_role('button',name='Sign in',exact=True).click();p.get_by_role('button',name=re.compile('^(Save Quote|Update Saved Quote)$')).wait_for()
 def field(label):return p.locator('label').filter(has=p.locator('span').filter(has_text=re.compile('^'+re.escape(label)+'$'))).locator('input')
 def request(route,method='GET',body=None,revision=None):
  return p.evaluate('''async args=>{const r=await fetch('/api/'+args.route,{method:args.method,headers:{'Content-Type':'application/json',...(args.revision?{'If-Match':String(args.revision)}:{})},...(args.body===null?{}:{body:JSON.stringify(args.body)})});return {status:r.status,body:await r.json()}}''',{'route':route,'method':method,'body':body,'revision':revision})
 p.goto(base);sign_in();p.get_by_role('button',name='Open',exact=True).first.click()
 field('Client / Brand').fill('Unsaved draft retained')
 dismiss['value']=True
 p.get_by_role('button',name='New Quote',exact=True).click();assert field('Client / Brand').input_value()=='Unsaved draft retained'
 assert p.get_by_text('Unsaved changes',exact=True).is_visible()
 dismiss['value']=False
 with p.expect_download() as dl:p.get_by_role('button',name='Download editable quote').click()
 dl.value.save_as(out/'editable-quote.json');quote=json.loads((out/'editable-quote.json').read_text())
 quote['quote'].update({'clientName':'Imported Review Customer','canSize':'16 oz','casePack':'12','annualCases':'12345','summary':{'totalQuote':1},'id':'untrusted','_revision':999,'status':'Approved'})
 path=out/'import-quote.json';path.write_text(json.dumps(quote))
 p.locator('input[type=file][accept=".json"]').set_input_files(str(path));dialog=p.get_by_role('dialog');dialog.get_by_text('Review imported quote').wait_for();dialog.get_by_role('button',name='Load draft for review').click()
 assert field('Client / Brand').input_value()=='Imported Review Customer';assert p.get_by_text('Unsaved changes',exact=True).is_visible()
 p.get_by_role('button',name='Save Quote',exact=True).click();p.get_by_text(re.compile('BH-002 saved')).wait_for()
 imported=next(q for q in request('records/quote')['body'] if q['clientName']=='Imported Review Customer');assert imported['id']!='untrusted';assert imported['status']=='Draft';assert imported['summary']['totalQuote']!=1
 # A status change by this user must not invalidate their open draft.
 row=p.locator('tr').filter(has_text='Imported Review Customer');row.locator('select').select_option('Sent');p.get_by_text(re.compile('BH-002 status saved')).wait_for()
 field('Client / Brand').fill('Imported Review Updated');p.get_by_role('button',name='Update Saved Quote').click();p.get_by_text(re.compile('BH-002 saved')).wait_for()
 # Interrupted network response must retain the edited draft.
 p.route('**/api/records/quote/*',lambda route:route.fulfill(status=500,content_type='application/json',body='{"error":"Synthetic save interruption"}') if route.request.method=='PUT' else route.continue_())
 field('Client / Brand').fill('Interrupted draft kept');p.get_by_role('button',name='Update Saved Quote').click();p.get_by_text(re.compile('Synthetic save interruption')).wait_for();assert field('Client / Brand').input_value()=='Interrupted draft kept';p.unroute('**/api/records/quote/*')
 # Expiration hides the app, then reauthentication resumes the same draft.
 request('logout','POST',{});p.evaluate('window.BevHubWorkspace.refreshQuotes().catch(()=>{})');p.get_by_label('Site password').wait_for();sign_in();assert field('Client / Brand').input_value()=='Interrupted draft kept'
 field('Client / Brand').fill('Imported Review Updated');p.get_by_role('button',name='Update Saved Quote').click();p.get_by_text(re.compile('BH-002 saved')).wait_for()
 print('Unsaved protection, editable quote import, recalculation, own status changes, interrupted saves and session resume passed',flush=True)
 bad=out/'invalid-quote.json';bad.write_text(json.dumps({'format':'bevhub-quote','version':1,'quote':{'clientName':'Bad','casePack':6}}));p.locator('input[type=file][accept=".json"]').set_input_files(str(bad));p.get_by_text('Case pack must be 12 or 24.',exact=True).wait_for();assert field('Client / Brand').input_value()=='Imported Review Updated'
 p.get_by_role('button',name='Contract Exhibits A–D').click();f=p.frame_locator('iframe');f.locator('#p_customer').wait_for();f.locator('[data-tab=a]').click()
 # Do not display a failed upload as saved or replace the prior attachment.
 failed=out/'failure.pdf';failed.write_bytes((out/'quote.pdf').read_bytes())
 p.route('**/api/files?**',lambda route:route.fulfill(status=500,content_type='application/json',body='{"error":"Synthetic upload failure"}') if route.request.method=='POST' else route.continue_())
 f.locator('#quoteFile').set_input_files(str(failed));f.locator('#saveStatus').filter(has_text='Attachment not saved').wait_for();assert 'failure.pdf' not in f.locator('#editor').inner_text();assert 'quote.pdf' in f.locator('#editor').inner_text();p.unroute('**/api/files?**')
 # Hold a real upload pending while attempting to switch client; switching must be refused.
 pending=[]
 p.route('**/api/files?**',lambda route:pending.append(route) if route.request.method=='POST' else route.continue_())
 f.locator('#quoteFile').set_input_files(str(out/'quote.pdf'))
 p.wait_for_function("document.querySelector('iframe').contentDocument.getElementById('saveStatus').textContent.includes('Uploading')")
 f.locator('[data-tab=clients]').click();f.locator('#newClient').click();f.locator('#saveStatus').filter(has_text='Wait for the attachment').wait_for()
 for _ in range(100):
  if pending:break
  p.wait_for_timeout(20)
 assert pending;pending[0].continue_();f.locator('#saveStatus').filter(has_text='Attachments saved').wait_for();p.unroute('**/api/files?**')
 print('Failed attachments remain visibly unsaved; client switching during upload is blocked',flush=True)
 p.get_by_role('button',name='Backup & recovery').click();tools=p.get_by_role('dialog');tools.get_by_text(re.compile('Attachment storage:')).wait_for()
 with p.expect_download() as dl:tools.get_by_role('button',name='Download workspace backup',exact=True).click()
 dl.value.save_as(out/'workspace.zip')
 with zipfile.ZipFile(out/'workspace.zip') as archive:
  manifest=json.loads(archive.read('BevHub_Workspace.json'));assert 'sessions' not in manifest and 'login_attempts' not in manifest
  for meta in manifest['files']:assert hashlib.sha256(archive.read('files/'+meta['object_id'])).hexdigest()==manifest['checksums'][meta['object_id']]
 before=len(request('records/quote')['body']);tools.locator('input[type=file]').set_input_files(str(out/'workspace.zip'));tools.get_by_text('Review backup import',exact=True).wait_for();tools.get_by_role('button',name='Confirm import as copies').click();tools.get_by_text(re.compile('records copied')).wait_for()
 assert len(request('records/quote')['body'])==before*2
 # Reimporting the exact same backup resumes/skips existing copies, without duplicates.
 tools.locator('input[type=file]').set_input_files(str(out/'workspace.zip'));tools.get_by_text('Review backup import',exact=True).wait_for();tools.get_by_role('button',name='Confirm import as copies').click();tools.get_by_text(re.compile('0 records copied')).wait_for()
 assert len(request('records/quote')['body'])==before*2
 # Recover a deleted quote in place, preserving its number and recording a new revision.
 original=next(q for q in request('records/quote')['body'] if q['id']==imported['id']);request('records/quote/'+original['id'],'DELETE',revision=original['_revision'])
 tools.get_by_role('button',name='Refresh recovery list').click();tools.locator('.workspace-records button').filter(has_text='BH-002').click();tools.get_by_role('button',name='Restore deleted record',exact=True).click();tools.get_by_text(re.compile('Record restored')).wait_for()
 restored=next(q for q in request('records/quote')['body'] if q['id']==original['id']);assert restored['quoteNumber']=='BH-002';assert restored['_revision']>original['_revision']
 tools.screenshot(path=str(out/'recovery-screen.png'));tools.get_by_role('button',name='Close',exact=True).click()
 print('Workspace backup checksums, import as copies and deleted-record recovery passed',flush=True)
 # Multiple quotes now use searchable selection and display stale links.
 f.locator('#importPricingQuote').click();f.locator('#quoteSearch').fill('Imported Review Updated');f.locator('#quoteChoices button').first.click();expect(f.locator('#p_customer')).to_have_value('Imported Review Updated');assert f.locator('#p_casePack').input_value()=='12';assert f.locator('#p_annualCases').input_value()=='12345'
 latest=next(q for q in request('records/quote')['body'] if q['id']==original['id']);request('records/quote/'+latest['id'],'PUT',{**latest,'customTerms':'Synthetic revision check'},latest['_revision']);p.evaluate('window.BevHubWorkspace.refreshQuotes()');f.locator('[data-tab=b]').click();assert 'has changed since import' in f.locator('#editor').inner_text()
 p.get_by_role('button',name='Tolling Calculator',exact=True).click();p.set_viewport_size({'width':390,'height':844});assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Mobile calculator overflow'
 p.get_by_role('button',name='Import quote file',exact=True).focus();assert p.get_by_role('button',name='Import quote file',exact=True).evaluate('(e)=>document.activeElement===e')
 p.screenshot(path=str(out/'mobile-screen.png'),full_page=True)
 assert not errors,errors;ctx.close();print('Searchable quote picker, stale link warning, mobile layout and keyboard focus passed',flush=True)
