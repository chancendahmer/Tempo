"use strict";

// Run from the deployed app directory with its existing process environment.
// Default is PostgreSQL only. The operator must separately approve provider scope and cost.
const WINDOW_START = "2026-08-20T00:00:00.000Z";
const WINDOW_END = "2026-10-01T00:00:00.000Z";
const EXPECTED_ROWS = 35;
const EXPECTED_ACCOUNTS = 2;
const MAX_ACCOUNTS = 2;
const MAX_PAGES = 2;
const PAGE_SIZE = 100;
const MAX_LOCAL_ROWS = 1_000;
const MAX_BOUND_HANDLES = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const PHONE = /^\+[1-9]\d{7,14}$/;
const FICTIONAL_PHONE = /^\+1\d{3}55501\d{2}$/;
const HANDLE = /^[a-zA-Z0-9_-]{1,128}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TIMESTAMP_FIELDS = [
  "date_created", "created_at", "createdAt", "dateCreated",
  "date_sent", "sent_at", "sentAt", "dateSent",
  "date_updated", "updated_at", "updatedAt", "dateUpdated", "timestamp",
];
const STATUSES = new Map([
  ["QUEUED", "provider_pending"], ["PENDING", "provider_pending"], ["REGISTERED", "provider_pending"],
  ["ACCEPTED", "provider_pending"], ["SENT", "provider_sent"], ["DELIVERED", "provider_delivered"],
  ["ERROR", "provider_error"], ["DECLINED", "provider_declined"],
]);
const cohortFilter = `m.direction = 'outbound' and m.status = 'failed' and m.outbound_state = 'ambiguous'
  and m.provider is null and m.provider_message_sid is null and m.submission_started_at is null and m.submission_token is null
  and m.created_at >= $1 and m.created_at < $2 and m.updated_at >= m.created_at and m.updated_at < $2`;

function sendblueConfig(env, needCredentials = true) {
  if ((env.MESSAGING_PROVIDER ?? "sendblue") !== "sendblue") return { outcome: "different_configured_provider" };
  let base;
  try { base = new URL(env.SENDBLUE_API_BASE_URL ?? "https://api.sendblue.com"); }
  catch { return { outcome: "provider_host_not_allowed" }; }
  if (base.origin !== "https://api.sendblue.com" || base.pathname !== "/" || base.username || base.password || base.search || base.hash) {
    return { outcome: "provider_host_not_allowed" };
  }
  const from = env.SENDBLUE_PHONE_NUMBER;
  if (!PHONE.test(from ?? "") || FICTIONAL_PHONE.test(from) || (needCredentials && (!env.SENDBLUE_API_KEY || !env.SENDBLUE_API_SECRET))) {
    return { outcome: "provider_configuration_unavailable" };
  }
  return {
    outcome: "configured", origin: base.origin, from,
    headers: { "sb-api-key-id": env.SENDBLUE_API_KEY, "sb-api-secret-key": env.SENDBLUE_API_SECRET, accept: "application/json" },
  };
}

function asTime(value) {
  return typeof value === "string" && TIME.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}

