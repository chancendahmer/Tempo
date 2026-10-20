/** Serve the compiled candidate against the existing isolated QA database only. */
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (existsSync(resolve(root, name))) throw new Error(`Refusing automatic environment-file loading: ${name}`);
}
const env = {};
for (const name of ['PATH', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'WINDIR', 'PATHEXT']) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: 'production', APP_BASE_URL: 'http://localhost:3101',
  DATABASE_URL: 'postgresql://postgres@127.0.0.1:55437/tempo_ui_release',
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  LOG_LEVEL: 'warn', NEXT_TELEMETRY_DISABLED: '1',
  AUTONOMOUS_SENDING_ENABLED: 'false', INTERVENTION_SHADOW_MODE: 'true',
});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3101'], {
  cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
console.log(`Compiled QA launcher ${process.pid}; child ${child.pid}; http://localhost:3101`);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('exit', code => { process.exitCode = code ?? 1; });
