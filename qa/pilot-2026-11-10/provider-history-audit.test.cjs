"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { addTimestampDiagnostics, classifyCandidates, groupsFor, listProviderHistory, providerPage, sendblueConfig } = require("./provider-history-audit.cjs");

const from = "+12025550280";
const to = "+12025550281";
const start = Date.parse("2026-09-01T13:00:00Z");
const end = start + 60_000;
const marker = "SYNTHETIC PRIVATE BODY";
const handle = "synthetic-private-handle";
const config = sendblueConfig({ SENDBLUE_PHONE_NUMBER: from, SENDBLUE_API_KEY: "synthetic-key", SENDBLUE_API_SECRET: "synthetic-secret" });
const group = { from, to, start, end, local: [{ cohort: true, start, end, content: marker }] };
const receipt = { is_outbound: true, from_number: from, to_number: to, date_sent: new Date(start + 100).toISOString(),
  message_handle: handle, content: marker, status: "DELIVERED" };

test("an exact, single unbound receipt contributes only fixed aggregate fields", () => {
  const result = classifyCandidates(group, [receipt], new Set());
  assert.equal(result.outcome, "complete");
  assert.equal(result.counts.uniqueUnboundCandidates, 1);
  assert.equal(result.counts.providerDelivered, 1);
  for (const privateValue of [from, to, marker, handle]) assert.equal(JSON.stringify(result).includes(privateValue), false);
});

test("refuses reused, already-bound, scope-mismatched and timestamp-unverified receipts", () => {
  const colliding = { ...group, local: [...group.local, { ...group.local[0], cohort: false }] };
  assert.equal(classifyCandidates(colliding, [receipt], new Set()).counts.nonUniqueCandidates, 1);
  assert.equal(classifyCandidates(group, [receipt], new Set([handle])).counts.alreadyBoundCandidates, 1);
  assert.equal(classifyCandidates(group, [receipt, receipt], new Set()).outcome, "response_scope_unverified");
  assert.equal(classifyCandidates(group, [{ ...receipt, to_number: "+12025550282" }], new Set()).outcome, "response_scope_unverified");
  assert.equal(classifyCandidates(group, [{ ...receipt, is_outbound: false }], new Set()).outcome, "response_scope_unverified");
  assert.equal(classifyCandidates(group, [{ ...receipt, date_sent: null, date_updated: receipt.date_sent }], new Set()).outcome, "response_timestamp_unverified");
  assert.equal(classifyCandidates(group, [{ ...receipt, date_sent: new Date(end + 1).toISOString() }], new Set()).outcome, "response_timestamp_unverified");
  assert.equal(classifyCandidates(group, [{ ...receipt, content: `${marker} ` }], new Set()).counts.noExactCandidate, 1);
});

test("uses exact, in-window receipt rows without letting delayed or unverified rows become candidates", () => {
  const late = { ...receipt, message_handle: "late-handle", date_sent: new Date(end + 700).toISOString() };
  const mixed = classifyCandidates(group, [receipt, late], new Set());
  assert.equal(mixed.outcome, "complete");
  assert.equal(mixed.counts.uniqueUnboundCandidates, 1);
  assert.equal(mixed.counts.afterWindowReceiptRows, 1);
  assert.deepEqual(mixed.deltas.allExactContentPairs, { insideLocalWindow: 1, upTo1SecondAfterLocalUpdate: 1 });
  assert.deepEqual(mixed.deltas.uniqueUnboundContentPairs, {});
  const unverified = { ...late, date_sent: null };
  assert.equal(classifyCandidates(group, [receipt, unverified], new Set()).counts.nonUniqueCandidates, 1);
});

test("separates normalized text and exact precision from strict receipt matching", () => {
  const local = { ...group.local[0], content: "Café\nLine two", endExact: BigInt(end) * 1_000_000n + 100_000n };
  const preciseGroup = { ...group, endExact: local.endExact, local: [local] };
  const nanosLate = { ...receipt, content: local.content, date_sent: "2026-09-01T13:01:00.000101Z" };
  const result = classifyCandidates(preciseGroup, [nanosLate], new Set());
  assert.equal(result.counts.uniqueUnboundCandidates, 0);
  assert.equal(result.counts.afterWindowReceiptRows, 1);
  assert.deepEqual(result.deltas.uniqueUnboundContentPairs, { upTo1SecondAfterLocalUpdate: 1 });
  const normalized = classifyCandidates(preciseGroup, [{ ...receipt, content: "Cafe\u0301\r\nLine two" }], new Set());
  assert.equal(normalized.counts.uniqueUnboundCandidates, 0);
  assert.deepEqual(normalized.deltas.normalizedOnlyContentPairs, { insideLocalWindow: 1 });
});

test("reports timing buckets without automatically accepting a single delayed exact-content pair", () => {
  for (const [delay, bucket] of [
    [1_000, "upTo1SecondAfterLocalUpdate"], [5_000, "over1UpTo5SecondsAfterLocalUpdate"],
    [120_000, "over5UpTo120SecondsAfterLocalUpdate"], [120_001, "over120SecondsAfterLocalUpdate"],
  ]) {
    const result = classifyCandidates(group, [{ ...receipt, date_sent: new Date(end + delay).toISOString() }], new Set());
    assert.equal(result.counts.uniqueUnboundCandidates, 0);
    assert.equal(result.deltas.uniqueUnboundContentPairs[bucket], 1);
  }
});

