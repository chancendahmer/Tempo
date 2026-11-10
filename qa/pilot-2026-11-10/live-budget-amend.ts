import { amendLiveQaAuthorization } from "./live-budget";

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--apply-20-usd") throw new Error("Use the exact approved amendment switch.");
  console.log(JSON.stringify(await amendLiveQaAuthorization()));
}

void main().catch(() => {
  console.error(JSON.stringify({ outcome: "not_amended", category: "qa_budget" }));
  process.exitCode = 1;
});
