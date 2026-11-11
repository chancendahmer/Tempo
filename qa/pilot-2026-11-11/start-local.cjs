/** Serve the candidate against the disposable local fixture; no production secrets. */
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (existsSync(resolve(root, name))) throw new Error('Refusing automatic environment-file loading.');
}
const env = {};
for (const name of ['PATH', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'WINDIR', 'PATHEXT']) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: 'development', NEXT_DIST_DIR: '.next-checkins-dev', NEXT_TELEMETRY_DISABLED: '1',
  APP_BASE_URL: 'http://localhost:3103', DATABASE_URL: 'postgresql://postgres@127.0.0.1:55437/tempo_ui_release',
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LOG_LEVEL: 'warn',
  AUTONOMOUS_SENDING_ENABLED: 'false', INTERVENTION_SHADOW_MODE: 'true', CLEANUP_CHECKINS_ENABLED: 'false',
});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3103'], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
console.log(`Local candidate child ${child.pid}; no provider credentials or worker.`);
child.on('exit', code => { process.exitCode = code ?? 1; });
