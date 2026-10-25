#!/usr/bin/env node
// Release guards: config/manifest/package consistency and registry idempotency.
// Usage: node scripts/release-guard.mjs check            (offline consistency check)
//        node scripts/release-guard.mjs registry <ver>   (prints publish | skip; exits 1 on conflict/error)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

export function checkConsistency(pkg, config, manifest) {
  const errors = [];
  if (pkg.name !== '@doclight/core') errors.push(`unexpected package name ${pkg.name}`);
  if (config['release-type'] !== 'node') errors.push('release-type must be node');
  if (config.packages?.['.']?.['package-name'] !== pkg.name) errors.push('config package-name mismatch');
  if (!manifest['.']) errors.push('manifest missing "."');
  const target = config['release-as'];
  if (target && !/^\d+\.\d+\.\d+$/.test(target)) errors.push(`invalid release-as ${target}`);
  if (pkg.publishConfig?.access !== 'public') errors.push('publishConfig.access must be public');
  return errors;
}

// Returns 'publish' when the version is absent, 'skip' when published with the same integrity.
export async function registryDecision(version, localIntegrity, fetchImpl = fetch) {
  const res = await fetchImpl('https://registry.npmjs.org/@doclight%2fcore');
  if (res.status === 404) return 'publish';
  if (!res.ok) throw new Error(`registry lookup failed: HTTP ${res.status}`);
  const meta = await res.json();
  const published = meta.versions?.[version];
  if (!published) return 'publish';
  if (localIntegrity && published.dist?.integrity !== localIntegrity) {
    throw new Error(`version ${version} already published with different integrity`);
  }
  return 'skip';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, arg, integrity] = process.argv.slice(2);
  if (cmd === 'check') {
    const errors = checkConsistency(
      readJson('package.json'),
      readJson('release-please-config.json'),
      readJson('.release-please-manifest.json'),
    );
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
    console.log('release config consistent');
  } else if (cmd === 'registry' && arg) {
    registryDecision(arg, integrity).then(
      (d) => console.log(d),
      (e) => { console.error(e.message); process.exit(1); },
    );
  } else {
    console.error('usage: release-guard.mjs check | registry <version> [integrity]');
    process.exit(2);
  }
}
