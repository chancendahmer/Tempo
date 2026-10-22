/** Public local fixture address only. Never consult DATABASE_URL or env files. */
export const PILOT_ADMIN_URL = "postgresql://postgres@127.0.0.1:55437/tempo_ui_release";
export const PILOT_RUNTIME_MS = 120_000;
export const PILOT_TURNS_PER_ACCOUNT = 2;
export const PILOT_SYNTHETIC_ADMISSION = { PILOT_ADMISSION_MODE: "open" as const, PILOT_INVITED_PHONES: [] };

export function pilotLoadConfig(args: string[]) {
  let accounts = 20;
  let adminUrl = PILOT_ADMIN_URL;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index], value = args[index + 1];
    if (seen.has(option) || !["--accounts", "--database"].includes(option) || !value) throw new Error("Use --accounts 1..100 and optional --database local-fixture-URL only");
    seen.add(option);
    if (option === "--accounts") {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) throw new Error("Accounts must be an integer from 1 to 100");
      accounts = Number(value);
    } else adminUrl = value;
  }
  // Compare every URL field: reject passwords, aliases, query options, sockets,
  // alternate ports/databases and host override parameters before connecting.
  const target = new URL(adminUrl);
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1" || target.port !== "55437"
    || target.username !== "postgres" || target.password || target.pathname !== "/tempo_ui_release" || target.search || target.hash) {
    throw new Error("Pilot load requires the exact public localhost fixture at 127.0.0.1:55437/tempo_ui_release");
  }
  return { accounts, adminUrl: target.toString() };
}

/** Identical proof is required before both CREATE and DROP, even on failure. */
export function assertPilotOwnedDatabase(name: string, runId: string) {
  if (!/^[a-f0-9]{16}$/.test(runId) || name !== `tempo_pilot_${runId}_test`) throw new Error("Refusing database outside this pilot run");
}

export function latencySummary(values: number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) throw new Error("Invalid latency samples");
  const sorted = [...values].sort((left, right) => left - right);
  return { samples: sorted.length, p50Ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]), maxMs: Math.round(sorted[sorted.length - 1]) };
}
