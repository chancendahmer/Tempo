/** Read-only proof for root's fresh, synthetic browser food journey. Never use against production. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { decryptField } from "../../src/server/security/field-encryption";

async function main() {
  const fixture = JSON.parse(await readFile("qa/adaptive-followthrough/local-sign-in.json", "utf8")) as { base: string; userId: string; displayName: string };
  assert.equal(fixture.base, "http://localhost:3103");
  assert.equal(fixture.displayName, "QA Riley");
  const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1 });
  try {
    const database = await pool.query("select current_database() name");
    assert.equal(database.rows[0].name, "tempo_ui_release");
    const identity = await pool.query("select display_name, profile_instructions, proactive_opt_in from users where id = $1", [fixture.userId]);
    assert.equal(identity.rows[0]?.display_name, "QA Riley");
    assert.match(identity.rows[0]?.profile_instructions ?? "", /^Synthetic isolated QA account/);
    assert.equal(identity.rows[0]?.proactive_opt_in, false);
    const rows = await pool.query("select id, data from life_items where user_id = $1", [fixture.userId]);
    const find = (kind: string, title: string, date?: string) => rows.rows.filter(row => row.data.kind === kind && row.data.title === title && (!date || row.data.date === date));
    const meal = find("meal", "Lemon chicken grain bowl", "2026-10-22");
    assert.equal(meal.length, 1);
    assert.equal(meal[0].data.servings, 2);
    assert.equal(meal[0].data.ingredientServings, 2);
    assert.equal(find("recipe", "Lemon chicken grain bowl").length, 1);
    assert.equal(find("grocery", "Wholegrain bread")[0]?.data.quantity, 1);
    assert.equal(find("grocery", "Wholegrain bread")[0]?.data.unit, "package");
    const rice = find("grocery", "cooked brown rice");
    assert.equal(rice.length, 1);
    assert.equal(rice[0].data.quantity, 200);
    assert.equal(rice[0].data.checked, true);
    assert.equal(rice[0].data.mealSources[0].mealId, meal[0].id);
    assert.equal(find("pantry", "cooked brown rice")[0]?.data.quantity, 100);
    for (const [date, amount, calories, protein, carbs, fat] of [
      ["2026-10-22", 350, 510, 32, 55, 16],
      ["2026-10-23", 175, 255, 16, 27.5, 8],
    ] as const) {
      const food = find("food", "QA dinner portion", date);
      assert.equal(food.length, 1);
      for (const [key, value] of Object.entries({ calories, protein, carbs, fat, fiber: null })) assert.equal(food[0].data[key], value, `${date} ${key}`);
      assert.equal(food[0].data.amount, amount);
      assert.equal(food[0].data.unit, "g");
    }
    const jobs = await pool.query("select count(*)::int count from scheduled_actions where user_id = $1", [fixture.userId]);
    assert.equal(jobs.rows[0].count, 0);
    const feedback = await pool.query("select id, encrypted_detail, follow_up_consent from pilot_feedback where user_id = $1", [fixture.userId]);
    const retryDetail = "Synthetic QA retry: preserve this exact draft across a brief local database outage and save once after recovery.";
    const retried = feedback.rows.filter(row => row.encrypted_detail && decryptField(row.encrypted_detail, Buffer.alloc(32, 7).toString("base64")) === retryDetail);
    assert.equal(retried.length, 1);
    assert.equal(retried[0].id, "d681315e-0b00-4307-9da6-2bd9a72fb391");
    assert.equal(retried[0].follow_up_consent, false);
    const routine = find("routine", "QA morning start");
    assert.equal(routine.length, 1);
    assert.deepEqual(routine[0].data.steps.map((step: { title: string; completedOn: string }) => [step.title, step.completedOn]), [["Pack bag", "2026-10-22"], ["Drink water", "2026-10-22"]]);
    assert.equal(rows.rows.filter(row => row.data.kind === "focus").length, 0);
    const goal = await pool.query("select id, status from goals where user_id=$1 and title=$2", [fixture.userId, "QA prepare a portfolio"]);
    assert.equal(goal.rows.length, 1);
    assert.equal(goal.rows[0].status, "completed");
    const step = await pool.query("select status, goal_id from tasks where user_id=$1 and title=$2", [fixture.userId, "Choose two project photos"]);
    assert.deepEqual(step.rows, [{ status: "completed", goal_id: goal.rows[0].id }]);
    const plan = find("workout_plan", "QA campus walk");
    assert.equal(plan.length, 1);
    assert.equal(plan[0].data.sessions[0].minutes, 15);
    assert.equal(plan[0].data.sessions[0].exercises[1].dose, "7 minutes");
    const workout = find("workout", "QA campus walk · Walk & mobility", "2026-10-22");
    assert.equal(workout.length, 1);
    assert.equal(workout[0].data.minutes, 12);
    const scheduledWorkout = await pool.query("select status, due_at, estimated_minutes from tasks where user_id=$1 and title=$2", [fixture.userId, "QA campus walk · Walk & mobility"]);
    assert.equal(scheduledWorkout.rows.length, 1);
    assert.equal(scheduledWorkout.rows[0].status, "not_started");
    assert.equal(scheduledWorkout.rows[0].estimated_minutes, 15);
    assert.equal(scheduledWorkout.rows[0].due_at.toISOString(), "2026-10-23T21:00:00.000Z");
    const result = { checkedAt: new Date().toISOString(), environment: "isolated localhost PostgreSQL", evidence: "read-only records after root's browser actions; no provider calls", checks: ["Synthetic identity and no proactive consent", "Saved recipe and two-portion meal", "Manual grocery preserved", "One source-linked rice grocery less explicit measured stock", "Two durable diary dates with exact half-portion arithmetic and unknown fiber", "No scheduled provider jobs"] };
    result.checks.push("One encrypted feedback record matching the post-outage browser receipt, with follow-up consent off");
    result.checks.push("Routine order and both local-day completions retained; finished focus removed", "Explicit achieved goal and completed linked task", "Customized 15-minute workout plan, actual 12-minute log, separate future open task at the intended local time");
    await writeFile("qa/pilot-2026-10-22/fresh-browser/records.json", JSON.stringify(result, null, 2) + "\n");
    console.log(`PASS ${result.checks.length} browser food record groups.`);
  } finally { await pool.end(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
