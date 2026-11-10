const { randomUUID } = require('node:crypto');
const { createWriteStream } = require('node:fs');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

async function main() {
  const name = `tempo_nov10_recovery_${randomUUID().replaceAll('-', '')}_test`;
  if (!/^tempo_nov10_recovery_[a-f0-9]{32}_test$/.test(name)) throw new Error('Invalid fixture name');
  const base = 'postgresql://postgres@127.0.0.1:55437/tempo_ui_release';
  const admin = new Pool({ connectionString: base, max: 1 });
  const log = createWriteStream('qa/pilot-2026-11-10/check-final.log', { flags: 'w' });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const target = new URL(base);
    target.pathname = `/${name}`;
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check'], {
        shell: process.platform === 'win32',
        env: { ...process.env, NEXT_DIST_DIR: '.next-nov10-final', TEST_DATABASE_URL: base,
          TEMPO_RECOVERY_TEST_DATABASE_URL: target.toString() }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
    log.write(`\nCHECK_EXIT_CODE=${exitCode}\n`);
    process.exitCode = exitCode;
    console.log(JSON.stringify({ checkExitCode: exitCode, log: 'qa/pilot-2026-11-10/check-final.log' }));
  } finally {
    if (created) {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      console.log(JSON.stringify({ recoveryFixtureRemoved: true }));
    }
    await admin.end();
    await new Promise(resolve => log.end(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
