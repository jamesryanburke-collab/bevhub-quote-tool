// Loopback-only integration test server. Secrets are random test fixtures, never real site credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const{fixture}=require('./cloudflare-fixture.cjs');
(async()=>{
 const{onRequest}=await import('../functions/api/[[path]].js');const f=fixture();
 fs.writeFileSync('/workspace/work/password-test-fixture.json',JSON.stringify({password:f.env.SITE_PASSWORD}),{mode:0o600});
 const root=path.resolve(__dirname,'../dist');
 http.createServer(async(req,res)=>{
  try{
   if(req.url.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers={...req.headers,'CF-Connecting-IP':'127.0.0.1'};
    const request=new Request('http://127.0.0.1:4181'+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
    const result=await onRequest({env:f.env,request});res.writeHead(result.status,Object.fromEntries(result.headers.entries()));res.end(Buffer.from(await result.arrayBuffer()));return;
   }
   const route=new URL(req.url,'http://127.0.0.1:4181').pathname;
   const file=path.resolve(root,'.'+(route==='/'?'/index.html':decodeURIComponent(route)));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}
   res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
  }catch(e){res.writeHead(500);res.end('Test server error');console.error(e.message);}
 }).listen(4181,'127.0.0.1',()=>console.log('Shared-password local test server ready on port 4181.'));
})();
