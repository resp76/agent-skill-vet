# agent-skill-vet

A zero-dependency Node.js 18+ CLI that scans an agent skill folder before installation.

```sh
npx agent-skill-vet ./candidate-skill
npx agent-skill-vet ./candidate-skill --json --repo owner/name --installs 20000 --pin
```

## Audit of the top skills

The scanner was run over the top 600 skills listed on skills.sh: 496 were scannable, none had a high finding, and about 15% ship scripts. See [the report](audit/REPORT.md) for the numbers, the method and the false positives it exposed.

## GitHub Action

Skill authors can scan every skill in a repository on each push. Any folder containing a `SKILL.md` is scanned, and the job fails on a high finding.

```yaml
- uses: actions/checkout@v4
- uses: resp76/agent-skill-vet@v1
  with:
    path: skills   # optional, defaults to the repository root
```

## Details

Run from source with `node bin/skill-vet.mjs ./candidate-skill`. The folder should contain `SKILL.md` with `name` and `description` frontmatter. The bundled `SKILL.md` provides a Claude Code skill for running and reporting scans.

The default output is a table. `--json` emits an object containing `findings` and, when requested, `stars` and `commit` (null when unavailable). Each finding has `severity`, `file`, `line` (one-based), `rule`, and `message`. Exit status is 1 for high findings or operational errors, otherwise 0.

Checks include hidden Unicode, shipped scripts or executable bits (medium), suspicious command and credential patterns (medium), instruction overrides (high, or low when the phrase is a quoted example), and missing frontmatter fields (low). Hidden Unicode is high for tag characters (the message they spell is decoded and shown), bidirectional controls, and four or more zero-width characters on one line; fewer zero-width characters are low. A leading UTF-8 BOM, joiners between emoji and flag emoji are exempt. With `--repo`, GitHub stars are fetched with a five-second timeout and failures are soft. With `--installs`, ratios above 5,000 installs per star produce a low warning; positive installs with zero stars also warn. No ratio is inferred when metadata is unavailable.

`--pin` prints the Git HEAD commit when available. Pinning identifies a version; it does not establish trust. The scanner never executes target files. It skips symlinks, `.git` directories, non-UTF-8/binary content, and files larger than 1 MiB; script names and executable bits are still reported for skipped file contents. Static checks can miss malicious behavior and can flag legitimate documentation. Review findings and skipped content before installation.

```sh
npm test
```

MIT licensed. No runtime dependencies.
