/** Starts only the isolated local candidate. No populated environment files exist in this worktree. */
const { spawn } = require('node:child_process');
const { existsSync, createWriteStream } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
for (const filename of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (existsSync(resolve(root, filename))) throw new Error(`Refusing automatic environment-file loading: ${filename}`);
}
const env = {};
for (const name of ['PATH', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'WINDIR', 'PATHEXT']) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: 'development', APP_BASE_URL: 'http://localhost:3101',
  DATABASE_URL: 'postgresql://postgres@127.0.0.1:55437/tempo_ui_release',
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  LOG_LEVEL: 'warn', NEXT_TELEMETRY_DISABLED: '1',
  AUTONOMOUS_SENDING_ENABLED: 'false', INTERVENTION_SHADOW_MODE: 'true',
});
if (process.argv.includes('--signup-stub')) {
  Object.assign(env, {
    MESSAGING_PROVIDER: 'sendblue',
    SENDBLUE_API_BASE_URL: 'http://127.0.0.1:3199',
    SENDBLUE_API_KEY: 'local-qa-placeholder',
    SENDBLUE_API_SECRET: 'local-qa-placeholder',
    SENDBLUE_PHONE_NUMBER: '+12025550111',
    SENDBLUE_ONBOARDING_MODE: 'shared',
  });
}
const output = createWriteStream(resolve(__dirname, 'candidate-server.log'), { flags: 'a' });
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3101'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
console.log(`Isolated Next launcher PID ${process.pid}; child PID ${child.pid}; http://localhost:3101`);
child.stdout.on('data', chunk => { process.stdout.write(chunk); output.write(chunk); });
child.stderr.on('data', chunk => { process.stderr.write(chunk); output.write(chunk); });
child.on('exit', code => { output.end(); process.exitCode = code ?? 1; });
