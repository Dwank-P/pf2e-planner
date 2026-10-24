import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Small non-secret build summary shared by the boot log and /health. */
export function getBuildInfo() {
  let pkg = { version: 'unknown' };
  try { pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')); } catch {}
  try {
    const data = JSON.parse(readFileSync(resolve('build-info.json'), 'utf8'));
    if (typeof data.version === 'string' &&
        /^[0-9a-f]{16}$/.test(data.sourceFingerprint) &&
        typeof data.builtAt === 'string') {
      return data;
    }
  } catch {}
  return { version: pkg.version, sourceFingerprint: 'dev-unbuilt', builtAt: null };
}