function exactTime(value) {
  const milliseconds = asTime(value);
  if (milliseconds === null) return null;
  const fraction = value.match(/\.(\d{1,9})(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  return BigInt(milliseconds) * NANOSECONDS_PER_MILLISECOND + BigInt(fraction.padEnd(9, "0").slice(3));
}

function timeBound(window, name) {
  return window[`${name}Exact`] ?? BigInt(window[name]) * NANOSECONDS_PER_MILLISECOND;
}

function receiptTimestamp(row) {
  return row.date_created ?? row.created_at ?? row.date_sent;
}

function isScopedReceipt(group, row) {
  return Boolean(row && row.is_outbound === true && row.to_number === group.to && row.from_number === group.from &&
    (row.message_type == null || row.message_type === "message") && (row.group_id == null || row.group_id === "") &&
    typeof row.message_handle === "string" && HANDLE.test(row.message_handle));
}

function countBucket(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function windowBucket(time, group) {
  return time < timeBound(group, "start") ? "beforeWindow" : time > timeBound(group, "end") ? "afterWindow" : "insideWindow";
}

function addTimestampDiagnostics(diagnostics, group, rows) {
  for (const row of rows) {
    diagnostics.responseRows++;
    if (!isScopedReceipt(group, row)) {
      diagnostics.outOfScopeRows++;
      continue;
    }
    diagnostics.scopedRows++;
    const anchor = receiptTimestamp(row);
    const time = exactTime(anchor);
    countBucket(diagnostics.selectedAnchor, anchor == null ? "missing" : time === null ? "formatUnverified" : windowBucket(time, group));
    for (const field of TIMESTAMP_FIELDS) {
      if (!Object.hasOwn(row, field)) continue;
      const counts = diagnostics.fields[field] ??= {};
      const value = row[field];
      countBucket(counts, "present");
      if (value === null) { countBucket(counts, "null"); continue; }
      if (typeof value === "number") { countBucket(counts, "number"); continue; }
      if (typeof value !== "string") { countBucket(counts, "otherType"); continue; }
      countBucket(counts, "string");
      const parsed = exactTime(value);
      if (parsed !== null) {
        countBucket(counts, "isoValid");
        countBucket(counts, windowBucket(parsed, group));
      } else if (!value.trim()) countBucket(counts, "blank");
      else if (/^\d{10}$/.test(value)) countBucket(counts, "epochSecondsString");
      else if (/^\d{13}$/.test(value)) countBucket(counts, "epochMillisecondsString");
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) countBucket(counts, "isoWithoutZone");
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{4}$/.test(value)) countBucket(counts, "isoCompactOffset");
      else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) countBucket(counts, "spaceSeparatedDateTime");
      else countBucket(counts, "otherString");
    }
  }
}

function usableContent(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096 ? value : null;
}

function normalizeContent(value) {
  return usableContent(value)?.normalize("NFC").replaceAll("\r\n", "\n") ?? null;
}

function providerPage(payload, offset) {
  const page = payload?.pagination;
  if (payload?.status !== "OK" || !Array.isArray(payload.data) || page?.limit !== PAGE_SIZE ||
      page.offset !== offset || !Number.isSafeInteger(page.total) || page.total < offset ||
      payload.data.length !== Math.min(page.total - offset, PAGE_SIZE)) return null;
  return { total: page.total, rows: payload.data };
}

function deltaBucket(time, local) {
  if (time < timeBound(local, "start")) return "beforeLocalCreated";
  const delay = time - timeBound(local, "end");
  if (delay <= 0n) return "insideLocalWindow";
  if (delay <= 1_000n * NANOSECONDS_PER_MILLISECOND) return "upTo1SecondAfterLocalUpdate";
  if (delay <= 5_000n * NANOSECONDS_PER_MILLISECOND) return "over1UpTo5SecondsAfterLocalUpdate";
  if (delay <= 120_000n * NANOSECONDS_PER_MILLISECOND) return "over5UpTo120SecondsAfterLocalUpdate";
  return "over120SecondsAfterLocalUpdate";
}

