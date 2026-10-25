import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { checkConsistency, registryDecision } from '../scripts/release-guard.mjs';

const pkg = { name: '@doclight/core', publishConfig: { access: 'public' } };
const config = { 'release-type': 'node', 'release-as': '0.2.0', packages: { '.': { 'package-name': '@doclight/core' } } };
const res = (status: number, body: unknown = {}) => async () =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

describe('release guard', () => {
  it('accepts consistent config', () => {
    expect(checkConsistency(pkg, config, { '.': '0.1.1' })).toEqual([]);
  });
  it('rejects bad release-as and name mismatch', () => {
    expect(checkConsistency(pkg, { ...config, 'release-as': 'x' }, { '.': '0.1.1' }).length).toBe(1);
    expect(checkConsistency({ ...pkg, name: 'other' }, config, { '.': '0.1.1' }).length).toBeGreaterThan(0);
  });
  it('publishes when version absent, skips when identical, fails on conflict/outage', async () => {
    expect(await registryDecision('0.2.0', 'a', res(404))).toBe('publish');
    expect(await registryDecision('0.2.0', 'a', res(200, { versions: { '0.1.0': {} } }))).toBe('publish');
    const meta = { versions: { '0.2.0': { dist: { integrity: 'a' } } } };
    expect(await registryDecision('0.2.0', 'a', res(200, meta))).toBe('skip');
    await expect(registryDecision('0.2.0', 'b', res(200, meta))).rejects.toThrow(/different integrity/);
    await expect(registryDecision('0.2.0', 'a', res(503))).rejects.toThrow(/HTTP 503/);
  });
});
