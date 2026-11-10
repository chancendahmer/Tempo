import { reserveLiveQaHostedAllowance } from "./live-budget";

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--reserve-9-usd") throw new Error("Use the exact hosted allowance switch.");
  console.log(JSON.stringify(await reserveLiveQaHostedAllowance()));
}

void main().catch(() => {
  console.error(JSON.stringify({ outcome: "not_reserved", category: "qa_budget" }));
  process.exitCode = 1;
});