function classifyCandidates(group, rows, boundHandles) {
  const counts = {
    uniqueUnboundCandidates: 0, noExactCandidate: 0, nonUniqueCandidates: 0, alreadyBoundCandidates: 0,
    inWindowReceiptRows: 0, beforeWindowReceiptRows: 0, afterWindowReceiptRows: 0, timestampUnverifiedReceiptRows: 0,
    strictCandidatesWithDocumentedCreationAnchor: 0, strictCandidatesWithCreationAlias: 0, strictCandidatesWithSendTimeOnly: 0,
    strictCandidatesWithOwnedHistoricalLine: 0, strictCandidatesWithSameLineHistoricalOutbound: 0,
    strictCandidatesWithAlternateProviderHistory: 0,
    providerPending: 0, providerSent: 0, providerDelivered: 0, providerError: 0, providerDeclined: 0,
  };
  const deltas = { allExactContentPairs: {}, uniqueUnboundContentPairs: {}, normalizedOnlyContentPairs: {} };
  const handles = new Set();
  const receipts = [];
  for (const row of rows) {
    if (!isScopedReceipt(group, row) || handles.has(row.message_handle)) {
      return { outcome: "response_scope_unverified", counts: {}, deltas };
    }
    const time = exactTime(receiptTimestamp(row));
    const inside = time !== null && time >= timeBound(group, "start") && time <= timeBound(group, "end");
    countBucket(counts, time === null ? "timestampUnverifiedReceiptRows" : inside ? "inWindowReceiptRows"
      : time < timeBound(group, "start") ? "beforeWindowReceiptRows" : "afterWindowReceiptRows");
    handles.add(row.message_handle);
    const anchor = row.date_created != null ? "strictCandidatesWithDocumentedCreationAnchor"
      : row.created_at != null ? "strictCandidatesWithCreationAlias" : "strictCandidatesWithSendTimeOnly";
    receipts.push({ handle: row.message_handle, content: usableContent(row.content), time, inside, anchor, status: STATUSES.get(row.status) });
  }

  const sameContent = (local, receipt) => local.content !== null && local.content === receipt.content;
  const matches = (local, receipt) => receipt.inside && sameContent(local, receipt)
    && timeBound(local, "start") <= receipt.time && receipt.time <= timeBound(local, "end");
  for (const local of group.local.filter(row => row.cohort)) {
    const equalContent = receipts.filter(receipt => sameContent(local, receipt));
    const normalized = normalizeContent(local.content);
    if (normalized !== null) for (const receipt of receipts) {
      if (receipt.time !== null && !sameContent(local, receipt) && normalizeContent(receipt.content) === normalized) {
        countBucket(deltas.normalizedOnlyContentPairs, deltaBucket(receipt.time, local));
      }
    }
    for (const receipt of equalContent) {
      if (receipt.time !== null) countBucket(deltas.allExactContentPairs, deltaBucket(receipt.time, local));
    }
    if (equalContent.length === 1 && equalContent[0].time !== null && !boundHandles.has(equalContent[0].handle)
        && group.local.filter(row => sameContent(row, equalContent[0])).length === 1) {
      countBucket(deltas.uniqueUnboundContentPairs, deltaBucket(equalContent[0].time, local));
    }
    const candidates = equalContent.filter(receipt => matches(local, receipt));
    if (!candidates.length) { counts.noExactCandidate++; continue; }
    if (candidates.length !== 1 || equalContent.some(receipt => receipt.time === null)
        || group.local.filter(row => matches(row, candidates[0])).length !== 1 || !candidates[0].status) {
      counts.nonUniqueCandidates++;
      continue;
    }
    const [candidate] = candidates;
    if (boundHandles.has(candidate.handle)) { counts.alreadyBoundCandidates++; continue; }
    counts.uniqueUnboundCandidates++;
    counts[candidate.anchor]++;
    if (local.provenance?.ownedLineByAttempt) counts.strictCandidatesWithOwnedHistoricalLine++;
    if (local.provenance?.sameLineHistoricalOutbound) counts.strictCandidatesWithSameLineHistoricalOutbound++;
    if (local.provenance?.otherProviderHistorical) counts.strictCandidatesWithAlternateProviderHistory++;
    const key = {
      provider_pending: "providerPending", provider_sent: "providerSent", provider_delivered: "providerDelivered",
      provider_error: "providerError", provider_declined: "providerDeclined",
    }[candidate.status];
    counts[key]++;
  }
  return { outcome: rows.length && !counts.inWindowReceiptRows ? "response_timestamp_unverified" : "complete", counts, deltas };
}

