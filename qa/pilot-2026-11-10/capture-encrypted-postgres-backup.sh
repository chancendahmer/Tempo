#!/usr/bin/env bash
# Read-only database capture. Run from the confirmed Postgres service only.
set +x
set -euo pipefail
umask 077

fail() { printf '{"ok":false,"outcome":"%s"}\n' "$1" >&2; exit 1; }
[[ $# == 3 ]] || fail invalid_arguments
recipient=$1
expected_recipient_sha=$2
expected_major=$3
[[ -f "$recipient" && "$expected_recipient_sha" =~ ^[0-9a-f]{64}$ && "$expected_major" =~ ^[0-9]{2}$ ]] || fail invalid_arguments
for tool in psql pg_dump openssl sha256sum timeout mktemp; do command -v "$tool" >/dev/null || fail required_tool_unavailable; done
case "$(openssl version)" in
  "OpenSSL 3."*) ;;
  *) fail incompatible_openssl ;;
esac

# Verify the uploaded certificate before contacting the database. Only the
# public certificate is uploaded. No private key or passphrase leaves the device.
recipient_hash=$(sha256sum -- "$recipient") || fail certificate_unreadable
[[ "${recipient_hash%% *}" == "$expected_recipient_sha" ]] || fail recipient_certificate_mismatch
fingerprint_sql=$(cat -- "$(dirname -- "$0")/backup-fingerprint.sql") || fail fingerprint_sql_unavailable
[[ -n "$fingerprint_sql" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_DB:-}" ]] || fail local_database_configuration_unavailable
[[ "${PGPORT:-5432}" =~ ^[0-9]{1,5}$ ]] || fail local_database_configuration_unavailable
case "$(pg_dump --version)" in
  "pg_dump (PostgreSQL) $expected_major."*) ;;
  *) fail incompatible_pg_dump ;;
esac

# Ignore service files and host overrides. The existing local instance is the
# only destination. Connection values are inherited by libpq, never arguments.
unset PGSERVICE PGSERVICEFILE PGHOSTADDR PGOPTIONS
export PGHOST=127.0.0.1 PGPORT="${PGPORT:-5432}" PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB"
export PGPASSWORD="${POSTGRES_PASSWORD:-}" PGPASSFILE=/dev/null PGSSLMODE=disable PGCONNECT_TIMEOUT=4
export PGOPTIONS="-c default_transaction_read_only=on"
private=$(mktemp -d /tmp/tempo-backup.XXXXXXXX) || fail private_directory_unavailable

# Keep the exporting transaction open until pg_dump finishes importing it.
coproc KEEPER { psql -XAtqw --set=ON_ERROR_STOP=1 2>"$private/snapshot.stderr"; }
keep_pid=$KEEPER_PID
exec {keep_in}>&"${KEEPER[1]}"
exec {keep_out}<&"${KEEPER[0]}"
finish_keeper() {
  printf 'rollback;\n\\q\n' >&"$keep_in" 2>/dev/null || true
  exec {keep_in}>&-
  exec {keep_out}<&-
  wait "$keep_pid" || true
}
trap finish_keeper EXIT
printf '%s\n' 'begin isolation level repeatable read read only;' \
  "set local statement_timeout = '10s';" "set local lock_timeout = '2s';" \
  "set local idle_in_transaction_session_timeout = '4min';" \
  "select current_setting('server_version_num')::int / 10000;" \
  'select pg_export_snapshot();' "$fingerprint_sql" >&"$keep_in" || fail source_snapshot_unavailable
IFS= read -r -t 15 -u "$keep_out" actual_major || fail source_snapshot_unavailable
IFS= read -r -t 15 -u "$keep_out" snapshot || fail source_snapshot_unavailable
IFS= read -r -t 15 -u "$keep_out" fingerprint || fail source_fingerprint_unavailable
actual_major=${actual_major%$'\r'}
snapshot=${snapshot%$'\r'}
fingerprint=${fingerprint%$'\r'}
[[ "$actual_major" == "$expected_major" ]] || fail incompatible_source_server
[[ "$snapshot" =~ ^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$ && "$fingerprint" == \{*\} ]] || fail source_snapshot_unverified

# The cleartext archive exists only in the pipe. A partial encrypted file is
# not a successful archive and is not announced for download.
if ! timeout --kill-after=5s 180s pg_dump --format=custom --no-owner --no-privileges --no-password \
    --lock-wait-timeout=5s --snapshot="$snapshot" 2>"$private/dump.stderr" |
  {
    IFS= read -r -N 5 magic && [[ "$magic" == PGDMP ]] || exit 1
    printf '%s' "$magic"
    cat
  } |
  timeout --kill-after=5s 185s openssl cms -encrypt -aes-256-gcm -stream -binary -outform DER \
    -out "$private/backup.cms.partial" "$recipient" 2>"$private/encrypt.stderr"; then
  fail dump_or_encryption_failed
fi
[[ -s "$private/backup.cms.partial" && ! -s "$private/snapshot.stderr" && ! -s "$private/dump.stderr" && ! -s "$private/encrypt.stderr" ]] || fail archive_diagnostics_present
mv -- "$private/backup.cms.partial" "$private/backup.cms"
archive_hash=$(sha256sum -- "$private/backup.cms")
printf '{"archiveSha256":"%s","sourceMajor":%s,"capturedUtc":"%s","fingerprint":%s}\n' \
  "${archive_hash%% *}" "$actual_major" "$(date -u +%FT%TZ)" "$fingerprint" >"$private/manifest.json"
printf '{"ok":true,"outcome":"encrypted_capture_complete","privateDirectory":"%s","sourceMajor":%s}\n' "$private" "$actual_major"
