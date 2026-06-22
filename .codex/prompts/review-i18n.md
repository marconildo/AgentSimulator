---
description: Read-only audit of bilingual (en/pt) coverage for every user-facing string.
---

Audit the current **AgentSimulator** change for bilingual coverage (constitution §4): **every** user-facing string ships in both English and Portuguese, using the `{ en, pt }` shape (or `strings.ts` for UI chrome). No English-only or pt-only prose, ever. **Read-only — report gaps, don't edit.**

## Where translatable text lives

- `frontend/src/lib/stations.ts` — station/tier/hop prose, tags, roles, blurbs (`{ en, pt }`, resolved by `*For(lang)` builders).
- `frontend/src/learn/content.ts` — Learn topics.
- `frontend/src/i18n/strings.ts` — UI chrome and the `glossary` (canvas jargon tooltips).
- Any `{ en, pt }` object anywhere; backend error messages surfaced to the user.

What stays plain (NOT translated): code, protocol names, proper nouns (cloud service names in the `clouds` map, model ids).

## Check

1. **Diff sweep.** For every newly added user-facing label, readout, blurb, tag, tooltip, error string, or Learn content: confirm both `en` and `pt` exist and `pt` is a real translation (not the English copied verbatim, unless it's a proper noun).
2. **Shape correctness.** Flag a string added as a bare literal where the surrounding code uses `{ en, pt }`.
3. **Glossary.** A new canvas tag/jargon term needs a `glossary` entry in `strings.ts` (both languages).
4. **Parity.** Flag any `{ en }` with no `pt` (or vice-versa), and any `pt` suspiciously identical to `en` for non-proper-noun prose.

Use `grep` for newly added quoted strings in the changed files; trace each to its `{ en, pt }` (or confirm it's intentionally plain).

**Output:** ✅ covered / ❌ gaps. For each gap: `file:line`, the string, which language is missing, and a suggested `pt` (or `en`) translation the author can use. End with a verdict: bilingual coverage complete / N strings need their counterpart. Do not modify files.
