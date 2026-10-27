const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(__dirname,'../migrations/001_shared_password.sql'),'utf8'));
 const DB={prepare(text){return{bind(...values){return{
  async first(){return sql.prepare(text).get(...values)||null;},async all(){return{results:sql.prepare(text).all(...values)};},async run(){return sql.prepare(text).run(...values);}
 };}};},async batch(items){sql.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const objects=new Map();
 const FILES={async put(key,bytes){objects.set(key,new Uint8Array(bytes));},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}};
 return{sql,objects,env:{DB,FILES,SITE_PASSWORD:randomBytes(24).toString('base64url'),SESSION_SECRET:randomBytes(48).toString('base64url')}};
}
module.exports={fixture};

