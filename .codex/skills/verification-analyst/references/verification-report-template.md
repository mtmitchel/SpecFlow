# Verification report template

Use this template when the task has multiple deliverables, multiple evidence sources, or a formal go/no-go decision.

## Summary

**Verdict**
`done | done with documented deviations | not done | unable to verify`

<one-sentence rationale>

**Confidence**
`high | medium | low`

<why this confidence level is appropriate>

## 1. Baseline
- Source:
- Governing scope:
- Explicit non-goals:
- Conflicts or ambiguity:

## 2. Evidence reviewed
- Files or diffs:
- Tests or checks:
- Runtime proof:
- Supporting artifacts:
- Missing evidence:

## 3. Commitment-by-commitment audit
| Commitment | Status | Evidence | Notes |
| --- | --- | --- | --- |
| ... | matched / partially matched / not matched / superseded / not verifiable | ... | ... |

## 4. Material deviations
| Deviation | Type | Impact | Documented? | Acceptable? |
| --- | --- | --- | --- | --- |
| ... | omission / substitution / expansion / behavior drift | ... | yes / no | yes / no |

## 5. Unresolved failures and risks
- Failing or skipped checks:
- Missing edge cases:
- Operational or manual gaps:
- Release blockers:

## 6. Required follow-ups
1. ...
2. ...

## Guidance
- Mark a deviation even if it seems beneficial.
- Lower confidence when evidence is incomplete or indirect.
- If any blocker prevents the stated scope from working, do not return `done`.
