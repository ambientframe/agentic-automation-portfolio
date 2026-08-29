import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DATA_ROOT_ENV_VAR, resolveDataRootSelection } from '@/lib/config/data-root';

/**
 * The store root was four copies of `path.join(process.cwd(), '.data', …)`, which is a fact
 * about the machine the code was written on wearing the costume of a constant. On a host whose
 * working directory is read-only (the deployed serverless runtime), every write path returned
 * a bare 500 to exactly the actions the page invites — verified against the live instance
 * 2026-08-28. The root is now resolved once, configurably, and fails closed on a value that
 * would silently re-derive from the working directory.
 */
describe('resolveDataRootSelection', () => {
  it('defaults to .data under the working directory when nothing is configured', () => {
    const selection = resolveDataRootSelection({}, '/somewhere/checkout');
    expect(selection.root).toBe(path.join('/somewhere/checkout', '.data'));
    expect(selection.source).toBe('DEFAULT_WORKING_DIRECTORY');
  });

  it('treats an empty or whitespace-only value as unconfigured, not as a root', () => {
    for (const value of ['', '   ']) {
      const selection = resolveDataRootSelection({ [DATA_ROOT_ENV_VAR]: value }, '/somewhere/checkout');
      expect(selection.root).toBe(path.join('/somewhere/checkout', '.data'));
      expect(selection.source).toBe('DEFAULT_WORKING_DIRECTORY');
    }
  });

  it('uses a configured absolute root verbatim and reports the source as CONFIGURED', () => {
    const selection = resolveDataRootSelection({ [DATA_ROOT_ENV_VAR]: '/tmp/portfolio-data' }, '/somewhere/checkout');
    expect(selection.root).toBe('/tmp/portfolio-data');
    expect(selection.source).toBe('CONFIGURED');
  });

  it('refuses a relative root rather than resolving it against the working directory', () => {
    // A relative value would re-create the exact defect this module exists to end: the
    // effective root silently depending on whatever working directory the process happens
    // to have. Misconfiguration fails closed, loudly, at composition time.
    expect(() => resolveDataRootSelection({ [DATA_ROOT_ENV_VAR]: 'relative/.data' }, '/somewhere/checkout')).toThrow(
      DATA_ROOT_ENV_VAR,
    );
  });
});

describe('every persistence root derives from the one resolved data root', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('all four store locations follow a configured root', async () => {
    const configuredRoot = path.join(os.tmpdir(), 'portfolio-data-root-test');
    vi.stubEnv(DATA_ROOT_ENV_VAR, configuredRoot);
    vi.resetModules();

    const waitRuntime = await import('@/lib/engine/lead-rescue-wait-runtime');
    const journal = await import('@/lib/observability/lead-rescue-journal');

    expect(waitRuntime.LEAD_RESCUE_WAIT_STORE_PATH).toBe(path.join(configuredRoot, 'lead-rescue-wait-incidents.json'));
    expect(waitRuntime.LEAD_RESCUE_CLAIM_STORE_DIR).toBe(path.join(configuredRoot, 'lead-rescue-operation-claims'));
    expect(journal.LEAD_RESCUE_JOURNAL_DIR).toBe(path.join(configuredRoot, 'lead-rescue-execution-journal'));
    expect(journal.LEAD_RESCUE_OBSERVATION_INTENT_DIR).toBe(
      path.join(configuredRoot, 'lead-rescue-observation-intents'),
    );
  });

  it('all four store locations sit under cwd/.data when nothing is configured', async () => {
    vi.stubEnv(DATA_ROOT_ENV_VAR, '');
    vi.resetModules();

    const defaultRoot = path.join(process.cwd(), '.data');
    const waitRuntime = await import('@/lib/engine/lead-rescue-wait-runtime');
    const journal = await import('@/lib/observability/lead-rescue-journal');

    expect(waitRuntime.LEAD_RESCUE_WAIT_STORE_PATH).toBe(path.join(defaultRoot, 'lead-rescue-wait-incidents.json'));
    expect(waitRuntime.LEAD_RESCUE_CLAIM_STORE_DIR).toBe(path.join(defaultRoot, 'lead-rescue-operation-claims'));
    expect(journal.LEAD_RESCUE_JOURNAL_DIR).toBe(path.join(defaultRoot, 'lead-rescue-execution-journal'));
    expect(journal.LEAD_RESCUE_OBSERVATION_INTENT_DIR).toBe(
      path.join(defaultRoot, 'lead-rescue-observation-intents'),
    );
  });
});
