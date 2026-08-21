# Historical Inputs — Provenance Only

**These documents are NOT normative.**

They are the original project inputs, preserved byte-for-byte as received. They record where
this project's intent came from. They are superseded for engineering purposes by the canonical
documents in `docs/`.

## Normative vs. historical

| Status | Location |
| --- | --- |
| **Normative** — obey these | `docs/NORTH_STAR_CANON.md`, `docs/FAILURE_MODE_REGISTER.md`, `docs/RESEARCH_LEDGER.md`, `docs/STATUS.md` |
| **Historical** — provenance only | this directory |

If a future session finds a conflict between a canonical document and a historical input, the
canonical document wins, and the divergence must already be recorded in
`docs/CANON_DIVERGENCES.md`. If it is not recorded there, that is a defect — record it.

## Manifest

Files were renamed for shell ergonomics (the original names contained spaces and an em dash).
Content is unmodified; SHA-256 hashes below were taken before the move and re-verified after.

| Repo path | Original filename | SHA-256 | Bytes |
| --- | --- | --- | --- |
| `01-flight-simulator-brief-v0.1.md` | `Claude Code — Research-Grounded Portfolio Flight Simulator v0.1.md` | `40191802f48c47ad3e047ed3af1a2379a1492a6c984fb989dfd536585d698982` | 26100 |
| `02-START_HERE.md` | `START_HERE.md` | `59375e8d18f8004a6280854e19c292e076e9d6d29925f7085ecf2f42410f4fd4` | 827 |
| `03-PROJECT_HANDOFF.md` | `PROJECT_HANDOFF.md` | `59191b0a04353c9d8b43f8a05f6dcf3f01559ddcf0b387b31589b97a1aad0534` | 21326 |
| `04-CHATGPT_PROJECT_INSTRUCTIONS.md` | `CHATGPT_PROJECT_INSTRUCTIONS.md` | `b1a3945bc5d83399aab624b8d8df203e3eb37e8156e0b10736f967a89f0cb787` | 7931 |
| `agentic-automation-portfolio-handoff.zip` | (same) | `92b3b91d8cf26a713a96473a4f75bfe3325ebe836cc044775cdfa47293a3b5be` | 13046 |

`02`, `03`, and `04` were delivered inside the zip; they are extracted here for readability and
the zip is retained as the original delivery artifact.

## What each input is

- **`01-flight-simulator-brief-v0.1.md`** — the operative implementation brief for v0.1.
  Addressed to a Claude Code agent. This is the document the canon is derived from.
- **`02`–`04`** — a handoff pack authored for a ChatGPT Project. `03` carries the strategy layer
  (the ten-layer learning progression, anti-dead-end rules, commercial positioning) that `01`
  assumes but does not restate. `04` is custom-instructions text for that assistant and has no
  engineering content of its own.

To verify integrity at any time:

```bash
shasum -a 256 -c docs/source/CHECKSUMS.txt
```
