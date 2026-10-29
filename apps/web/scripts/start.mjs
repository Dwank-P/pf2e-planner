import { getBuildInfo } from '../src/lib/server/version.js';

const info = getBuildInfo();
const host = process.env.HOST || '0.0.0.0';
const port = process.env.PORT || '3000';
const bindIp = process.env.PLANNER_BIND_IP || '127.0.0.1';

console.info('[PF2e Planner] -------------------------------------------------');
console.info('[PF2e Planner] Starting web v' + info.version);
console.info('[PF2e Planner] Source fingerprint: ' + info.sourceFingerprint +
  ' (not a Git SHA)');
console.info('[PF2e Planner] Image built at: ' + (info.builtAt || 'unknown'));
console.info('[PF2e Planner] Container listening: ' + host + ':' + port);
console.info('[PF2e Planner] Requested Docker host port: ' + bindIp + ':3000 -> ' + port);
console.info('[PF2e Planner] Public origin: ' + (process.env.PUBLIC_ORIGIN || '(unset)'));
console.info('[PF2e Planner] Confirm actual host publishing with: docker ps / docker inspect');
console.info('[PF2e Planner] Health endpoint: /health');
console.info('[PF2e Planner] -------------------------------------------------');

await import('../build/index.js');