async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) return null;
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function listProviderHistory(config, group, fetchImpl = fetch, diagnosticsOnly = false) {
  if (config.origin !== "https://api.sendblue.com" || group.from !== config.from ||
      !PHONE.test(group.to) || FICTIONAL_PHONE.test(group.to) || group.to === group.from ||
      !Number.isFinite(group.start) || !Number.isFinite(group.end) || group.start > group.end ||
      group.start < Date.parse(WINDOW_START) || group.end >= Date.parse(WINDOW_END)) {
    return { outcome: "provider_scope_unverified", requests: 0 };
  }
  const fromTime = group.startIso ?? new Date(group.start).toISOString();
  const untilTime = group.endIso ?? new Date(group.end).toISOString();
  if (exactTime(fromTime) !== timeBound(group, "start") || exactTime(untilTime) !== timeBound(group, "end")) {
    return { outcome: "provider_scope_unverified", requests: 0 };
  }
  let requests = 0;
  let total;
  const rows = [];
  const maxPages = diagnosticsOnly ? 1 : MAX_PAGES;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const offset = pageNumber * PAGE_SIZE;
    const url = new URL("/api/v2/messages", config.origin);
    url.search = new URLSearchParams({
      to_number: group.to, from_number: group.from, is_outbound: "true", message_type: "message",
      created_at_gte: fromTime, created_at_lte: untilTime,
      order_by: "createdAt", order_direction: "asc", limit: String(PAGE_SIZE), offset: String(offset),
    }).toString();
    requests++;
    let response;
    try {
      response = await fetchImpl(url, { method: "GET", headers: config.headers, redirect: "error", signal: AbortSignal.timeout(5_000) });
    } catch { return { outcome: "provider_request_failed", requests }; }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const outcome = response.status === 401 || response.status === 403 ? "provider_access_denied"
        : response.status === 429 ? "provider_rate_limited" : "provider_http_failure";
      return { outcome, requests };
    }
    const page = providerPage(await readBoundedJson(response), offset);
    if (!page) return { outcome: "provider_response_unverified", requests };
    if ((total !== undefined && total !== page.total) || page.total > PAGE_SIZE * maxPages) {
      return { outcome: "pagination_unresolved", requests, ...(diagnosticsOnly ? { diagnosticRows: page.rows } : {}) };
    }
    total = page.total;
    rows.push(...page.rows);
    if (rows.length === total) return { outcome: "complete", requests, rows };
  }
  return { outcome: "pagination_unresolved", requests };
}

async function readHistoricalProvenance(client, window, from) {
  const { rows } = await client.query(`with targets as (
    select m.id, m.user_id, m.conversation_id, m.updated_at,
      c.id is not null as owned_direct,
      'direct:' || $3::text || ':' || u.phone_e164 as line_key
    from conversation_messages m join users u on u.id = m.user_id
    left join conversations c on c.id = m.conversation_id and c.owner_user_id = m.user_id and c.type = 'direct'
    where ${cohortFilter}
  )
  select t.id as "messageId", t.owned_direct as "ownedDirectConversation",
    exists (
      select 1 from provider_conversations pc join provider_lines pl on pl.id = pc.provider_line_id
      where t.owned_direct and pc.conversation_id = t.conversation_id and pc.provider = 'sendblue'
        and pl.provider = 'sendblue' and pl.address = $3 and pc.external_key = t.line_key
        and pc.created_at <= t.updated_at and pl.created_at <= t.updated_at
    ) as "ownedLineByAttempt",
    coalesce(h.inbound, false) as "sameLineHistoricalInbound",
    coalesce(h.outbound, false) as "sameLineHistoricalOutbound",
    exists (
      select 1 from conversation_messages n join provider_message_bindings b on b.message_id = n.id
      where t.owned_direct and n.user_id = t.user_id and n.conversation_id = t.conversation_id
        and n.provider in ('linq', 'twilio') and b.provider = n.provider and b.external_message_id = n.provider_message_sid
        and n.created_at >= $1 and n.created_at < $2
    ) as "otherProviderHistorical",
    exists (select 1 from provider_message_bindings b where b.message_id = t.id) as "existingBinding",
    coalesce(h.exact_binding, false) as "exactOwnedLineBinding",
    coalesce(h.exact_positive_binding, false) as "exactOwnedLineSentOrDeliveredBinding"
  from targets t left join lateral (
    select bool_or(n.direction = 'inbound' and n.provider = 'sendblue' and n.provider_message_sid = b.external_message_id) as inbound,
      bool_or(n.direction = 'outbound' and n.provider = 'sendblue' and n.provider_message_sid = b.external_message_id) as outbound,
      bool_or(n.id = t.id) as exact_binding,
      bool_or(n.id = t.id and b.delivery_status in ('sent', 'delivered')) as exact_positive_binding
    from provider_conversations pc join provider_lines pl on pl.id = pc.provider_line_id
    join provider_message_bindings b on b.provider_conversation_id = pc.id and b.provider = 'sendblue' and length(b.external_message_id) > 0
    join conversation_messages n on n.id = b.message_id and n.user_id = t.user_id and n.conversation_id = t.conversation_id
    where t.owned_direct and pc.conversation_id = t.conversation_id and pc.provider = 'sendblue'
      and pl.provider = 'sendblue' and pl.address = $3 and pc.external_key = t.line_key
      and n.created_at >= $1 and n.created_at < $2
  ) h on true`, [...window, from]);
  return rows;
}