test("requires an exact configured provider host and rejects out-of-scope recipient groups", async () => {
  for (const base of ["https://api.sendblue.com.example", "http://api.sendblue.com", "https://user:pass@api.sendblue.com", "https://api.sendblue.com/api"]) {
    assert.equal(sendblueConfig({ SENDBLUE_API_BASE_URL: base }).outcome, "provider_host_not_allowed");
  }
  assert.equal(sendblueConfig({ MESSAGING_PROVIDER: "linq" }).outcome, "different_configured_provider");
  assert.equal(groupsFor([{ userId: "fixture", phone: "+12025550181", cohort: true,
    createdAt: new Date(start), updatedAt: new Date(end), body: marker }], config), null);
  await assert.doesNotReject(async () => assert.deepEqual(
    await listProviderHistory({ ...config, origin: "https://example.invalid" }, group, () => assert.fail("unexpected fetch")),
    { outcome: "provider_scope_unverified", requests: 0 },
  ));
});

test("uses two or fewer strict GETs per account and rejects partial or drifting pagination", async () => {
  const fetches = [];
  const mock = async (url, init) => {
    fetches.push(url);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(url.origin, "https://api.sendblue.com");
    assert.equal(url.pathname, "/api/v2/messages");
    assert.equal(url.searchParams.get("to_number"), to);
    assert.equal(url.searchParams.get("from_number"), from);
    assert.equal(url.searchParams.get("is_outbound"), "true");
    assert.equal(url.searchParams.get("created_at_gte"), new Date(start).toISOString());
    assert.equal(url.searchParams.get("created_at_lte"), new Date(end).toISOString());
    const offset = Number(url.searchParams.get("offset"));
    return Response.json({ status: "OK", pagination: { limit: 100, total: offset ? 102 : 101, offset }, data: Array(offset ? 2 : 100).fill(receipt) });
  };
  assert.deepEqual(await listProviderHistory(config, group, mock), { outcome: "pagination_unresolved", requests: 2 });
  assert.equal(fetches.length, 2);
  assert.equal(providerPage({ status: "OK", pagination: { limit: 100, total: 2, offset: 0 }, data: [receipt] }, 0), null);
  const overflow = async () => Response.json({ status: "OK", pagination: { limit: 100, total: 201, offset: 0 }, data: Array(100).fill(receipt) });
  assert.deepEqual(await listProviderHistory(config, group, overflow), { outcome: "pagination_unresolved", requests: 1 });
});

test("aggregates only fixed timestamp fields and formats without weakening candidate verification", () => {
  const diagnostics = { responseRows: 0, scopedRows: 0, outOfScopeRows: 0, selectedAnchor: {}, fields: {} };
  const outside = new Date(end + 10_000).toISOString();
  const alternative = { ...receipt, date_sent: null, createdAt: receipt.date_sent, date_updated: outside, timestamp: 1_783_000_000_000 };
  const unsupported = { ...receipt, date_created: "2026-09-01 13:00:01", sent_at: "1783000000", [marker]: receipt.date_sent };
  const hidden = { ...receipt, from_number: "+12025550282", dateCreated: outside };
  addTimestampDiagnostics(diagnostics, group, [alternative, unsupported, hidden]);
  assert.deepEqual(diagnostics, {
    responseRows: 3, scopedRows: 2, outOfScopeRows: 1,
    selectedAnchor: { missing: 1, formatUnverified: 1 },
    fields: {
      date_created: { present: 1, string: 1, spaceSeparatedDateTime: 1 },
      createdAt: { present: 1, string: 1, isoValid: 1, insideWindow: 1 },
      date_sent: { present: 2, null: 1, string: 1, isoValid: 1, insideWindow: 1 },
      sent_at: { present: 1, string: 1, epochSecondsString: 1 },
      date_updated: { present: 1, string: 1, isoValid: 1, afterWindow: 1 },
      timestamp: { present: 1, number: 1 },
    },
  });
  const rendered = JSON.stringify(diagnostics);
  for (const privateValue of [from, to, marker, handle, outside, receipt.date_sent, "1783000000"]) assert.equal(rendered.includes(privateValue), false);
  assert.equal(classifyCandidates(group, [alternative], new Set()).outcome, "response_timestamp_unverified");
  assert.equal(classifyCandidates(group, [unsupported], new Set()).outcome, "response_timestamp_unverified");
});

test("timestamp diagnostic mode never fetches a second page", async () => {
  let calls = 0;
  const diagnostic = await listProviderHistory(config, group, async () => {
    calls++;
    return Response.json({ status: "OK", pagination: { limit: 100, total: 101, offset: 0 }, data: Array(100).fill(receipt) });
  }, true);
  assert.equal(calls, 1);
  assert.equal(diagnostic.requests, 1);
  assert.equal(diagnostic.outcome, "pagination_unresolved");
  assert.equal(diagnostic.rows, undefined);
  assert.equal(diagnostic.diagnosticRows.length, 100);
});

test("pasted stdin entrypoint emits a fixed failure without environment details", () => {
  const source = readFileSync(require.resolve("./provider-history-audit.cjs"), "utf8");
  const child = spawnSync(process.execPath, ["-"], { input: source, encoding: "utf8", env: { PRIVATE_FIXTURE: marker } });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), { ok: false, outcome: "database_configuration_unavailable" });
  assert.equal(child.stdout.includes(marker), false);
});
