import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("backfills delivered web replies and treats legacy unacknowledged SMS as ambiguous", async () => {
  const client = new PGlite();
  try {
    const migrations = (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
    const apply = async (name: string) => client.exec((await readFile(resolve("drizzle", name), "utf8")).replaceAll("--> statement-breakpoint", ""));
    for (const name of migrations.filter(name => name < "0024")) await apply(name);
    const user = randomUUID(), conversation = randomUUID(), inbound = randomUUID(), reply = randomUUID(), uncertain = randomUUID();
    await client.query("insert into users(id,phone_e164) values ($1,'+12025557891')", [user]);
    await client.query("insert into conversations(id,owner_user_id,type,status,is_primary) values ($1,$2,'direct','active',true)", [conversation, user]);
    await client.query("insert into conversation_messages(id,user_id,conversation_id,direction,kind,status,body) values ($1,$2,$3,'inbound','user','processing','Original request')", [inbound, user, conversation]);
    await client.query("insert into conversation_messages(id,user_id,conversation_id,direction,kind,status,body,idempotency_key) values ($1,$2,$3,'outbound','coach','delivered','Original web reply',$4)", [reply, user, conversation, `reply:${inbound}`]);
    await client.query("insert into conversation_messages(id,user_id,conversation_id,direction,kind,status,body) values ($1,$2,$3,'outbound','coach','queued','Unknown provider outcome')", [uncertain, user, conversation]);
    await apply("0024_daily_beta_reliability.sql");
    const rows = await client.query<{ id: string; outbound_state: string; reply_body: string }>("select id,outbound_state,reply_body from conversation_messages");
    expect(rows.rows.find(row => row.id === inbound)?.reply_body).toBe("Original web reply");
    expect(rows.rows.find(row => row.id === reply)?.outbound_state).toBe("accepted");
    expect(rows.rows.find(row => row.id === uncertain)?.outbound_state).toBe("ambiguous");
    const relations = await client.query<{ source_message_id: string; target_message_id: string }>("select source_message_id,target_message_id from message_relations");
    expect(relations.rows).toEqual([{ source_message_id: reply, target_message_id: inbound }]);
  } finally { await client.close(); }
});

it("completes only proven handled ingress, retaining unknown and worker-owned requests", async () => {
  const client = new PGlite();
  try {
    const apply = async (name: string) => client.exec((await readFile(resolve("drizzle", name), "utf8")).replaceAll("--> statement-breakpoint", ""));
    for (const name of (await readdir(resolve("drizzle"))).filter(name=>/^\d+.*\.sql$/.test(name) && name < "0027").sort()) await apply(name);
    const user=randomUUID(), other=randomUUID(), conversation=randomUUID();
    await client.query("insert into users(id,phone_e164) values ($1,'+12025557892'),($2,'+12025557893')",[user,other]);
    await client.query("insert into conversations(id,owner_user_id,type,status,is_primary) values ($1,$2,'direct','active',true)",[conversation,user]);
    const ids = Array.from({length:6},()=>randomUUID());
    for (let n=0;n<6;n++) await client.query("insert into conversation_messages(id,user_id,conversation_id,direction,kind,status,body,provider,provider_message_sid) values ($1,$2,$3,'inbound','compliance','received','Fixture','sendblue',$4)",[ids[n],user,conversation,"fixture-"+n]);
    for (const n of [0,1]) await client.query("insert into scheduled_actions(user_id,kind,idempotency_key,run_at,payload) values ($1,'send_compliance',$2,now(),'{}')",[user,"help:sendblue:fixture-"+n]);
    await client.query("insert into scheduled_actions(user_id,kind,idempotency_key,run_at,payload) values ($1,'process_inbound_message','pending-fixture',now(),$2)",[user,JSON.stringify({messageId:ids[1]})]);
    await client.query("insert into scheduled_actions(user_id,kind,idempotency_key,run_at,payload) values ($1,'send_compliance','help:sendblue:fixture-3',now(),'{}')",[other]);
    for (const n of [4,5]) await client.query("insert into consent_records(user_id,status,channel,disclosure_version,terms_version,privacy_version,evidence) values ($1,'granted','sms','test','test','test',$2)",[n===4 ? user : other,JSON.stringify({provider:"sendblue",providerMessageId:"fixture-"+n})]);
    await apply("0027_complete_handled_ingress.sql");
    await apply("0027_complete_handled_ingress.sql");
    const rows = await client.query<{id:string;status:string}>("select id,status from conversation_messages");
    expect(ids.map(id=>rows.rows.find(row=>row.id===id)?.status)).toEqual(["processed","received","received","received","processed","received"]);
  } finally { await client.close(); }
});