const PROVENANCE_COUNTS = [
  "ownedDirectConversation", "ownedLineByAttempt", "sameLineHistoricalInbound", "sameLineHistoricalOutbound",
  "otherProviderHistorical", "existingBinding", "exactOwnedLineBinding", "exactOwnedLineSentOrDeliveredBinding",
];

function summarizeProvenance(rows) {
  return Object.fromEntries(PROVENANCE_COUNTS.map(field => [field, rows.filter(row => row[field] === true).length]));
}

async function readSnapshot(Client, connectionString, detailMode, provenanceLine) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 4_000, query_timeout: 7_000, application_name: "tempo-readonly-provider-history-audit" });
  client.on("error", () => undefined);
  const window = [WINDOW_START, WINDOW_END];
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const { rows: [settings] } = await client.query("select current_setting('transaction_read_only') as readonly");
    if (settings.readonly !== "on") throw new Error("Expected read-only snapshot");
    const { rows: [summary] } = await client.query(`select
      count(*)::int as "cohortRows", count(distinct m.user_id)::int as "cohortAccounts",
      count(*) filter (where u.phone_e164 ~ '^\\+1[0-9]{3}55501[0-9]{2}$')::int as "fictionalRangeRows",
      count(*) filter (where m.provider_error_message is null)::int as "missingStoredError",
      count(*) filter (where m.provider_error_message ~ '^Missing required environment variables: ((SENDBLUE_(API_KEY|API_SECRET|PHONE_NUMBER)|LINQ_API_KEY|TWILIO_(ACCOUNT_SID|API_KEY_SID|API_KEY_SECRET|MESSAGING_SERVICE_SID))(, )?)+$')::int as "adapterConfigurationText",
      count(*) filter (where m.provider_error_message ~ '^(Sendblue|Linq) request failed with HTTP [0-9]{3}$')::int as "providerHttpFallbackText",
      count(*) filter (where m.provider_error_message in ('Tempo identity owner not found', 'Messaging provider conversation binding could not be resolved', 'Messaging provider line could not be resolved'))::int as "postResponseBindingText",
      count(*) filter (where m.provider_error_message like 'Failed query:%')::int as "databaseFailureText"
      from conversation_messages m join users u on u.id = m.user_id where ${cohortFilter}`, window);
    summary.otherUnverifiedText = summary.cohortRows - summary.missingStoredError - summary.adapterConfigurationText
      - summary.providerHttpFallbackText - summary.postResponseBindingText - summary.databaseFailureText;
    let details = [];
    let bound = [];
    let provenance = null;
    if (provenanceLine && summary.cohortRows === EXPECTED_ROWS && summary.cohortAccounts === EXPECTED_ACCOUNTS) {
      provenance = await readHistoricalProvenance(client, window, provenanceLine);
    }
    if (detailMode && summary.cohortRows === EXPECTED_ROWS && summary.cohortAccounts === EXPECTED_ACCOUNTS) {
      const selected = await client.query(`with selected as (
        select m.user_id, min(m.created_at) as first_at, max(m.updated_at) as last_at from conversation_messages m join users u on u.id = m.user_id
        where ${cohortFilter} and u.phone_e164 ~ '^\\+[1-9][0-9]{7,14}$' and u.phone_e164 !~ '^\\+1[0-9]{3}55501[0-9]{2}$'
        group by m.user_id order by first_at, m.user_id limit $3
      )
      select m.id as "messageId", m.user_id as "userId", u.phone_e164 as phone, (${cohortFilter}) as cohort,
        ${detailMode === "candidates" ? "case when length(m.body) <= 4096 then m.body end" : "null::text"} as body,
        m.created_at as "createdAt", m.updated_at as "updatedAt",
        to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAtIso",
        to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAtIso"
      from selected s join users u on u.id = s.user_id join conversation_messages m on m.user_id = s.user_id
      where m.direction = 'outbound' and m.created_at <= s.last_at and m.updated_at >= s.first_at
      order by m.created_at, m.id limit $4`, [...window, MAX_ACCOUNTS, MAX_LOCAL_ROWS + 1]);
      details = selected.rows;
      if (detailMode === "candidates") {
        const knownHandles = await client.query(`select handle from (
          select provider_message_sid as handle from conversation_messages where provider = 'sendblue'
          union select external_message_id from provider_message_bindings where provider = 'sendblue'
          union select provider_message_sid from reminders where provider = 'sendblue'
          union select provider_message_sid from interventions where provider = 'sendblue'
        ) known where handle is not null limit $1`, [MAX_BOUND_HANDLES + 1]);
        bound = knownHandles.rows;
      }
    }
    await client.query("COMMIT");
    return { summary, details, bound, provenance };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function groupsFor(details, config, provenance = [], requireBody = true) {
  const provenanceByMessage = new Map(provenance.map(row => [row.messageId, row]));
  const groups = new Map();
  for (const row of details) {
    if (!groups.has(row.userId)) groups.set(row.userId, { to: row.phone, from: config.from, local: [] });
    const group = groups.get(row.userId);
    if (!PHONE.test(group.to) || FICTIONAL_PHONE.test(group.to) || group.to !== row.phone || group.to === config.from) return null;
    const local = { start: row.createdAt.getTime(), end: row.updatedAt.getTime(), content: usableContent(row.body), cohort: row.cohort === true,
      startIso: row.createdAtIso, endIso: row.updatedAtIso, startExact: exactTime(row.createdAtIso), endExact: exactTime(row.updatedAtIso),
      provenance: provenanceByMessage.get(row.messageId) };
    if (!Number.isFinite(local.start) || !Number.isFinite(local.end) || timeBound(local, "start") > timeBound(local, "end")) return null;
    group.local.push(local);
  }
  for (const group of groups.values()) {
    const cohort = group.local.filter(row => row.cohort);
    if (!cohort.length || (requireBody && cohort.some(row => row.content === null))) return null;
    const earliest = cohort.reduce((a, b) => timeBound(a, "start") <= timeBound(b, "start") ? a : b);
    const latest = cohort.reduce((a, b) => timeBound(a, "end") >= timeBound(b, "end") ? a : b);
    group.start = earliest.start;
    group.end = latest.end;
    group.startIso = earliest.startIso;
    group.endIso = latest.endIso;
    group.startExact = timeBound(earliest, "start");
    group.endExact = timeBound(latest, "end");
    if (!Number.isFinite(group.start) || !Number.isFinite(group.end) || group.start > group.end ||
        group.start < Date.parse(WINDOW_START) || group.end >= Date.parse(WINDOW_END)) return null;
  }
  return groups.size <= MAX_ACCOUNTS ? [...groups.values()] : null;
}

