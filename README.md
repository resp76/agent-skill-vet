# agent-skill-vet

A zero-dependency Node.js 18+ CLI that scans an agent skill folder before installation.

```sh
npx agent-skill-vet ./candidate-skill
npx agent-skill-vet ./candidate-skill --json --repo owner/name --installs 20000 --pin
```

Run from source with `node bin/skill-vet.mjs ./candidate-skill`. The folder should contain `SKILL.md` with `name` and `description` frontmatter. The bundled `SKILL.md` provides a Claude Code skill for running and reporting scans.

The default output is a table. `--json` emits an object containing `findings` and, when requested, `stars` and `commit` (null when unavailable). Each finding has `severity`, `file`, `line` (one-based), `rule`, and `message`. Exit status is 1 for high findings or operational errors, otherwise 0.

Checks include hidden Unicode (high), shipped scripts or executable bits (medium), suspicious command and credential patterns (medium), instruction overrides (high), and missing frontmatter fields (low). A leading UTF-8 BOM and joiners between emoji are exempt. With `--repo`, GitHub stars are fetched with a five-second timeout and failures are soft. With `--installs`, ratios above 5,000 installs per star produce a low warning; positive installs with zero stars also warn. No ratio is inferred when metadata is unavailable.

`--pin` prints the Git HEAD commit when available. Pinning identifies a version; it does not establish trust. The scanner never executes target files. It skips symlinks, `.git` directories, non-UTF-8/binary content, and files larger than 1 MiB; script names and executable bits are still reported for skipped file contents. Static checks can miss malicious behavior and can flag legitimate documentation. Review findings and skipped content before installation.

```sh
npm test
```

MIT licensed. No runtime dependencies.
