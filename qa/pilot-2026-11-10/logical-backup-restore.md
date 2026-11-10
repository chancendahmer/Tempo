# One-time logical backup and isolated restore

Railway's production Backups panel showed **No Backups** and offered a plan upgrade for backups and PITR. The owner has not authorized a plan upgrade or additional hosting. A logical export and successful local restore can establish one predeployment recovery point. Scheduled backups, ongoing recoverability, a defined recovery window, and PITR remain open. The scripts require an authorized production export and an approved device and retention location. [Railway backup and restore guide](https://railway.com/guides/postgres-backups-restores)

## Prepare the operator device

1. Use a current PostgreSQL **18** binary-only package and a patched OpenSSL **3** executable. Railway exposed PostgreSQL tools 18.6 and OpenSSL 3.5.7. PostgreSQL does not guarantee version 18 dump output loads on an older server. An archive listing on the existing PostgreSQL 17 instance cannot substitute for a restore. PostgreSQL's Windows page links to EDB's binary archives. Maintained portable Git for Windows distributions include OpenSSL 3. [PostgreSQL Windows download](https://www.postgresql.org/download/windows/), [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [Git for Windows releases](https://github.com/git-for-windows/git/releases)
2. Prepare an owner-only encrypted directory outside source control, browser sync, and shared storage. Use it for the archive, local restore data, and diagnostics. Confirm ACL and at-rest encryption before capture. No data file belongs in a transcript or repo.
3. Run `prepare-local-backup-drill.ps1` once in that directory to create the recipient certificate and the dedicated local PostgreSQL 18 cluster. Use the verified PostgreSQL/OpenSSL paths and a free high port. The helper generates separate random secrets, stores only their Windows CurrentUser DPAPI envelope, and keeps the key encrypted. Only the public certificate and its SHA-256 go to Railway.

   ```powershell
   ./qa/pilot-2026-11-10/prepare-local-backup-drill.ps1 -ProtectedDirectory $PrivateWorkDirectory -PostgresBin $PostgresBin -OpenSsl $OpenSsl -Port 55439
   ```

## Capture in the existing PostgreSQL service

1. Confirm the intended Railway project, production environment, Postgres service, and local PostgreSQL major. Verify required tool and normal environment presence without listing values. Ensure temporary capacity and avoid competing DDL.
2. Upload the reviewed `capture-encrypted-postgres-backup.sh` and `backup-fingerprint.sql` beside the public certificate in the private temporary directory. Use the public certificate checksum computed on the device.

   ```bash
   bash /tmp/<private-dir>/capture-encrypted-postgres-backup.sh /tmp/<private-dir>/recipient.crt <local-public-certificate-sha256> 18
   ```

3. The helper uses existing PostgreSQL credentials over fixed in-service loopback. It holds a read-only repeatable-read transaction, exports its snapshot, and records fixed aggregate counts and a migration ledger digest. The dump consumes that same snapshot. PostgreSQL custom-format bytes flow directly into OpenSSL CMS AES-256-GCM and never land unencrypted in Railway. Only the restricted directory and source major print. A completed capture still needs a restore. [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [OpenSSL CMS](https://docs.openssl.org/3.0/man1/openssl-cms/)
4. Use the approved authenticated file transfer to retrieve only `backup.cms` and `manifest.json`. Leave diagnostics private. If the operator cannot download files securely, stop. Do not print, paste, base64-transfer or publish the archive. Avoid enabling public database access or creating a new service for the transfer.

## Restore in a dedicated local instance

1. Use a fresh PostgreSQL 18 instance under the protected local directory, listening only on `127.0.0.1` on a spare high port. Require a fresh, idle SCRAM instance and an outbound-isolated environment. Do not point Tempo, pg-boss, a provider adapter, or any worker at the restored data. Treat a database archive as executable SQL from its source. [PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)
2. Run the reviewed Windows helper with full paths to the PostgreSQL `bin` directory, the exact fresh cluster data directory, the approved OpenSSL executable, the recipient files, and the private archive directory. Use a clean PowerShell session. The protected credential switch unlocks the DPAPI envelope locally for the native tools and clears the process environment afterward. Keep the archive in the verified EFS directory or a verified direct child. The example port is valid only if it belongs to the fresh instance.

   ```powershell
   ./qa/pilot-2026-11-10/restore-encrypted-postgres-backup.ps1 -PostgresBin $PostgresBin -ExpectedDataDirectory $IsolatedData -Port 55439 -OpenSsl $OpenSsl -RecipientCertificate $RecipientCertificate -LocalPrivateKey $LocalPrivateKey -PrivateWorkDirectory $PrivateWorkDirectory -UseLocalProtectedCredentials
   ```

3. Require successful hash and authenticated decryption, a PostgreSQL custom archive header and listing, an atomic restore into the helper's newly generated database, and the exact migration ledger digest plus all fixed source-snapshot counts. Keep the private diagnostics private, including any partial decrypt. Record capture timestamp, restore elapsed time, ledger-row count, and aggregate-match outcome. Keep the encrypted artifact and key under the owner-approved retention process. Retire plaintext copies and the drill database using a separately verified local cleanup.
4. The export is a single-database data and schema recovery point. It does not preserve cluster roles, tablespaces, Railway service settings, or external secrets. The isolated proof deliberately skips ownership, privileges, publications and subscriptions. Keep the field encryption key recoverable in its existing secret store and verify its recovery process separately. The helper never restores to production or automatically deletes an artifact.

## Local synthetic proof

The reviewed helpers exported and restored a synthetic PostgreSQL 18.6 database using OpenSSL 3.5.9. The restored custom archive had a valid PostgreSQL header, and its exact migration ledger digest and fixed counts matched the export snapshot. A modified ciphertext failed authentication before database creation, even after the synthetic manifest checksum was updated to match it. The tests ran in dedicated loopback-only synthetic PostgreSQL instances, which were stopped afterward. A separate owner-only EFS/SCRAM fixture verified noninteractive DPAPI restore and environment cleanup.

The local tools were extracted into new private runtime directories without installing services or changing system Git. PostgreSQL came from the EDB binary ZIP linked by PostgreSQL. The Git for Windows archive matched the publisher's SHA-256 before extraction. No production capture or restore was used in this proof. [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries), [Git for Windows verified release](https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4)

## Prepared local destination

The authorized operator directory passed owner-only ACL and EFS inheritance checks. The prepared PostgreSQL 18.6 cluster had one listener at `127.0.0.1:55439`, SCRAM-only rules and a SCRAM verifier, and no application databases. A wrong password failed and the protected credential succeeded. The recipient private key rejected an empty passphrase. The transient EFS initialization file was removed and the preparation process cleared both credential environment variables and mutable buffers.

Only `recipient.crt` is intended for upload. Its public SHA-256 is `71c478c863d0f1c334e628cfac7d5e453638fe03a9ffb83b450031e4b42e2a93`. The reserved destination remained empty after preparation. No hosted command or customer data was involved in this proof.

The final restore helper was also verified on a separate synthetic owner-only EFS PostgreSQL 18.6 cluster. It unlocked Windows DPAPI credentials, verified SCRAM and encrypted cleartext staging, restored the synthetic archive with matching aggregates, and cleared its environment. A repeat on the now-populated synthetic cluster was rejected before decryption. The synthetic cluster was stopped.

## Hosted snapshot and candidate rehearsal

The operator captured the hosted PostgreSQL 18 database over its in-service loopback, encrypted the archive before transfer, and restored it in the approved local drill cluster. The local restore matched the snapshot's fixed aggregate counts and exact 29-row migration ledger through `0028`.

An independently reviewed rehearsal compared the restored ledger and original encrypted archive with the pinned candidate SQL before applying anything. It applied the candidate through `0035` using the normal Drizzle migrator and advisory lock on the isolated PostgreSQL 18.6 clone. The resulting ledger matched all 36 pinned timestamps and SQL hashes. Existing counts stayed equal. The expected routine completion backfill added one row, and the other new operational tables remained empty. A second run made no changes. No Tempo app, worker, or provider was connected to the clone.

The encrypted archive and its manifest still match the original capture. The local cluster was stopped and the listener was verified absent. Only the exact transient EFS-protected plaintext archive was retired. The original encrypted archive, manifest, recipient files, Windows DPAPI envelope, and stopped encrypted cluster data were retained.

This proves one recoverable snapshot and candidate migration compatibility on that clone. Scheduled backups and PITR remain unavailable in the observed Railway plan.
