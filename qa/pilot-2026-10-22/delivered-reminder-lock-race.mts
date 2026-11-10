/** Real PG lock regression: default UI cancellation; --delete account deletion.
 * Calls actual outer ownership/repositories; a query proxy only pauses after an
 * acquired row lock to force the formerly deadlocking interleaving. No provider calls.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { DrizzleReminderRepository } from "../../src/server/db/repositories/reminder-repository";
import { DrizzleConversationRepository } from "../../src/server/db/repositories/conversation-repository";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { mutateWorkspace } from "../../src/server/db/repositories/workspace-repository";
import { DrizzleAccountControlRepository } from "../../src/server/db/repositories/account-control-repository";
import * as schema from "../../src/server/db/schema";
import { pilotLoadConfig } from "../../scripts/pilot-load-config";
const { adminUrl }=pilotLoadConfig([]),run=randomUUID().replaceAll("-","").slice(0,16),name=`tempo_reminder_lock_${run}_test`;
const proof=()=>assert.ok(/^[a-f0-9]{16}$/.test(run)&&name===`tempo_reminder_lock_${run}_test`);
const url=new URL(adminUrl);url.pathname=`/${name}`;
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--delete"),"Only the optional --delete regression case is supported");
const admin=new Pool({connectionString:adminUrl,max:1,connectionTimeoutMillis:3000,query_timeout:5000});
const pool=new Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:3000,query_timeout:10000,statement_timeout:10000});
const deletion=process.argv.includes("--delete");
const watchdog=setTimeout(()=>{process.stderr.write(JSON.stringify({passed:false,reason:"runtime_ceiling",isolatedDatabase:name})+"\n");process.exit(1);},60000);watchdog.unref();
let created=false,result;
try{
 proof();await admin.query(`CREATE DATABASE "${name}"`);created=true;
 await migrate(drizzle(pool),{migrationsFolder:"drizzle"});
 const a=await pool.connect(),b=await pool.connect();
 try{
  const user=randomUUID(),conversation=randomUUID(),source=randomUUID(),original=randomUUID(),token=randomUUID(),now=new Date();
  await a.query("insert into users(id,phone_e164) values($1,'+12025550199')",[user]);
  await a.query("insert into consent_records(user_id,status,channel,disclosure_version,terms_version,privacy_version) values($1,'granted','sms','synthetic','synthetic','synthetic')",[user]);
  await a.query("insert into conversations(id,owner_user_id,type,status,is_primary) values($1,$2,'direct','active',true)",[conversation,user]);
  await a.query("insert into conversation_messages(id,user_id,conversation_id,direction,kind,status,body,processing_token) values($1,$2,$3,'inbound','user','processing','Explicit synthetic followup',$4)",[source,user,conversation,token]);
  await a.query("insert into reminders(id,user_id,text,remind_at,timezone,status,idempotency_key,sent_at) values($1,$2,'Original sent record',$3,'America/New_York','sent',$4,$3)",[original,user,new Date(now.getTime()-3600000),randomUUID()]);
  let signalReady;const ready=new Promise(resolve=>{signalReady=resolve});let release;const hold=new Promise(resolve=>{release=resolve});let paused=false;
  const wrapQuery=(query,matched=false,locked=false)=>new Proxy(query,{get(target,key){
   if(key==="then")return(resolve,reject)=>target.then(async rows=>{if(matched&&locked&&!paused){paused=true;signalReady();await hold;}return rows;}).then(resolve,reject);
   const value=Reflect.get(target,key);if(typeof value!=="function")return value;
   return(...args)=>{const next=value.apply(target,args);return next&&typeof next==="object"?wrapQuery(next,key==="from"?args[0]===(deletion?schema.conversationMessages:schema.reminders):matched,key==="for"?args[0]==="update":locked):next;};
  }});
  const wrapDb=db=>new Proxy(db,{get(target,key){const value=Reflect.get(target,key);if(key==="transaction")return(fn,...args)=>target.transaction(tx=>fn(wrapDb(tx)),...args);if(key==="select")return(...args)=>wrapQuery(target.select(...args));return typeof value==="function"?value.bind(target):value;}});
  const database=scopedDatabase(wrapDb(drizzle(a,{schema}))),repository=new DrizzleReminderRepository(database),conversations=new DrizzleConversationRepository(database);
  const followup=conversations.withOwnership({userId:user,messageId:source,processingToken:token},()=>repository.update({userId:user,sourceMessageId:source,reminderId:original,remindAt:new Date("2027-01-12T17:00:00Z"),now}),{accountFirst:true});
  // Observe real row locks from actual repository calls, then interleave the actual UI mutation.
  await ready;
  const pid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
  const ui=deletion?new DrizzleAccountControlRepository(drizzle(b,{schema})).deleteAccount(user):mutateWorkspace(user,{action:"remove_reminder",id:original},drizzle(b,{schema}));
  const deadline=Date.now()+4000;let blocked=false;
  while(Date.now()<deadline){const row=await admin.query("select cardinality(pg_blocking_pids($1))>0 blocked",[pid]);if(row.rows[0].blocked){blocked=true;break;}await delay(20);}
  assert.ok(blocked,"UI mutation must actually wait on the competing transaction");
  release();
  const outcomes=await Promise.allSettled([followup,ui]);
  const code=error=>error?.code??error?.cause?.code??"error";
  result={concurrentAction:deletion?"account_delete":"ui_cancel",outerOwnedContext:true,twoIndependentClients:true,blockingObserved:blocked,followup:outcomes[0].status==="fulfilled"?outcomes[0].value.kind:code(outcomes[0].reason),uiCancel:outcomes[1].status==="fulfilled"?"fulfilled":code(outcomes[1].reason),deadlockObserved:outcomes.some(value=>value.status==="rejected"&&code(value.reason)==="40P01")};
 }finally{a.release();b.release();}
}finally{await pool.end();try{if(created){proof();await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}}finally{await admin.end();clearTimeout(watchdog);}}
assert.ok(result&&!result.deadlockObserved&&result.followup==="followup"&&result.uiCancel==="fulfilled","Both actual operations must finish without the former deadlock");
process.stdout.write(JSON.stringify({passed:true,...result,isolatedDatabaseRemoved:true})+"\n");
