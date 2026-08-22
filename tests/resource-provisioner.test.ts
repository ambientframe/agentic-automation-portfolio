import { describe, expect, it } from 'vitest';
import {
  FixtureResourceProvisioner,
  resolveProvision,
  type ProvisionOutcome,
  type ProvisionRequest,
} from '@/lib/ports/resource-provisioner';

function request(overrides: Partial<ProvisionRequest> = {}): ProvisionRequest {
  return {
    attemptId: 'attempt-1',
    resourceKey: 'onboarding:eng-1:workspace',
    resourceType: 'workspace',
    desiredStateFingerprint: 'fingerprint-a',
    provider: 'workspace-provider',
    description: 'Create the workspace.',
    ...overrides,
  };
}

describe('ResourceProvisioner port', () => {
  it('declares itself simulated, so the UI can never present it as live', () => {
    const provisioner = new FixtureResourceProvisioner();
    expect(provisioner.mode).toBe('SIMULATED');
    expect(provisioner.description).toContain('No external system is called');
  });

  it('creates a resource on the first ensure() and never fabricates an external id', async () => {
    const provisioner = new FixtureResourceProvisioner();
    const resolved = await resolveProvision(provisioner, request());
    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK') {
      expect(resolved.result.kind).toBe('CREATED');
      if (resolved.result.kind === 'CREATED') expect(resolved.result.externalId).toBeUndefined();
    }
  });

  it('assigns the configured external id, and only that one, when the fixture supplies it', async () => {
    const provisioner = new FixtureResourceProvisioner({}, { 'attempt-1': 'ws_abc123' });
    const resolved = await resolveProvision(provisioner, request());
    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK' && resolved.result.kind === 'CREATED') {
      expect(resolved.result.externalId).toBe('ws_abc123');
    }
  });

  it('recognises a second ensure() with the same identity and fingerprint as already matching, not a new creation', async () => {
    const provisioner = new FixtureResourceProvisioner();
    const first = await provisioner.ensure(request({ attemptId: 'attempt-1' }));
    expect(first.kind).toBe('CREATED');

    const second = await provisioner.ensure(request({ attemptId: 'attempt-2' }));
    expect(second.kind).toBe('ALREADY_EXISTS_MATCHING');
  });

  it('genuinely compares desired state — a different fingerprint at the same identity is a real conflict, not a narrated one', async () => {
    const provisioner = new FixtureResourceProvisioner();
    await provisioner.ensure(request({ attemptId: 'attempt-1', desiredStateFingerprint: 'fingerprint-a' }));

    const conflict = await provisioner.ensure(
      request({ attemptId: 'attempt-2', desiredStateFingerprint: 'fingerprint-b' }),
    );
    expect(conflict.kind).toBe('EXISTS_DIFFERENT');
    if (conflict.kind === 'EXISTS_DIFFERENT') {
      expect(conflict.existingStateFingerprint).toBe('fingerprint-a');
    }
  });

  it('seeds pre-existing resources so a scenario can start from an already-provisioned state', async () => {
    const provisioner = new FixtureResourceProvisioner({
      'onboarding:eng-1:workspace': { fingerprint: 'fingerprint-a', externalId: 'ws_preexisting' },
    });
    const resolved = await provisioner.ensure(request({ desiredStateFingerprint: 'fingerprint-a' }));
    expect(resolved.kind).toBe('ALREADY_EXISTS_MATCHING');
    if (resolved.kind === 'ALREADY_EXISTS_MATCHING') expect(resolved.externalId).toBe('ws_preexisting');
  });

  it('applies a forced outcome for one attempt without disturbing real reconcile logic for another', async () => {
    const provisioner = new FixtureResourceProvisioner(
      {},
      {},
      { 'attempt-fail': { kind: 'FAILED_BEFORE_EFFECT', reason: 'quota exceeded' } },
    );
    const failed = await provisioner.ensure(request({ attemptId: 'attempt-fail' }));
    expect(failed.kind).toBe('FAILED_BEFORE_EFFECT');

    const created = await provisioner.ensure(request({ attemptId: 'attempt-real', resourceKey: 'onboarding:eng-1:task-list' }));
    expect(created.kind).toBe('CREATED');
  });

  it('converts every provider failure into data rather than throwing at the caller', async () => {
    const throwing = {
      id: 'broken',
      mode: 'SIMULATED' as const,
      description: 'always throws',
      ensure: async () => {
        throw new Error('provisioner unreachable');
      },
    };
    const resolved = await resolveProvision(throwing, request());
    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') expect(resolved.reason).toBe('provisioner unreachable');
  });

  it('refuses an outcome that fails its own schema rather than passing it through', async () => {
    const malformed = {
      id: 'malformed',
      mode: 'SIMULATED' as const,
      description: 'returns garbage',
      ensure: async () => ({ kind: 'CREATED', externalId: '' }) as unknown as ProvisionOutcome,
    };
    const resolved = await resolveProvision(malformed, request());
    expect(resolved.status).toBe('CONTRACT_VIOLATION');
  });

  it('keeps ensure() asynchronous, so a live provisioner can satisfy the same contract unchanged', () => {
    const provisioner = new FixtureResourceProvisioner();
    expect(provisioner.ensure(request())).toBeInstanceOf(Promise);
  });
});
