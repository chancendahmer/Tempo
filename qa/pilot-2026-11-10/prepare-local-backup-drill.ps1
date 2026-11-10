param(
  [Parameter(Mandatory)] [string] $ProtectedDirectory,
  [Parameter(Mandatory)] [string] $PostgresBin,
  [Parameter(Mandatory)] [string] $OpenSsl,
  [ValidateRange(49152, 65535)] [int] $Port = 55439
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = (Resolve-Path -LiteralPath $ProtectedDirectory).Path
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $root
$otherAllow = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object {
  $_.AccessControlType -eq 'Allow' -and !$_.IdentityReference.Equals($owner)
})
if (!$acl.AreAccessRulesProtected -or !$acl.GetOwner([Security.Principal.SecurityIdentifier]).Equals($owner) -or $otherAllow.Count) {
  throw 'The backup directory must have an owner-only protected ACL.'
}
function Assert-Encrypted($Path) {
  if (!((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::Encrypted)) {
    throw 'An expected private artifact is missing EFS encryption.'
  }
}
Assert-Encrypted $root
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'The dedicated port is already listening.' }
if ($env:PGPASSWORD -or $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE -or $env:PGHOSTADDR -or $env:PGSERVICE -or $env:PGSERVICEFILE -or $env:PGOPTIONS) {
  throw 'Use a clean local credential environment.'
}
$initdb = Join-Path $PostgresBin 'initdb.exe'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$psql = Join-Path $PostgresBin 'psql.exe'
if ((& $initdb --version) -notmatch '^initdb \(PostgreSQL\) 18\.' -or (& $OpenSsl version) -notmatch '^OpenSSL 3\.') {
  throw 'PostgreSQL 18 and a maintained OpenSSL 3 build are required.'
}

$cert = Join-Path $root 'recipient.crt'
$key = Join-Path $root 'recipient-key.pk8'
$envelope = Join-Path $root 'local-credentials.dpapi'
$data = Join-Path $root 'pg18-drill-data'
$temp = Join-Path $root ('initdb-once-' + [Guid]::NewGuid().ToString('N') + '.tmp')
$certLog = Join-Path $root 'prepare-certificate.log'
$initLog = Join-Path $root 'prepare-initdb.log'
$pgLog = Join-Path $root 'pg18-drill.log'
$startOut = Join-Path $root 'pg18-drill-start.stdout'
$startErr = Join-Path $root 'pg18-drill-start.stderr'
foreach ($file in @($cert,$key,$envelope,$data,$temp,$certLog,$initLog,$pgLog,$startOut,$startErr)) {
  if (Test-Path -LiteralPath $file) { throw 'A preparation target already exists.' }
}
$seed = [Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
$entropy = [Text.Encoding]::UTF8.GetBytes('tempo-local-backup-drill-v1')
$passwordBytes = $null
$wrapped = $null
try {
  $wrapped = [Security.Cryptography.ProtectedData]::Protect($seed, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $output = [IO.File]::Open($envelope, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $output.Write($wrapped, 0, $wrapped.Length) } finally { $output.Dispose() }
  Assert-Encrypted $envelope
  $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE = [Convert]::ToBase64String($seed, 32, 32)
  try {
    & $OpenSsl req -x509 -newkey rsa:3072 -sha256 -days 7 -subj '/CN=Tempo backup transfer' -passout env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE -keyout $key -out $cert *> $certLog
    if ($LASTEXITCODE -ne 0) { throw 'Certificate creation failed.' }
    Assert-Encrypted $key
    Assert-Encrypted $cert
    & $OpenSsl pkey -in $key -passin env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE -noout -check *> $null
    if ($LASTEXITCODE -ne 0) { throw 'The encrypted recipient key failed validation.' }
    & $OpenSsl pkey -in $key -passin pass: -noout -check *> $null
    if ($LASTEXITCODE -eq 0) { throw 'The recipient key unexpectedly accepted an empty passphrase.' }
  } finally { $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE = $null }
  $stream = [IO.File]::Open($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $stream.Dispose()
  try {
    Assert-Encrypted $temp
    $passwordBytes = [Text.Encoding]::ASCII.GetBytes([Convert]::ToBase64String($seed, 0, 32) + [char]10)
    [IO.File]::WriteAllBytes($temp, $passwordBytes)
    [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
    $passwordBytes = $null
    & $initdb "--pgdata=$data" --username=postgres --auth=scram-sha-256 --encoding=UTF8 --no-locale "--pwfile=$temp" *> $initLog
    if ($LASTEXITCODE -ne 0) { throw 'Local authenticated PostgreSQL initialization failed.' }
  } finally {
    if ((Split-Path -Parent $temp) -ne $root) { throw 'Unexpected temporary credential path.' }
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
  Assert-Encrypted $data
  Assert-Encrypted (Join-Path $data 'PG_VERSION')

  $startArgs = @('-D', ('"' + $data + '"'), '-l', ('"' + $pgLog + '"'), '-o', ('"-h 127.0.0.1 -p ' + $Port + '"'), '-w', 'start')
  $process = Start-Process -FilePath $pgCtl -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $startOut -RedirectStandardError $startErr
  if (!$process.WaitForExit(30000) -or $process.ExitCode -ne 0) { throw 'Dedicated PostgreSQL did not start successfully.' }
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen)
  if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'The dedicated listener must bind only to loopback.' }

  $connection = @('-h', '127.0.0.1', '-p', [string]$Port, '-U', 'postgres', '-d', 'postgres', '-XAtw', '-v', 'ON_ERROR_STOP=1')
  $env:PGPASSWORD = 'tempo-incorrect-probe'
  & $psql @connection -c 'select 1' *> $null
  if ($LASTEXITCODE -eq 0) { throw 'PostgreSQL accepted an incorrect password.' }
  $env:PGPASSWORD = [Convert]::ToBase64String($seed, 0, 32)
  $proofSql = "select json_build_object('major', current_setting('server_version_num')::int / 10000, 'loopbackOnly', current_setting('listen_addresses') = '127.0.0.1' and inet_server_addr() = inet '127.0.0.1', 'scramRules', (select bool_and(auth_method = 'scram-sha-256' and error is null) from pg_hba_file_rules), 'scramVerifier', exists (select 1 from pg_authid where rolname = 'postgres' and left(rolpassword,14) = 'SCRAM-SHA-256$'), 'fresh', not exists (select 1 from pg_database where not datistemplate and datname <> 'postgres'))"
  $proof = & $psql @connection -c $proofSql 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL authentication proof failed.' }
  $verified = $proof | ConvertFrom-Json
  if ($verified.major -ne 18 -or !$verified.loopbackOnly -or !$verified.scramRules -or !$verified.scramVerifier -or !$verified.fresh) {
    throw 'PostgreSQL did not satisfy the isolation and SCRAM checks.'
  }
  [ordered]@{
    ok = $true
    publicCertificate = $cert
    publicCertificateSha256 = (Get-FileHash -LiteralPath $cert -Algorithm SHA256).Hash.ToLowerInvariant()
    endpoint = "127.0.0.1:$Port"
    serverMajor = $verified.major
    loopbackOnly = $verified.loopbackOnly
    scram = $verified.scramRules
    fresh = $verified.fresh
  } | ConvertTo-Json -Compress
} finally {
  $env:PGPASSWORD = $null
  $env:TEMPO_LOCAL_BACKUP_KEY_PASSPHRASE = $null
  if ($passwordBytes) { [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
  if ($wrapped) { [Array]::Clear($wrapped, 0, $wrapped.Length) }
  [Array]::Clear($seed, 0, $seed.Length)
}
