import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ALL_PROFILES } from '@/data/profiles';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { MERIDIAN } from '@/data/profiles/meridian/profile';
import {
  BusinessProfileSchema,
  PROFILE_ENGINE_CONTRACT,
  validateProfileConsistency,
  type BusinessProfile,
} from '@/lib/model/profile';
import { RUNNABLE_SYSTEMS, findRunnableScenario } from '@/lib/engine/registry';
import { runScenario } from '@/lib/engine/run';
import type { EngineRun } from '@/lib/engine/types';
import type { Scenario } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';
import { FixtureResourceProvisioner } from '@/lib/ports/resource-provisioner';

/**
 * THE SWAP TEST.
 *
 * `tests/seam.test.ts` proves that a list of remembered Kestrel terms is absent from
 * `data/systems/**`. That is a blacklist. It can only ever prove that the vocabulary
 * somebody thought of is missing — it cannot prove a second profile is POSSIBLE, and for
 * as long as one profile existed, the retargetability claim in `lib/model/profile.ts`
 * ("retargeting ... should be a matter of authoring a second profile") was asserted and
 * never exercised.
 *
 * This file exercises it. A second profile runs the same six systems, on the same engine,
 * through the same handlers, against the same authored scenarios.
 *
 * WHAT THIS PROVES: the engine and the six handler sets are generic over
 * `BusinessProfile`. Nothing in the execution path needs editing to run a different
 * business.
 *
 * WHAT THIS DOES NOT PROVE:
 *   - that Meridian is presentable. It is a STRUCTURAL FIXTURE, not a demonstration
 *     business, and is deliberately not registered in `RUNNABLE_SYSTEMS` or rendered.
 *   - that scenario NARRATIVE is profile-agnostic. It is not, by design: scenario prose
 *     belongs to the profile that authored it. Running Kestrel's scenarios under Meridian
 *     is a structural exercise of the engine, not a coherent second demonstration.
 *   - that a real business's data would flow through. Every input here is authored.
 */

// ---------------------------------------------------------------------------
// The contract is declared, and cannot silently drift
// ---------------------------------------------------------------------------

const LIB_DIR = join(process.cwd(), 'lib');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Every `numberParam(<anything>, '<key>')` call site under `lib/`, whatever it names its profile. */
function engineReadKeys(): Set<string> {
  const pattern = /numberParam\(\s*[A-Za-z_$][\w.$]*\s*,\s*'([^']+)'/g;
  const keys = new Set<string>();
  for (const file of sourceFiles(LIB_DIR)) {
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(pattern)) {
      const key = match[1];
      if (key !== undefined) keys.add(key);
    }
  }
  return keys;
}

