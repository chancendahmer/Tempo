import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { MAX_ATTESTED_WORKERS, WORKER_FRESH_MS } from "../../observability/worker-attestation";

const buildSchema = z.string().regex(/^[0-9a-f]{40}$/);
const operatorRef = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const serviceKey = z.string().regex(/^tempo-(web|worker):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const exactTimestamp = z.iso.datetime({ precision: 6 });
const selectionSchema = z.object({
  removedBuild: buildSchema,
  evidenceRef: operatorRef,
  expectedWeb: z.number().int().min(0).max(MAX_ATTESTED_WORKERS),
  expectedWorker: z.number().int().min(0).max(MAX_ATTESTED_WORKERS),
}).strict().refine(selection => selection.expectedWeb + selection.expectedWorker > 0);
const targetSchema = z.object({ serviceKey, lastSeenAt: exactTimestamp }).strict();
const manifestSchema = z.object({
  version: z.literal(1), removedBuild: buildSchema, evidenceRef: operatorRef,
  rows: z.array(targetSchema).min(1).max(MAX_ATTESTED_WORKERS * 2),
}).strict().refine(manifest => new Set(manifest.rows.map(row => row.serviceKey)).size === manifest.rows.length);
export const heartbeatRetirementAcknowledgment = "verified_platform_removed";
type Client = Pick<PoolClient, "query">;
type Apply = { expectedSha256: string; acknowledge: string; operatorRef: string };
type Snapshot = { serviceKey: string; lastSeenAt: string; build: string | null; stale: boolean; metadataObject: boolean; hasAudit: boolean; audit: unknown };

const stale = `last_seen_at <= clock_timestamp() - interval '${WORKER_FRESH_MS} milliseconds'`;
const snapshotFields = `service_key as "serviceKey",
  to_char(last_seen_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "lastSeenAt",
  metadata->>'build' as build, (${stale}) as stale,
  jsonb_typeof(metadata)='object' as "metadataObject", metadata ? 'retirementAudit' as "hasAudit", metadata->'retirementAudit' as audit`;

export function canonicalHeartbeatRetirement(raw: unknown) {
  const input = manifestSchema.parse(raw);
  const rows = [...input.rows].sort((a, b) => a.serviceKey < b.serviceKey ? -1 : a.serviceKey > b.serviceKey ? 1 : 0);
  const manifest = { ...input, rows };
  return { manifest, sha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") };
}

function archiveKey(key: string, sha256: string) {
  return `tempo-retired:${key.slice("tempo-".length)}:${sha256}`;
}

async function inSnapshot<T>(client: Client, writable: boolean, read: () => Promise<T>) {
  await client.query(writable ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const result = await read();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** Platform removal evidence must be independently verified before selecting rows. */
export async function prepareHeartbeatRetirement(client: Client, raw: unknown) {
  const { removedBuild, evidenceRef, expectedWeb, expectedWorker } = selectionSchema.parse(raw);
  return inSnapshot(client, false, async () => {
    const { rows } = await client.query<Snapshot>(`select ${snapshotFields} from service_heartbeats
      where metadata->>'build'=$1 and (service_key like 'tempo-web:%' or service_key like 'tempo-worker:%')
      order by service_key limit $2`, [removedBuild, expectedWeb + expectedWorker + 1]);
    const web = rows.filter(row => row.serviceKey.startsWith("tempo-web:")).length;
    const worker = rows.length - web;
    if (web !== expectedWeb || worker !== expectedWorker || rows.some(row => !row.stale || !row.metadataObject || row.hasAudit)) {
      throw new Error("retirement_scope_unverified");
    }
    const prepared = canonicalHeartbeatRetirement({ version: 1, removedBuild, evidenceRef,
      rows: rows.map(({ serviceKey, lastSeenAt }) => ({ serviceKey, lastSeenAt })) });
    return { ...prepared, web, worker };
  });
}

/** Archive the exact stale keys while leaving the original namespace available for live pulses. */
export async function recordHeartbeatRetirement(client: Client, raw: unknown, apply?: Apply) {
  const { manifest, sha256 } = canonicalHeartbeatRetirement(raw);
  if (apply && (apply.expectedSha256 !== sha256 || apply.acknowledge !== heartbeatRetirementAcknowledgment
      || !operatorRef.safeParse(apply.operatorRef).success)) throw new Error("retirement_acknowledgment_mismatch");
  const targets = manifest.rows.map(row => ({ ...row, archive: archiveKey(row.serviceKey, sha256) }));
  return inSnapshot(client, Boolean(apply), async () => {
    const { rows } = await client.query<Snapshot>(`select ${snapshotFields} from service_heartbeats
      where service_key=any($1::text[]) order by service_key ${apply ? "for update" : ""}`,
    [targets.flatMap(row => [row.serviceKey, row.archive])]);
    const snapshots = new Map(rows.map(row => [row.serviceKey, row]));
    const matches = (snapshot: Snapshot | undefined, target: typeof targets[number]) =>
      snapshot?.lastSeenAt === target.lastSeenAt && snapshot.build === manifest.removedBuild && snapshot.metadataObject;
    const alreadyRecorded = targets.every(target => {
      const archived = snapshots.get(target.archive);
      const audit = z.object({ version: z.literal(1), sha256: z.literal(sha256), serviceKey: z.literal(target.serviceKey),
        lastSeenAt: z.literal(target.lastSeenAt), build: z.literal(manifest.removedBuild), evidenceRef: z.literal(manifest.evidenceRef),
        operatorRef, retiredAt: exactTimestamp }).strict();
      return !snapshots.has(target.serviceKey) && matches(archived, target) && audit.safeParse(archived?.audit).success;
    });
    if (!alreadyRecorded && targets.some(target => {
      const active = snapshots.get(target.serviceKey);
      return snapshots.has(target.archive) || !matches(active, target) || !active?.stale || active.hasAudit;
    })) throw new Error("retirement_target_changed");

    if (apply && !alreadyRecorded) {
      for (const target of targets) {
        const audit = { version: 1, sha256, serviceKey: target.serviceKey, lastSeenAt: target.lastSeenAt,
          build: manifest.removedBuild, evidenceRef: manifest.evidenceRef, operatorRef: apply.operatorRef };
        const result = await client.query(`update service_heartbeats set service_key=$2,
          metadata=metadata || jsonb_build_object('retirementAudit', $5::jsonb || jsonb_build_object('retiredAt',
            to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
          where service_key=$1 and last_seen_at=$3::timestamptz and metadata->>'build'=$4
          and jsonb_typeof(metadata)='object' and not metadata ? 'retirementAudit' and ${stale}`,
        [target.serviceKey, target.archive, target.lastSeenAt, manifest.removedBuild, JSON.stringify(audit)]);
        if (result.rowCount !== 1) throw new Error("retirement_target_changed");
      }
    }
    return { sha256, reviewedRows: targets.length, applied: Boolean(apply && !alreadyRecorded), alreadyRecorded };
  });
}
