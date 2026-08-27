# COMMERCIAL THESIS

**Authority:** this document defines *why the artifact exists and what it must do commercially*.
It does not define process (`PORTFOLIO_PM_CONSTITUTION.md`), repository facts (the code), or
sequencing (`CHECKPOINT.md`'s `Current` entry).

**Read this before proposing any commercial move.** Every model that has worked on this project
has independently invented a go-to-market interpretation and then argued for it. That is the
failure this document exists to end. If a suggestion contradicts what follows, the suggestion is
wrong, not the thesis.

Like `CLAUDE.md`, this file carries **no mutable state** — no counts, no maturity levels, no
prospect lists, no status. Those are derived or live elsewhere.

---

## 1. THE ORIGIN CONSTRAINT

The project began in response to a specific, structural failure: freelance marketplaces gate
work behind reviews, and reviews are gated behind work. No amount of effort inside that system
resolves it, because the constraint is not effort. It is the absence of a credential that only
prior transactions can mint.

The response is not to try harder at acquiring the credential. It is to **make the credential
unnecessary**.

## 2. THE THESIS

> **Substitute inspectable work for reputation.**

A buyer should not have to trust the operator. They should be able to **check the work** and
reach their own conclusion. The artifact carries the argument; the person does not make it.

Shorthand: **data-forward, ego-minimal.**

| The artifact does | The artifact never does |
|---|---|
| Show a real mechanism working | Claim the operator is skilled |
| Publish what it cannot do | Imply completeness it has not earned |
| Let a stranger verify unassisted | Require a call to be understood |
| State its own limits in its own voice | Wait to be asked what is fake |

## 3. WHY THE PUBLISHED GAPS ARE LOAD-BEARING

This is the part most easily mistaken for humility, modesty, or a marketing tactic. It is none
of those. It is the mechanism.

**A portfolio with no admitted limits requires trust. A portfolio that publishes its own
failures can be checked.**

An artifact that claims only success gives a stranger no way to distinguish it from one that is
lying, so they must fall back on reputation — the exact credential the operator does not have.
An artifact that declares a floor, misses it, and retains the result unaltered has made a
falsifiable claim. Falsifiable claims can be evaluated without trust.

Therefore: a retained negative result is a **commercial asset**, not damage to be managed. So is
every `PENDING_VERIFICATION`, every `doesNotProve` list, every published gap left open as
backlog.

Softening any of these to look more impressive destroys the only thing that makes the artifact
work. It is not a tradeoff between honesty and persuasiveness. Here, the honesty *is* the
persuasion.

## 4. WHAT THIS RULES OUT

These follow from §2 and are not matters of taste or timing.

**Cold outreach is structurally incompatible.** It is a trust-requesting motion: it asks a
stranger to believe an unproven claim about the sender. The thesis exists to remove the need to
be believed. Proposing outreach as the path is proposing the opposite of the strategy.

**Persuasion collateral is out of scope.** Sales decks, ROI calculators, case-study narratives,
founder-story pages, testimonial walls. Each substitutes assertion for inspection.

**Premature vertical lock-in is forbidden.** Narrowing to one industry converts a general
capability into a specific claim that must then be believed on credentials the operator does not
hold. Verticals are *demonstrations*, never identity. See §5.

**Volume-based acquisition is out.** Mass contact, lead-gen sequences, and social-proof
manufacturing all trade on attention rather than verification.

**None of this forbids distribution.** Proof that argues for itself must still be *encountered*.
Ego-minimal solves conversion, not discovery. Placement — putting verifiable work where
evaluators already look — is a legitimate and separate problem, and it is downstream of the
artifact being worth encountering. Do not solve it early.

## 5. PLUG AND PLAY IS A PROOF, NOT A FEATURE

The commercial claim the artifact must support is **retargetability**: that this is a general
operating capability, not one bespoke build.

That claim is currently *asserted* — `lib/model/profile.ts` states retargeting "should be a
matter of authoring a second profile," and `tests/seam.test.ts` guards against known vocabulary
leaking into `data/systems/**`.

A blacklist proves that remembered terms are absent. **It cannot prove a second profile is
possible.** Only a second profile can do that.

Therefore the retargetability claim is not earned until multiple business profiles run the same
systems, on the same engine, with the suite green for each. Until then the claim is
`UNVERIFIED`, and §3 requires saying so rather than implying otherwise.

**A profile is a demonstration, never a market commitment.** Authoring a vertical's profile
makes no statement about who to sell to. It is the opposite: authoring several is what preserves
optionality, because it lets the artifact show any of them without the operator having to choose
one.

## 6. SYNTHETIC IS NOT INVENTED

Every business in this repository is fictional and must remain clearly labelled as such. That is
a §3 obligation, not a limitation to work around.

But fictional does not license arbitrary. A profile is credible when its vocabulary, economics,
tool stack, and failure modes match how that industry actually operates — and `profile.ts`
already enforces internal coherence through `validateProfileConsistency`, so a profile whose
numbers contradict each other fails rather than renders.

The standard: **a practitioner in that industry should recognise their own operation.** A model's
generic guess about an industry will not clear that bar. Grounding in real industry language will.

The limit, which must be published rather than glossed: coherent synthetic profiles prove
retargetability and internal consistency. They do **not** prove the system handles a real firm's
messy inbound. That gap belongs in the maturity labels like every other.

## 7. HOW TO CHOOSE WORK

Rank a candidate package by what it does to the thesis:

1. **Does it convert an asserted claim into a checkable one?** Highest value. This is the whole
   strategy in one question.
2. **Does it let a stranger verify something unassisted that previously needed explanation?**
3. **Does it close a published gap in a way that changes what the audit reports?** (Pattern #25.)
4. **Does it broaden what the artifact can demonstrate without narrowing what it can claim?**

Reject work that makes the artifact more impressive without making it more checkable. Under §3
that is not neutral — it is a net loss.

Sequencing between qualifying packages is `CHECKPOINT.md`'s job, not this file's.

## 8. INSTRUCTION FOR EXTERNAL AGENTS

Any agent working on this project — in Cursor, Grok Bot, Hermes, or elsewhere — reads this file
and `CLAUDE.md` before producing anything.

1. Do not propose outreach, lead generation, or persuasion collateral. See §4.
2. Do not recommend picking a vertical. Verticals are demonstrations. See §5.
3. Do not soften, omit, or reframe a published limitation to strengthen a pitch. See §3.
4. Do not promote a maturity label, invent a citation, or state an unmeasured value. See
   `CLAUDE.md` safety invariants.
5. Do not add a framework, orchestration layer, or integration from a plan made in advance.
   `CLAUDE.md` scope discipline requires the running system to produce the need first.
6. When authoring profile content, ground it in real industry language and state your sources.
   An invented figure presented as characteristic of an industry is a fabricated citation.
7. Report what you could not confirm as loudly as what you could, marked
   `[unverified — verify by: <method>]`.

## 9. THE CLAIM, IN ONE SENTENCE

> You do not need to trust me. The work is open, its limits are published, and you can check it
> yourself — so judge me on what you find.
