# Audit of the top skills on skills.sh
2026-11-12

## Scope
- Listed skills: 600
- Distinct sources: 83
- Sources that are not GitHub repos: 3
- Sources that could not be cloned: 2
- Skills not found at the repo HEAD (unresolved): 71
- Skills scanned: 496

## Results
| Finding | Skills | Share of scanned |
| --- | ---: | ---: |
| No findings at all | 300 | 60.5% |
| Any high finding | 0 | 0.0% |
| Ships a script or executable | 76 | 15.3% |
| download | 95 | 19.2% |
| api-key | 79 | 15.9% |
| base64 | 37 | 7.5% |
| subprocess | 36 | 7.3% |
| exec | 19 | 3.8% |
| chmod | 18 | 3.6% |
| recursive-delete | 16 | 3.2% |
| eval | 12 | 2.4% |
| sudo | 7 | 1.4% |
| ignore-previous | 5 | 1.0% |
| frontmatter | 3 | 0.6% |
| hidden-unicode | 3 | 0.6% |

## Shipped scripts
Median: 3; max: 153 (among skills with shipped scripts).

## Hidden Unicode
| Severity | Message kind | Occurrences |
| --- | --- | ---: |
| low | N zero-width character(s), first U+200B | 4 |
| low | N zero-width character(s), first U+200D | 1 |
| low | N zero-width character(s), first U+FEFF | 1 |

## How to read this

- **Method.** The list is the 600 skills embedded in the skills.sh home page on the date above. Each GitHub source was shallow-cloned once, and each skill's own folder (the one holding its `SKILL.md`) was scanned with `agent-skill-vet` 1.1.0. Nothing from any repository was executed. `audit/run.mjs` reproduces the scan and `audit/report.mjs` produces the tables. The per-skill output, with the commit scanned for each repository, is in `audit/results.json`.
- **No high findings.** The scanner found no skill containing hidden tag characters, bidirectional controls, a run of zero-width characters, or an unquoted instruction override. The override rule matches one English phrase and the thresholds were tuned on this same data, so this is a floor, not a guarantee.
- **The first pass was wrong 11 times out of 11.** Version 1.0.1 raised 11 high findings across 7 skills. Each was read by hand and all were harmless: phrases such as "ignore previous instructions" quoted inside guidance that tells the agent *not* to obey them, a zero-width space used to nest Markdown code fences, and zero-width characters inside regular expressions that handle them. Version 1.1.0 grades those as low and keeps high for the patterns that can hide a message.
- **Medium rows are keyword matches, not verdicts.** `download`, `api-key`, `base64` and similar rows count skills where the word appears anywhere, including in ordinary documentation. They show what a reviewer may want to read, not that anything is wrong.
- **Shipped scripts are the number that matters.** About one skill in seven ships code that an agent may run. A static scan does not judge that code; it should be read before installation.
- **Limits.** 71 listed skills were not found at their repository's current HEAD (spot checks of the two largest groups showed renamed or removed skills; the rest were not checked by hand), 2 source repositories were not publicly reachable and 3 sources are not GitHub repositories, so 104 of the 600 were not scanned. A clean scan is a heuristic result, not proof of safety.
