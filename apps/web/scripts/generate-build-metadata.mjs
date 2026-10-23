/**
 * Produce a build identifier derived from website source files, not Docker's cache.
 * Invoked AFTER the production build. The fingerprint changes when website source
 * changes, even when a git checkout/Portainer build context has no .git directory.
 * It is not a Git commit SHA.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceFiles = [
  'Dockerfile',
  'package.json',
  'vite.config.ts'
];
for (const dir of ['src', 'scripts']) {
  const pending = [join(root, dir)];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile()) sourceFiles.push(relative(root, file));
    }
  }
}
const digest = createHash('sha256');
for (const path of sourceFiles.sort()) {
  digest.update(path).update('\0').update(readFileSync(join(root, path))).update('\0');
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const metadata = {
  version: pkg.version,
  sourceFingerprint: digest.digest('hex').slice(0, 16),
  builtAt: new Date().toISOString()
};
writeFileSync(join(root, 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log('[PF2e Planner build] ' +
  'v' + metadata.version + ' source ' + metadata.sourceFingerprint + ' built ' + metadata.builtAt);
