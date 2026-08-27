/**
 * TRANSITIONS NO RUNNABLE SCENARIO CURRENTLY DRIVES.
 *
 * This is BUILD STATE, not canon, which is why it lives beside the systems rather than inside
 * them: `data/systems/**` describes what each system IS, and this describes how much of that a
 * visitor can currently watch. Conflating the two would let implementation progress edit the
 * definition it is supposed to be measured against.
 *
 * `tests/transition-coverage.test.ts` reconciles this against a real run of every scenario and
 * fails in BOTH directions — a transition that quietly stops being exercised, and an entry here
 * for a transition a scenario now drives. That second direction is what stops this file
 * becoming the next `Pending — scenario not yet authored`: a marker nobody re-reads, describing
 * a state of affairs that changed.
 *
 * Being on this list is not a defect. Several of these are covered by direct unit tests and are
 * proven to work — `lr-t30` and `lr-t32` were closed this way when `lr-fm-malformed` was closed.
 * What the list records is narrower and more honest: nobody can open the simulator and watch
 * them happen. Closing a standard and making it inspectable are different achievements, and
 * this portfolio sells the second.
 *
 * To shorten it, author a scenario. Never edit an entry away to make a number look better.
 */
export const SCENARIO_UNEXERCISED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  'lead-rescue': [
    'lr-t02', 'lr-t03', 'lr-t04', 'lr-t07', 'lr-t08', 'lr-t15', 'lr-t17', 'lr-t18',
    'lr-t19', 'lr-t20', 'lr-t23', 'lr-t25', 'lr-t26', 'lr-t27', 'lr-t28', 'lr-t29',
    'lr-t30', 'lr-t31', 'lr-t32', 'lr-t35', 'lr-t36', 'lr-t37',
  ],
  'dormant-pipeline-recovery': [
    'dp-t03', 'dp-t09', 'dp-t10', 'dp-t11', 'dp-t12', 'dp-t14', 'dp-t15', 'dp-t16',
    'dp-t17', 'dp-t18', 'dp-t19', 'dp-t20',
  ],
  'call-to-proposal': [
    'cp-t03', 'cp-t05', 'cp-t07', 'cp-t08', 'cp-t13', 'cp-t14', 'cp-t15', 'cp-t16',
    'cp-t17', 'cp-t18',
  ],
  'client-onboarding': [
    'co-t05', 'co-t07', 'co-t09', 'co-t11', 'co-t13', 'co-t14', 'co-t15', 'co-t16', 'co-t17',
  ],
  'receivables-recovery': [
    'rr-t02', 'rr-t04', 'rr-t05', 'rr-t07', 'rr-t08', 'rr-t10', 'rr-t11', 'rr-t13',
    'rr-t14', 'rr-t15', 'rr-t16', 'rr-t17', 'rr-t18', 'rr-t19', 'rr-t20', 'rr-t21',
    'rr-t23', 'rr-t24', 'rr-t25', 'rr-t26', 'rr-t27', 'rr-t29', 'rr-t30', 'rr-t31',
    'rr-t32', 'rr-t33',
  ],
  'owner-revenue-intelligence': ['or-t05', 'or-t10', 'or-t14'],
};
