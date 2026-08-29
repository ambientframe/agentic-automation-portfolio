# O1/O2 operator runbook — pre-registered protocol

This protocol is committed **before** the session runs, so the published operator's log can cite
it: what was planned, what was captured, in what order, under which rules. That is the point of
committing it — the log's credibility partly rests on the protocol predating the run.

Two sessions with different evidentiary status, per `COMMERCIAL_COMPLETION_PATCH.md` §3:

- **Session A — the operating run.** Ordinary use, recorded as encountered. Label: `OPERATING`.
- **Session B — the control challenge.** One published safeguard deliberately tested. Label:
  `CONTROL`.

The distinction survives into the evidence bundle and the public log. Do not blur it.

## Rules (both sessions)

1. **First take is the take.** No retakes for a better narrative. A repeated step is recorded as
   repeated, with the reason.
2. **Notes are contemporaneous.** Verbatim reactions during the session; expansion afterward;
   no polishing away confusion. Confusion is data.
3. **Do not manufacture failure, and do not avoid it.** If nothing dramatic happens in Session
   A, that is the finding.
4. **A defect is evidence first, backlog second.** If something breaks: capture it, note it,
   continue if possible.

## Setup (~15 min)

1. Run locally from repo `HEAD` per the README's cold-run instructions. The local store journals
   durable records that go straight into the evidence bundle, and the run doubles as a live
   exercise of the README's own promise. Record: commit id, date, start time.
2. Notes file open at `docs/evidence/o1/NOTES.md`; screenshot tool ready. Timestamp every entry.
3. Select an operator principal whose authority ceiling is **mid-ladder, not the top** — Session
   B needs a ceiling that can genuinely be exceeded.
   `[apparatus: CP2 — confirm the principal roster and each ceiling in the console]`

## Session A — the operating run (60–90 min, everything labeled `OPERATING`)

1. Operate the system the way the business would, through the surfaces the pages invite: drive
   the enquiry lifecycle in the simulator, and work the waiting queue in the operator console at
   `/lead-rescue/wait` — review each surfaced case, decide, record.
   `[apparatus: CP2 — confirm the exact drive path for a full park → wait → resume cycle on the
   local instance]`
2. **Per decision point, capture:** timestamp · screenshot · what the system did · what you did
   · your immediate reaction, verbatim.
3. **Cover at least:** one park → wait → resume cycle; one duplicate or classification
   judgment; one case where you would have acted differently than the system proposed — and if
   no such case occurs, record that it did not.
4. **Friction log:** every moment of hesitation, confusion, mistrust, or tedium, as it happens.
   This feeds the log's "what surprised me" section; it cannot be reconstructed later.
5. **End marker:** note the time. Session A is closed. Nothing after it is `OPERATING` evidence.

## Session B — the control challenge (20–30 min, everything labeled `CONTROL`)

Take an explicit break first, or run it as a separate sitting.

1. **Write the declaration before acting** (it opens the log's control section): *"I am now
   deliberately testing a published safeguard — the authority ceiling. This is a control test,
   not something that happened in normal use. I would want to know whether it holds before
   trusting this system with someone else's business."*
2. As the mid-ladder principal, drive a case to an action **above** your ceiling, and attempt
   it.
3. **Capture:** the refusal itself; the routing/escalation that follows; the
   `ATTENTION_BLOCKED` state and its two-clock rendering (blocked, not overdue); the journal
   record behind each.
4. **If the safeguard fails, capture harder.** A failed safeguard is published per thesis §3 —
   a retained negative result is an asset — and repaired as gate-breaking work.

## Post-run, same day (~30–45 min)

Expand the contemporaneous notes while fresh — do not rewrite them; annotate them. Then assemble
the bundle.

## Evidence bundle manifest (`docs/evidence/o1/`)

| Artifact | Convention |
|---|---|
| `NOTES.md` | Timestamped, every entry labeled `OPERATING` or `CONTROL` |
| `screenshots/` | Numbered in capture order, prefixed `a-` / `b-` by session |
| journal + store records | Preserved from the local run `[apparatus: CP2 — the mechanism]` |
| `MANIFEST.md` | One line per artifact: what it is, which session, what it evidences |

**Handoff:** the bundle is CP2b's only input. The builder composes the log's sections 3–5 from
this evidence and nothing else, and the log links back to this protocol and the commit that
introduced it.
