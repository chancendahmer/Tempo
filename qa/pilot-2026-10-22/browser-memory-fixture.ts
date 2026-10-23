/** Explicit synthetic fixture for UI deletion only; not evidence of live AI extraction. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";

async function main() {
  const mode = process.argv[2];
  assert.ok(mode === "seed" || mode === "verify");
  const fixture = JSON.parse(await readFile("qa/adaptive-followthrough/local-sign-in.json", "utf8"));
  assert.equal(fixture.base, "http://localhost:3103");
  assert.equal(fixture.displayName, "QA Riley");
  for (const name of Object.keys(process.env)) if (name.startsWith("PG")) delete process.env[name];
  process.env.PGPASSFILE = "NUL";
  const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1 });
  try {
    const identity = await pool.query("select display_name, profile_instructions from users where id=$1", [fixture.userId]);
    assert.equal(identity.rows[0]?.display_name, "QA Riley");
    assert.match(identity.rows[0]?.profile_instructions ?? "", /^Synthetic isolated QA account/);
    const content = "QA fixture: I prefer quiet study spaces in the morning.";
    if (mode === "seed") {
      await pool.query("insert into memory_entries(user_id,category,content) select $1,'preference',$2 where not exists(select 1 from memory_entries where user_id=$1 and content=$2)", [fixture.userId, content]);
      const history = await pool.query("select id, body from conversation_messages where user_id=$1 order by id", [fixture.userId]);
      await writeFile("qa/pilot-2026-10-22/fresh-browser/memory-baseline.json", JSON.stringify({ userId: fixture.userId, history: history.rows }) + "\n");
      console.log("Seeded one labeled synthetic memory; no AI call or provider action.");
      return;
    }
    const memory = await pool.query("select deleted_at from memory_entries where user_id=$1 and content=$2", [fixture.userId, content]);
    assert.equal(memory.rows.length, 1);
    assert.ok(memory.rows[0].deleted_at);
    const baseline = JSON.parse(await readFile("qa/pilot-2026-10-22/fresh-browser/memory-baseline.json", "utf8"));
    assert.equal(baseline.userId, fixture.userId);
    const history = await pool.query("select id, body from conversation_messages where user_id=$1 order by id", [fixture.userId]);
    for (const old of baseline.history) assert.deepEqual(history.rows.find(row => row.id === old.id), old);
    console.log("PASS: UI removed the synthetic memory; prior conversation records are unchanged.");
  } finally { await pool.end(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
