param(
  [Parameter(Mandatory)] [string] $PostgresBin,
  [Parameter(Mandatory)] [string] $ExpectedDataDirectory,
  [Parameter(Mandatory)] [ValidateRange(49152, 65535)] [int] $Port,
  [Parameter(Mandatory)] [string] $OpenSsl,
  [Parameter(Mandatory)] [string] $RecipientCertificate,
  [Parameter(Mandatory)] [string] $LocalPrivateKey,
  [Parameter(Mandatory)] [string] $PrivateWorkDirectory,
  [switch] $UseLocalProtectedCredentials
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
# The operator supplies an owner-only encrypted directory outside this repo.
$private = (Resolve-Path -LiteralPath $PrivateWorkDirectory).Path
$archive = Join-Path $private 'backup.cms'
$manifestPath = Join-Path $private 'manifest.json'
$plain = Join-Path $private 'restore-verified.dump'
$log = Join-Path $private 'restore-drill.stderr'
if ((Test-Path -LiteralPath $plain) -or (Test-Path -LiteralPath $log)) {
  throw 'Use a fresh private work directory.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.sourceMajor -ne 18 -or $manifest.archiveSha256 -notmatch '^[0-9a-f]{64}$') {
  throw 'The manifest must match the PostgreSQL 18 drill.'
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $manifest.archiveSha256) {
  throw 'The encrypted archive checksum does not match.'
}
if ($env:PGHOSTADDR -or $env:PGSERVICE -or $env:PGSERVICEFILE -or $env:PGOPTIONS) {
  throw 'Use a clean local shell without libpq host or service overrides.'
}
$client = Join-Path $PostgresBin 'psql.exe'
$restore = Join-Path $PostgresBin 'pg_restore.exe'
$createDb = Join-Path $PostgresBin 'createdb.exe'
if ((& $restore --version) -notmatch '^pg_restore \(PostgreSQL\) 18\.') {
  throw 'Use PostgreSQL 18 client tools.'
}
if ((& $OpenSsl version) -notmatch '^OpenSSL 3\.') {
  throw 'Use a maintained OpenSSL 3 build.'
}
$connection = @('--host=127.0.0.1', "--port=$Port", '--username=postgres')
function Restore-VerifiedArchive {
  $proofSql = "select json_build_object('major', current_setting('server_version_num')::int / 10000, 'dir', current_setting('data_directory'), 'loopbackOnly', current_setting('listen_addresses') = '127.0.0.1' and inet_server_addr() = inet '127.0.0.1', 'fresh', not exists (select 1 from pg_database where not datistemplate and datname <> 'postgres'), 'exclusive', not exists (select 1 from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid()), 'scram', (select bool_and(auth_method = 'scram-sha-256' and error is null) from pg_hba_file_rules))"
  $proof = & $client @connection -XAt --set=ON_ERROR_STOP=1 --dbname=postgres --command=$proofSql 2> $log
  if ($LASTEXITCODE -ne 0) { throw 'Could not confirm the dedicated local PostgreSQL instance.' }
  $instance = $proof | ConvertFrom-Json
  $expected = (Resolve-Path -LiteralPath $ExpectedDataDirectory).Path
  if ($instance.major -ne 18 -or !$instance.loopbackOnly -or !$instance.fresh -or !$instance.exclusive -or
      ($UseLocalProtectedCredentials -and !$instance.scram) -or [IO.Path]::GetFullPath($instance.dir) -ne $expected) {
    throw 'The destination must be the fresh, idle loopback PostgreSQL 18 instance.'
  }

  # Verify the authentication tag before giving any cleartext to pg_restore.
  # A failed decrypt can create a partial file. Leave it private for operator cleanup.
  $decrypt = @('cms', '-decrypt', '-binary', '-inform', 'DER', '-in', $archive, '-recip', $RecipientCertificate, '-inkey', $LocalPrivateKey, '-out', $plain)
  if ($UseLocalProtectedCredentials) {
    $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE = [Convert]::ToBase64String($credentials, 32, 32)
    try {
      & $OpenSsl @decrypt -passin env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE 2>> $log
      if ($LASTEXITCODE -ne 0) { throw 'Archive authentication or decryption failed.' }
    } finally { $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE = $null }
  } else {
    & $OpenSsl @decrypt
    if ($LASTEXITCODE -ne 0) { throw 'Archive authentication or decryption failed.' }
  }
  if ($UseLocalProtectedCredentials -and !((Get-Item -LiteralPath $plain).Attributes -band [IO.FileAttributes]::Encrypted)) {
    throw 'The decrypted archive is missing required EFS protection.'
  }
  $magic = [byte[]]::new(5)
  $stream = [IO.File]::OpenRead($plain)
  try { $headerLength = $stream.Read($magic, 0, $magic.Length) }
  finally { $stream.Dispose() }
  if ($headerLength -ne 5 -or [Text.Encoding]::ASCII.GetString($magic) -ne 'PGDMP') {
    throw 'The decrypted payload has no PostgreSQL custom archive header.'
  }
  & $restore --list $plain 2>> $log | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The decrypted archive is unreadable.' }

  $target = 'tempo_restore_' + [Guid]::NewGuid().ToString('N') + '_drill'
  if ($target -notmatch '^tempo_restore_[a-f0-9]{32}_drill$') { throw 'Unexpected local target.' }
  & $createDb @connection --maintenance-db=postgres --template=template0 $target 2>> $log
  if ($LASTEXITCODE -ne 0) { throw 'A fresh isolated restore database could not be created.' }
  & $restore @connection --dbname=$target --exit-on-error --single-transaction --no-owner --no-privileges --no-publications --no-subscriptions $plain 2>> $log
  if ($LASTEXITCODE -ne 0) { throw 'The isolated restore failed. Inspect protected diagnostics privately.' }

  $fingerprintSql = Join-Path $PSScriptRoot 'backup-fingerprint.sql'
  $restoredJson = & $client @connection -XAt --set=ON_ERROR_STOP=1 --dbname=$target --file=$fingerprintSql 2>> $log
  if ($LASTEXITCODE -ne 0) { throw 'The restored snapshot fingerprint could not be computed.' }
  $actual = $restoredJson | ConvertFrom-Json
  $fields = @('ledgerRows', 'ledgerSha256', 'users', 'consentRecords', 'conversationMessages', 'providerMessageBindings', 'goals', 'tasks', 'reminders', 'scheduledActions', 'queueJobs')
  foreach ($field in $fields) {
    if ($null -eq $manifest.fingerprint.$field -or $actual.$field -ne $manifest.fingerprint.$field) {
      throw 'The restored migration ledger or fixed aggregate counts differ from the exported snapshot.'
    }
  }
  [ordered]@{
    ok = $true
    localPostgresMajor = 18
    migrationLedgerRows = $actual.ledgerRows
    exactSnapshotAggregateMatch = $true
    localRestoreDatabase = $target
  } | ConvertTo-Json -Compress
}

$credentials = $null
$wrapped = $null
$ownsEnvironment = $false
try {
  if ($UseLocalProtectedCredentials) {
    if (!$IsWindows -or $env:PGPASSWORD -or $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE) {
      throw 'Use a clean local Windows credential environment.'
    }
    $credentialRoot = Split-Path -Parent (Resolve-Path -LiteralPath $LocalPrivateKey).Path
    $envelope = Join-Path $credentialRoot 'local-credentials.dpapi'
    $credentialAcl = Get-Acl -LiteralPath $credentialRoot
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $otherAllow = @($credentialAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object {
      $_.AccessControlType -eq 'Allow' -and !$_.IdentityReference.Equals($owner)
    })
    $expectedData = (Resolve-Path -LiteralPath $ExpectedDataDirectory).Path
    if (!$credentialAcl.AreAccessRulesProtected -or !$credentialAcl.GetOwner([Security.Principal.SecurityIdentifier]).Equals($owner) -or $otherAllow.Count -or
        $expectedData -ne (Join-Path $credentialRoot 'pg18-drill-data') -or
        ($private -ne $credentialRoot -and (Split-Path -Parent $private) -ne $credentialRoot)) {
      throw 'The restore paths must stay in the owner-only backup directory.'
    }
    foreach ($path in @($credentialRoot,$private,$envelope,$LocalPrivateKey,$archive,$manifestPath,$expectedData)) {
      $attributes = (Get-Item -LiteralPath $path -Force).Attributes
      if (!($attributes -band [IO.FileAttributes]::Encrypted) -or ($attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The restore requires EFS-protected files and direct paths.'
      }
    }
    $wrapped = [IO.File]::ReadAllBytes($envelope)
    $entropy = [Text.Encoding]::UTF8.GetBytes('tempo-local-backup-drill-v1')
    try { $credentials = [Security.Cryptography.ProtectedData]::Unprotect($wrapped, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser) }
    catch { throw 'Windows could not unlock the local drill credentials.' }
    if ($credentials.Length -ne 64) { throw 'The local drill credentials have an unexpected format.' }
    $ownsEnvironment = $true
    $env:PGPASSWORD = [Convert]::ToBase64String($credentials, 0, 32)
  }
  Restore-VerifiedArchive
} finally {
  if ($ownsEnvironment) {
    $env:PGPASSWORD = $null
    $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE = $null
  }
  if ($credentials) { [Array]::Clear($credentials, 0, $credentials.Length) }
  if ($wrapped) { [Array]::Clear($wrapped, 0, $wrapped.Length) }
}
