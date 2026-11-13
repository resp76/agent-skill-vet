# agent-skill-vet

A zero-dependency Node.js 18+ CLI that scans an agent skill folder before installation.

```sh
npx agent-skill-vet ./candidate-skill
npx agent-skill-vet ./candidate-skill --json --repo owner/name --installs 20000 --pin
```

## Audit of the top skills

The scanner was run over the top 600 skills listed on skills.sh: 496 were scannable, none had a high finding, and about 15% ship scripts. See [the report](audit/REPORT.md) for the numbers, the method and the false positives it exposed.

## How it compares

NVIDIA publishes two related tools. [SkillSpector](https://github.com/NVIDIA/SkillSpector) is a much deeper skill security scanner (71 patterns, YARA rules, JavaScript analysis, live vulnerability lookups, optional LLM review, baselines). [SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) is a framework that also measures whether a skill helps an agent. Both need Python 3.12 or later, and the full pipelines add external scanners, an LLM provider and Docker.

agent-skill-vet does one small job: a quick pre-install gate with nothing to set up. It is one Node file, no dependencies, no network and no model, and it runs in a second with `npx`. If you need depth, use SkillSpector. If you want a cheap check in every pull request or before every install, use this.

## Check skills automatically before `npx skills add` (Claude Code)

`agent-skill-vet hook` is a Claude Code [PreToolUse hook](https://code.claude.com/docs/en/hooks). When Claude is about to run `npx skills add owner/repo`, the hook shallow-clones the repository with git hooks and submodules disabled, scans every skill in it (nothing is executed), and decides before anything is installed:

- **High finding** (hidden tag characters, bidirectional controls, an unquoted instruction override): the command is denied and Claude is told which file and line.
- **Ships scripts, `curl | sh` or credential-shaped strings:** you are asked to confirm, with the pinned commit.
- **Clean, not a GitHub source, or not reachable** (private repo, offline): no decision, so your normal permission flow applies.

Install it once and add the hook to `~/.claude/settings.json`:

```sh
npm install -g agent-skill-vet
```

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "agent-skill-vet hook", "timeout": 90 }] }
    ]
  }
}
```

The hook runs on every Bash call and returns immediately unless the command is a `skills add` of a GitHub repository. It only covers installs that Claude Code runs itself; a command you type in your own terminal is not intercepted. It scans the default branch at clone time, so use `--pin` on the commit you reviewed if you install later.

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

Checks include hidden Unicode, shipped scripts or executable bits (medium), suspicious command patterns including `curl | sh` (medium), high-precision credential shapes such as private keys and cloud tokens (medium; lines marked EXAMPLE are skipped), instruction overrides (high, or low when the phrase is a quoted example), and missing frontmatter fields (low). Hidden Unicode is high for tag characters (the message they spell is decoded and shown), bidirectional controls, and four or more zero-width characters on one line; fewer zero-width characters are low. A leading UTF-8 BOM, joiners between emoji and flag emoji are exempt. With `--repo`, GitHub stars are fetched with a five-second timeout and failures are soft. With `--installs`, ratios above 5,000 installs per star produce a low warning; positive installs with zero stars also warn. No ratio is inferred when metadata is unavailable.

`--sarif` prints SARIF 2.1.0 for GitHub code scanning instead of a table. `--pin` prints the Git HEAD commit when available. Pinning identifies a version; it does not establish trust. The scanner never executes target files. It skips symlinks, `.git` directories, non-UTF-8/binary content, and files larger than 1 MiB; script names and executable bits are still reported for skipped file contents. Static checks can miss malicious behavior and can flag legitimate documentation. Review findings and skipped content before installation.

```sh
npm test
```

MIT licensed. No runtime dependencies.