describe('the profile/engine contract is declared', () => {
  it('declares every operating parameter the engine reads', () => {
    const read = [...engineReadKeys()].sort();
    const declared = [...PROFILE_ENGINE_CONTRACT].sort();
    const undeclared = read.filter((k) => !declared.includes(k));

    expect(
      undeclared,
      `the engine reads operating parameters that PROFILE_ENGINE_CONTRACT does not list: ${undeclared.join(', ')}. ` +
        'A profile author cannot discover these without crashing into them one at a time — add them to the contract.',
    ).toEqual([]);
  });

  it('lists no parameter the engine never reads', () => {
    const read = engineReadKeys();
    const phantom = [...PROFILE_ENGINE_CONTRACT].filter((k) => !read.has(k));

    expect(
      phantom,
      `PROFILE_ENGINE_CONTRACT requires parameters nothing reads: ${phantom.join(', ')}. ` +
        'A required threshold that governs nothing is a claim the engine does not honour.',
    ).toEqual([]);
  });

  /**
   * Only literal keys are visible to a source scan. A `numberParam(profile, someVariable)`
   * would pass this file unnoticed, so the scan is paired with the per-profile completeness
   * check below: a key the contract missed still throws at runtime under BOTH profiles.
   */
  it('finds the call sites it claims to scan', () => {
    expect(engineReadKeys().size).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Both profiles satisfy it
// ---------------------------------------------------------------------------

/**
 * Derived from the register, never listed literally. A profile added to `data/profiles/index.ts`
 * is held to the contract from the moment it is registered — the failure mode of a literal list
 * is a new profile nobody remembered to add, which is then checked by nothing and passes.
 */
const PROFILES: readonly (readonly [string, BusinessProfile])[] = ALL_PROFILES.map(
  (p) => [p.id, p] as const,
);

describe.each(PROFILES)('profile %s', (name, profile) => {
  it('parses against the schema', () => {
    expect(() => BusinessProfileSchema.parse(profile)).not.toThrow();
  });

  it('is internally consistent', () => {
    expect(validateProfileConsistency(profile), `${name} contradicts itself`).toEqual([]);
  });

  it('declares every parameter in the contract', () => {
    const declared = new Set(profile.operatingParameters.map((p) => p.key));
    const missing = [...PROFILE_ENGINE_CONTRACT].filter((k) => !declared.has(k));
    expect(missing, `${name} is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares no parameter outside the contract', () => {
    const extra = profile.operatingParameters
      .map((p) => p.key)
      .filter((k) => !PROFILE_ENGINE_CONTRACT.includes(k));
    expect(
      extra,
      `${name} declares thresholds the engine never reads: ${extra.join(', ')}. ` +
        'Each renders as a governing policy a visitor can ask "why this number?" about, and the answer would describe a rule nothing applies.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The swap is not vacuous
// ---------------------------------------------------------------------------

/** Kestrel vocabulary, mirrored from `tests/seam.test.ts`. A second profile sharing it would prove nothing. */
const KESTREL_VOCABULARY = [
  'kestrel',
  'soc 2',
  'iso 27001',
  'trust service',
  'attestation',
  'certification body',
  'halcyon',
  'vantage ledger',
  'northwind',
  'compliance readiness',
  'vciso',
  'penetration test',
];

describe('the second profile is genuinely a different business', () => {
  /**
   * The PARSED profile, not its source file. A source scan would also read the docstrings,
   * which name Kestrel deliberately to explain what the fixture is for — so it would fail on
   * prose about the data rather than on the data. What matters is the business content.
   */
  it('shares no vocabulary with the first', () => {
    const content = JSON.stringify(MERIDIAN).toLowerCase();
    const shared = KESTREL_VOCABULARY.filter((term) => content.includes(term));
    expect(shared, `meridian reuses Kestrel vocabulary: ${shared.join(', ')}`).toEqual([]);
  });

  it('sets thresholds the first does not', () => {
    const differing = [...PROFILE_ENGINE_CONTRACT].filter((key) => {
      const a = KESTREL.operatingParameters.find((p) => p.key === key)?.value;
      const b = MERIDIAN.operatingParameters.find((p) => p.key === key)?.value;
      return a !== b;
    });
    expect(
      differing.length,
      'every threshold matches Kestrel — the swap would prove the engine reads A profile, not that it reads THIS profile',
    ).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------
// The six systems run against it
// ---------------------------------------------------------------------------

/** Wires a run exactly as `app/simulator/[slug]/page.tsx` does, with the profile substituted. */
async function runUnder(
  profile: BusinessProfile,
  runnable: (typeof RUNNABLE_SYSTEMS)[number],
  scenario: Scenario,
): Promise<EngineRun> {
  return runScenario(scenario, {
    system: runnable.system,
    profile,
    handlers: runnable.handlers,
    provider: new FixtureDecisionProvider(scenario.judgments),
    ...(runnable.sendOutcomes === undefined
      ? {}
      : {
          executor: new FixtureSideEffectExecutor(
            runnable.sendOutcomes,
            runnable.verifyOutcomes ?? {},
          ),
        }),
    ...(runnable.extractions === undefined
      ? {}
      : { extractionProvider: new FixtureExtractionProvider(runnable.extractions) }),
    provisioner: new FixtureResourceProvisioner(),
  });
}

const EVERY_RUN = RUNNABLE_SYSTEMS.flatMap((runnable) =>
  runnable.scenarios.map((scenario) => [runnable.system.id, scenario.slug, runnable, scenario] as const),
);

/**
 * EVERY PROFILE THE SCENARIOS WERE NOT WRITTEN FOR.
 *
 * This block ran against `MERIDIAN` alone until 2026-08-28, which was correct when Meridian was
 * the only other profile and quietly wrong the moment three more were registered. Those three
 * satisfied the schema, `validateProfileConsistency`, and all seventeen contract keys — and had
 * **never executed a single scenario.** Contract-conformant is not execution-proven, and the
 * difference is the whole retargetability claim: a profile can declare every key the engine
 * demands and still put the engine into a state no handler expects.
 *
 * Derived from the register, never listed, for the same reason `PROFILES` is.
 */
const FOREIGN_PROFILES = ALL_PROFILES.filter((p) => p.id !== KESTREL.id);

const EVERY_RUN_PER_FOREIGN_PROFILE = FOREIGN_PROFILES.flatMap((profile) =>
  EVERY_RUN.map(
    ([systemId, slug, runnable, scenario]) =>
      [profile.id, systemId, slug, profile, runnable, scenario] as const,
  ),
);

describe('every authored scenario executes under every profile it was not written for', () => {
  it('covers all six systems', () => {
    expect(new Set(EVERY_RUN.map(([systemId]) => systemId)).size).toBe(6);
  });

  it('exercises more than one foreign profile, or the swap proves less than it claims', () => {
    expect(
      FOREIGN_PROFILES.length,
      'only one profile other than Kestrel is registered. A single foreign profile can be ' +
        'accommodated by accident; several cannot.',
    ).toBeGreaterThan(1);
  });

  describe.each(EVERY_RUN_PER_FOREIGN_PROFILE)(
    '%s :: %s / %s',
    (_profileId, _systemId, _slug, profile, runnable, scenario) => {
      it('completes without the engine demanding anything the profile lacks', async () => {
        const run = await runUnder(profile, runnable, scenario);
        expect(run.timeline.length).toBeGreaterThan(0);
        expect(run.finalState.lifecycleState).toBeTruthy();
      });

      it('replays identically, so determinism does not depend on which profile is loaded', async () => {
        const first = await runUnder(profile, runnable, scenario);
        const second = await runUnder(profile, runnable, scenario);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      });
    },
  );
});

/**
 * The sharpest thing this file asserts.
 *
 * Every test above would still pass if the handlers read a profile and then ignored what
 * they found — the runs would complete, replay identically, and satisfy the contract while
 * the thresholds did nothing. That is the failure mode a swap test is most likely to miss,
 * because it looks exactly like success.
 *
 * So: the same scenarios, executed under two profiles that disagree about their thresholds,
 * must reach different states. Each divergence below traces to a specific disagreement —
 * Meridian escalates receivables at 30 days rather than 45, treats an 8% variance as
 * material rather than 12%, and waits 72 hours for a reply rather than 24.
 */
describe.each(FOREIGN_PROFILES.map((p) => [p.id, p] as const))(
  'the profile is load-bearing, not decorative — %s',
  (profileId, profile) => {
    it('changes outcomes across multiple systems, not just one path', async () => {
      const divergences: string[] = [];
      const divergentSystems = new Set<string>();

      for (const [systemId, slug, runnable, scenario] of EVERY_RUN) {
        const under = await runUnder(profile, runnable, scenario);
        const original = await runUnder(KESTREL, runnable, scenario);
        if (under.finalState.lifecycleState !== original.finalState.lifecycleState) {
          divergences.push(
            `${systemId}/${slug}: ${original.finalState.lifecycleState} → ${under.finalState.lifecycleState}`,
          );
          divergentSystems.add(systemId);
        }
      }

      expect(
        divergentSystems.size,
        `${profileId}: thresholds changed outcomes in fewer than three systems. Either the ` +
          'handlers stopped consulting the profile, or this profile has converged with Kestrel. ' +
          `Divergences seen: ${JSON.stringify(divergences, null, 2)}`,
      ).toBeGreaterThanOrEqual(3);
    });
  },
);

/**
 * THE AGGREGATE TEST ABOVE IS NOT TIGHT ENOUGH ON ITS OWN, and this exists because of it.
 *
 * Five systems currently diverge and the assertion requires three, so a single handler could
 * stop reading the profile and hard-code its threshold while the suite stayed green. Raising
 * the count would only over-fit to today's fixtures.
 *
 * These isolate instead: one profile, one threshold changed, one scenario. If a handler stops
 * consulting that specific key, exactly one of these fails and names it. The comparison value
 * is Kestrel's, so each case also documents which disagreement between the two profiles is
 * doing the work.
 */
describe('each threshold individually drives the outcome', () => {
  function withParameter(profile: BusinessProfile, key: string, value: number): BusinessProfile {
    return {
      ...profile,
      operatingParameters: profile.operatingParameters.map((p) =>
        p.key === key ? { ...p, value } : p,
      ),
    };
  }

  /**
   * [parameter, scenario it governs, Kestrel's value for it].
   *
   * Each pairing was measured, not assumed. The owner-intelligence case was first attributed
   * to `exceptionVarianceThresholdPct` and then to `inputStalenessToleranceHours`; both were
   * wrong, and this test caught both. The parameter that actually moves it is the confidence
   * floor — which makes it the most worthwhile of the three, since that floor is the boundary
   * bounded AI judgement is not allowed to cross.
   */
  const ISOLATED = [
    ['collectionEscalationDays', 'dispute-halts-cadence', 45],
    ['confidenceFloor', 'cash-collection-quietly-worsens', 0.7],
    ['replyWaitWindowHours', 'reply-window-elapses', 24],
  ] as const;

  it.each(ISOLATED)('%s alone changes %s', async (key, slug, kestrelValue) => {
    const found = findRunnableScenario(slug);
    expect(found, `scenario "${slug}" is not registered`).toBeDefined();
    if (found === undefined) return;

    const asAuthored = await runUnder(MERIDIAN, found.runnable, found.scenario);
    const withKestrelValue = await runUnder(
      withParameter(MERIDIAN, key, kestrelValue),
      found.runnable,
      found.scenario,
    );

    expect(
      withKestrelValue.finalState.lifecycleState,
      `changing only "${key}" left the outcome identical, so nothing on this path reads it`,
    ).not.toBe(asAuthored.finalState.lifecycleState);
  });
});
