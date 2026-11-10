/** Loopback3199 only. No outbound code; accepts only this rehearsal's two fictional contacts. */
const http = require('node:http');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'rehearsal.json'), 'utf8'));
if (manifest.origin !== 'http://localhost:3103' || manifest.numbers?.length !== 2 || new Set(manifest.numbers).size !== 2 || !manifest.numbers.every(value => /^\+120255501[0-8]\d$/.test(value) && value !== '+12025550111')) throw new Error('Invalid synthetic rehearsal manifest');
const allowed = new Set(manifest.numbers);
const counts = { syntheticOnly: true, acceptedContacts: 0, rejectedRequests: 0 };
function record() {
  writeFileSync(resolve(__dirname, 'signup-stub-counts.json'), JSON.stringify(counts, null, 2));
  console.log(JSON.stringify(counts));
}
const server = http.createServer(async (request, response) => {
  const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
  const reject = status => { counts.rejectedRequests++; record(); reply(status, { error: 'Local synthetic rehearsal request rejected' }); };
  if (request.method !== 'POST' || request.url !== '/v3/verified-contacts') return reject(404);
  if (request.headers['sb-api-key-id'] !== 'local-qa-placeholder' || request.headers['sb-api-secret-key'] !== 'local-qa-placeholder') return reject(401);
  let raw = '';
  try {
    for await (const chunk of request) {
      raw += chunk.toString('utf8');
      if (Buffer.byteLength(raw) > 2048) return reject(413);
    }
    const body = JSON.parse(raw);
    if (!body || Object.keys(body).length !== 1 || !allowed.has(body.phone_number)) return reject(400);
    counts.acceptedContacts++; record();
    reply(200, { status: 'OK', data: { contact: { phone_number: body.phone_number, verification_status: 'pending', verified: false }, line: { phone_number: '+12025550111', type: 'shared' } } });
  } catch { reject(400); }
});
server.listen(3199, '127.0.0.1', () => { record(); console.log(`Synthetic rehearsal stub PID ${process.pid}; 127.0.0.1:3199 only`); });
server.on('error', () => { console.error('Synthetic loopback3199 stub could not start'); process.exitCode = 1; });