function writeReport(report) {
  process.stdout.write(JSON.stringify(report) + "\n");
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const diagnosticsOnly = argv.length === 1 && argv[0] === "--provider-timestamp-diagnostics";
  const provenanceOnly = argv.length === 1 && argv[0] === "--provider-provenance";
  const providerRequested = diagnosticsOnly || (argv.length === 1 && argv[0] === "--provider-history");
  const invalidArguments = argv.length > 0 && !providerRequested && !provenanceOnly;
  if (invalidArguments || !env.DATABASE_URL) {
    writeReport({ ok: false, outcome: invalidArguments ? "invalid_arguments" : "database_configuration_unavailable" });
    process.exitCode = 1;
    return;
  }
  const { Client } = require("pg");
  const installed = require("pg/package.json").version;
  const config = providerRequested || provenanceOnly ? sendblueConfig(env, !provenanceOnly) : { outcome: "not_requested" };
  const configured = config.outcome === "configured";
  const detailMode = configured && providerRequested ? diagnosticsOnly ? "scope" : "candidates" : null;
  const snapshot = await readSnapshot(Client, env.DATABASE_URL, detailMode, configured && !diagnosticsOnly ? config.from : null);
  const report = {
    ok: Boolean(snapshot),
    nodeMajor: Number(process.versions.node.split(".")[0]),
    pgVersion: /^\d+\.\d+\.\d+$/.test(installed) ? installed : null,
    readOnlySnapshot: Boolean(snapshot),
    expectedLegacyRows: EXPECTED_ROWS,
    ...(snapshot ? { legacy: snapshot.summary, unresolvedRows: snapshot.summary.cohortRows } : {}),
    provider: { outcome: provenanceOnly ? "not_requested" : config.outcome, accountsQueried: 0, requests: 0, accountOutcomes: {}, candidates: {} },
  };
  if (!snapshot) {
    report.provider.outcome = "snapshot_unavailable";
    writeReport(report);
    process.exitCode = 1;
    return;
  }
  if (snapshot.provenance) {
    report.historicalLineProvenance = summarizeProvenance(snapshot.provenance);
  }
  if (provenanceOnly) {
    if (!snapshot.provenance) report.historicalLineProvenanceOutcome = configured ? "cohort_unverified" : config.outcome;
    writeReport(report);
    return;
  }
  if (config.outcome !== "configured") { writeReport(report); return; }
  const groups = groupsFor(snapshot.details, config, snapshot.provenance ?? [], !diagnosticsOnly);
  if (snapshot.summary.cohortRows !== EXPECTED_ROWS || snapshot.summary.cohortAccounts !== EXPECTED_ACCOUNTS ||
      groups?.length !== EXPECTED_ACCOUNTS || groups.reduce((total, group) => total + group.local.filter(row => row.cohort).length, 0) !== EXPECTED_ROWS ||
      (!diagnosticsOnly && snapshot.provenance?.length !== EXPECTED_ROWS) ||
      snapshot.details.length > MAX_LOCAL_ROWS || snapshot.bound.length > MAX_BOUND_HANDLES) {
    report.provider.outcome = "cohort_or_local_scope_unverified";
    writeReport(report);
    return;
  }

  const bound = new Set(snapshot.bound.map(row => row.handle));
  const diagnostics = { responseRows: 0, scopedRows: 0, outOfScopeRows: 0, selectedAnchor: {}, fields: {} };
  report.provider.timestampDiagnostics = diagnostics;
  if (!diagnosticsOnly) report.provider.contentTimingDeltas = { allExactContentPairs: {}, uniqueUnboundContentPairs: {}, normalizedOnlyContentPairs: {} };
  report.provider.outcome = "historical_provider_provenance_unverified";
  for (const group of groups) {
    const result = await listProviderHistory(config, group, fetch, diagnosticsOnly);
    report.provider.accountsQueried++;
    report.provider.requests += result.requests;
    addTimestampDiagnostics(diagnostics, group, result.rows ?? result.diagnosticRows ?? []);
    const evidence = result.rows && !diagnosticsOnly ? classifyCandidates(group, result.rows, bound) : { outcome: result.outcome, counts: {} };
    report.provider.accountOutcomes[evidence.outcome] = (report.provider.accountOutcomes[evidence.outcome] ?? 0) + 1;
    for (const [key, count] of Object.entries(evidence.counts)) {
      report.provider.candidates[key] = (report.provider.candidates[key] ?? 0) + count;
    }
    for (const [series, buckets] of Object.entries(evidence.deltas ?? {})) for (const [bucket, count] of Object.entries(buckets)) {
      const totals = report.provider.contentTimingDeltas[series];
      totals[bucket] = (totals[bucket] ?? 0) + count;
    }
    if (["provider_access_denied", "provider_rate_limited"].includes(result.outcome)) break;
  }
  writeReport(report);
}

if (require.main === module || (process.argv[1] === "-" && module.id === "[stdin]")) main().catch(() => {
  writeReport({ ok: false, outcome: "unexpected_audit_failure" });
  process.exitCode = 1;
});

module.exports = { addTimestampDiagnostics, classifyCandidates, groupsFor, listProviderHistory, main, providerPage, sendblueConfig };
