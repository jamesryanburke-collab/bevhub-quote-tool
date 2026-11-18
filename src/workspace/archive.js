function crc32(bytes){let c=0xFFFFFFFF;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xEDB88320:c>>>1}return(c^0xFFFFFFFF)>>>0}
export function zipParts(entries){const enc=new TextEncoder(),segments=[],catalog=[],u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];let offset=0;function add(buf){segments.push(buf);offset+=buf.length}for(const [name,raw] of entries){const path=enc.encode(name),bytes=raw instanceof Uint8Array?raw:enc.encode(String(raw)),crc=crc32(bytes),start=offset;add(new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(path.length),0,0,...path]));add(bytes);catalog.push({path,crc,len:bytes.length,start})}const centStart=offset;for(const c of catalog)add(new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...u32(c.crc),...u32(c.len),...u32(c.len),...u16(c.path.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(c.start),...c.path]));const centSize=offset-centStart;add(new Uint8Array([80,75,5,6,0,0,0,0,...u16(catalog.length),...u16(catalog.length),...u32(centSize),...u32(centStart),0,0]));return new Blob(segments,{type:'application/zip'})}
async function bytesOf(blob){return new Uint8Array(await blob.arrayBuffer())}

export async function readArchive(file){
 if(file.size>600*1024*1024)throw Error('Backup is larger than the 600 MiB browser restore limit.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer),decoder=new TextDecoder(),entries=new Map();let at=0,total=0;
 while(at+30<=bytes.length&&view.getUint32(at,true)===0x04034b50){
  const method=view.getUint16(at+8,true),flags=view.getUint16(at+6,true),crc=view.getUint32(at+14,true),size=view.getUint32(at+18,true),length=view.getUint16(at+26,true),extra=view.getUint16(at+28,true);
  const name=decoder.decode(bytes.slice(at+30,at+30+length)),start=at+30+length+extra,end=start+size;
  if(method!==0||flags!==0||end>bytes.length||size!==view.getUint32(at+22,true))throw Error('Unsupported or damaged backup ZIP. Use the original workspace backup.');
  if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(x=>!x||x==='..'||x==='.')||entries.has(name))throw Error('Unsafe or duplicate backup path.');
  const entry=bytes.slice(start,end);if(crc32(entry)!==crc)throw Error('Backup integrity check failed: '+name);
  total+=size;if(total>600*1024*1024||entries.size>20000)throw Error('Backup exceeds restore limits.');
  entries.set(name,entry);at=end;
 }
 if(!entries.size||at+4>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('Invalid backup ZIP.');
 return entries;
}
