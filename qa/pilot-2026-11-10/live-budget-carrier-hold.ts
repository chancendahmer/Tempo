import { reserveLiveQaCarrierAllowance } from "./live-budget";

async function main() {
  if (process.argv.length !== 2) throw new Error("Carrier allowance accepts no arguments.");
  console.log(JSON.stringify(await reserveLiveQaCarrierAllowance()));
}
void main().catch(() => {
  console.error(JSON.stringify({ outcome: "not_reserved", category: "qa_budget" }));
  process.exitCode = 1;
});
