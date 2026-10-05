import { loadEnvConfig } from "@next/env";
import { mkdir, open, unlink, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Runtime credential loading only. Never log environment values or provider errors.
loadEnvConfig(process.env.TEMPO_TEST_ENV_DIR ?? process.cwd(), false, { info() {}, error() {} });
process.env.ASSISTANT_WEB_SEARCH_ENABLED = "false";
const folder = resolve("qa/daily-beta-live");
const ledgerPath = resolve(folder, "cost.json");
const transcriptPath = resolve(folder, process.argv.includes("--meal-only") ? "meal-transcript.json" : process.argv.includes("--workspace-only") ? "workspace-transcript.json" : process.argv.includes("--briefing-only") ? "briefing-transcript.json" : process.argv.includes("--focused") ? "focused-transcript.json" : "transcript.json");
const lockPath = resolve(folder, "run.lock");
let ownsLock = false;
const cap = 5;
let committed = 0, spent = 0, stopped = false, call = 0;
const ledger: object[] = [];
const originalFetch = globalThis.fetch;
const saveBudget = () => writeFile(ledgerPath, JSON.stringify({ cap, committed, spent, stopped, ledger }, null, 2));

async function main() {
  await mkdir(folder, { recursive: true });
  const lock = await open(lockPath, "wx"); ownsLock = true; await lock.close();
  try { const prior = JSON.parse(await readFile(ledgerPath, "utf8")); committed = prior.committed; spent = prior.spent; ledger.push(...prior.ledger); call = prior.ledger.length; if (prior.cap !== cap || !Number.isFinite(committed)) throw Error("Invalid budget"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_MODEL !== "claude-sonnet-4-6") throw Error("Expected configured model");
  globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init), url = new URL(request.url);
    if (url.origin !== "https://api.anthropic.com" || url.pathname !== "/v1/messages" || request.method !== "POST" || stopped) throw Error("QA request blocked");
    const body = await request.clone().json();
    if (body.model !== "claude-sonnet-4-6" || body.stream || body.thinking || body.speed || body.tools?.some((tool: {type?: string}) => tool.type) || JSON.stringify(body).includes('"cache_control"') || body.max_tokens > 5000) throw Error("Unpriced option");
    const countBody = Object.fromEntries(["model", "system", "messages", "tools", "tool_choice"].filter(key => key in body).map(key => [key, body[key]]));
    const count = await originalFetch("https://api.anthropic.com/v1/messages/count_tokens", { method: "POST", headers: request.headers, body: JSON.stringify(countBody), signal: AbortSignal.timeout(12000) });
    if (!count.ok) { stopped = true; throw Error("Token preflight failed"); }
    const counted = await count.json();
    if (!Number.isFinite(counted.input_tokens)) throw Error("Missing token count");
    const reserved = ((Math.ceil(counted.input_tokens * 1.2) + 1024) * 3 + body.max_tokens * 15) / 1e6;
    if (committed + reserved > cap) { stopped = true; throw Error("QA spending cap reached"); }
    committed += reserved; call += 1; await saveBudget();
    const response = await originalFetch(request);
    const result = await response.clone().json();
    if (response.ok && result.usage) {
      const usage = result.usage;
      if (usage.cache_creation_input_tokens || usage.cache_read_input_tokens || usage.server_tool_use?.web_search_requests) { stopped = true; throw Error("Unexpected capability"); }
      const actual = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1e6;
      if (!Number.isFinite(actual)) throw Error("Missing usage");
      spent += actual; committed += actual - reserved;
      ledger.push({ call, status: response.status, input: usage.input_tokens, output: usage.output_tokens, actual });
      if (actual > reserved) stopped = true;
    } else { stopped = true; ledger.push({ call, status: response.status, reserved }); }
    await saveBudget();
    return response;
  };
  const { AnthropicTaskIntentParser } = await import("../src/server/adapters/llm/task-intent-parser");
  const { createAssistantSimulator } = await import("./lib/assistant-simulator");
  const { workspaceJourney } = await import("./lib/workspace-journey");
  const { workspaceProductState, evaluateWorkspaceChange } = await import("./lib/workspace-evaluation");
  const { mutateWorkspace } = await import("../src/server/db/repositories/workspace-repository");
  const { randomUUID } = await import("node:crypto");
  const sim = await createAssistantSimulator(new AnthropicTaskIntentParser());
  const records: object[] = [];
  sim.setTime(new Date("2027-01-14T15:00:00Z"));
  try {
    const person = await sim.user(), outsider = await sim.user();
    await mutateWorkspace(outsider.id, {action:"save",id:randomUUID(),version:0,data:{kind:"note",title:"OTHER_ACCOUNT_SECRET",body:"Never disclose this other person's plan."}},sim.database);
    const extras: Array<{message:string;channel:"sms"|"web";noEdit?:boolean}> = [
      {message:"What happens if I delete my morning routine? Do not change anything.",channel:"sms",noEdit:true},
      {message:"Please do not enable proactive check-ins",channel:"sms",noEdit:true},
      {message:"I'm overwhelmed by my plan. What would you do first? Advice only.",channel:"web",noEdit:true},
      {message:"Enable proactive check-ins once a day",channel:"sms"},
      {message:"Disable proactive check-ins",channel:"web"},
      {message:"Remind me on Saturday January 16 at 2PM and 5PM to pick up the charger",channel:"sms"},
      {message:"Move both charger reminders on Saturday to 3PM and 6PM",channel:"sms"},
      {message:"Give me a morning reminder tomorrow of my current to do list, goals and calendar",channel:"sms"},
      {message:"11am?",channel:"sms"},
      {message:"Move my dentist appointment on January 15 to 3 PM for one hour.",channel:"sms"},
      {message:"YES",channel:"web"},
      {message:"What's on my calendar tomorrow?",channel:"sms",noEdit:true},
    ];
    if (process.argv.includes("--meal-only")) {
      await mutateWorkspace(person.id,{action:"save",id:randomUUID(),version:0,data:{kind:"recipe",title:"Lemon rice",ingredients:"rice and lemon",instructions:"Cook rice and add lemon",servings:4,prepMinutes:20,favorite:false}},sim.database);
      await mutateWorkspace(person.id,{action:"save",id:randomUUID(),version:0,data:{kind:"meal",title:"Lemon rice",ingredients:"rice and lemon",date:"2027-01-14",meal:"Dinner",servings:4}},sim.database);
    }
    const steps = process.argv.includes("--meal-only") ? [{message:"Move my Lemon rice dinner on January 14, 2027 to January 15, 2027 instead.",channel:"sms" as const}] : process.argv.includes("--workspace-only") ? workspaceJourney : process.argv.includes("--briefing-only") ? extras.filter(step=>step.message.includes("morning reminder") || step.message === "11am?") : process.argv.includes("--focused") ? extras : [...workspaceJourney,...extras];
    for (const step of steps) {
      if (stopped) break;
      const before = await person.workspace();
      const otherBefore = JSON.stringify(workspaceProductState(await outsider.workspace()));
      const turn = await person.send(step.message,{channel:step.channel});
      const after = await person.workspace(), state = await person.state();
      const issues: string[] = [];
      if (turn.replies.some(reply=>/trouble reaching|couldn.t match|lost track/i.test(reply))) issues.push("Assistant fallback requires review");
      if ("verify" in step) {
        if (!step.verify(after)) issues.push("Expected dashboard state not reached");
        issues.push(...evaluateWorkspaceChange(step,before,after));
      }
      if ("noEdit" in step && step.noEdit && JSON.stringify(workspaceProductState(before))!==JSON.stringify(workspaceProductState(after))) issues.push("Advice/negative turn changed workspace");
      if (otherBefore!==JSON.stringify(workspaceProductState(await outsider.workspace()))) issues.push("Other account changed");
      if (turn.replies.join(" ").includes("OTHER_ACCOUNT_SECRET")) issues.push("Other account leaked");
      const replay = await person.send(step.message,{channel:step.channel,providerId:turn.providerId});
      if (!replay.duplicate || JSON.stringify(workspaceProductState(after))!==JSON.stringify(workspaceProductState(await person.workspace()))) issues.push("Duplicate ingress changed state");
      if (step.message === "11am?" && !state.reminders.some(r=>r.contentMode==="daily_rundown" && r.remindAt.toISOString().startsWith("2027-01-15T16:00"))) issues.push("Fresh briefing not scheduled for tomorrow at 11AM");
      if (step.message.startsWith("Move both charger") && !["2027-01-16T20:00:00.000Z","2027-01-16T23:00:00.000Z"].every(time=>state.reminders.some(r=>r.remindAt.toISOString()===time))) issues.push("Both reminder times were not moved");
      if (process.argv.includes("--meal-only") && !after.items.some(row=>row.data.kind==="meal" && row.data.date==="2027-01-15")) issues.push("Meal did not move");
      if (issues.length) process.exitCode = 1;
      const row = { ...turn, issues, before, after, reminders:state.reminders };
      records.push(row);
      await writeFile(transcriptPath,JSON.stringify(records,null,2));
      console.log(JSON.stringify({input:step.message,replies:turn.replies,tools:turn.tools,issues,reminders:state.reminders.map(r=>({text:r.text,at:r.remindAt,mode:r.contentMode})),spent}));
    }
    const turn = await outsider.send("What was that recipe I saved earlier?");
    records.push({accountIsolation:true,...turn});
    console.log(JSON.stringify({accountIsolation:true,replies:turn.replies,spent}));
  } finally {
    await writeFile(transcriptPath, JSON.stringify(records,null,2));
    await sim.close(); globalThis.fetch = originalFetch; await saveBudget();
    console.log(JSON.stringify({ spent, committed, cap, stopped }));
  }
}
main().finally(async () => { globalThis.fetch = originalFetch; if (ownsLock) await unlink(lockPath); }).catch(() => { console.error("Synthetic live replay stopped; inspect the sanitized ledger and transcript."); process.exitCode = 1; });
