// Audit harness: clone each source repo, scan each listed skill's directory, never execute repo code.
// Usage: node audit/run.mjs <absolute scratch dir outside this repo>
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = process.argv[2];
if (!work || !path.isAbsolute(work)) throw new Error('Usage: node audit/run.mjs <absolute workdir>');
const skills = JSON.parse(readFileSync(path.join(here, 'skills.json'), 'utf8'));
const out = path.join(here, 'results.json');
const results = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' };

function skillDirs(root) {
  const found = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === '.git') continue;
      const abs = path.join(dir, entry);
      const stat = lstatSync(abs);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(abs);
      else if (entry === 'SKILL.md') {
        const front = readFileSync(abs, 'utf8').match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
        const name = front.match(/^name:[ \t]*["']?(.*?)["']?[ \t]*$/m)?.[1] ?? '';
        found.push({ dir, name });
      }
    }
  })(root);
  return found.sort((a, b) => a.dir.length - b.dir.length); // shortest path wins
}

const sources = [...new Set(skills.map(s => s.source))];
for (const [index, source] of sources.entries()) {
  if (results[source]) continue;
  const save = value => { results[source] = value; writeFileSync(out, JSON.stringify(results, null, 1)); console.log(index + 1, sources.length, source, value.error ?? 'ok'); };
  if (!/^[\w.-]+\/[\w.-]+$/.test(source)) { save({ error: 'not-github' }); continue; }
  const dir = path.join(work, String(index), 'repo');
  rmSync(path.dirname(dir), { recursive: true, force: true });
  mkdirSync(path.dirname(dir), { recursive: true });
  try {
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--depth', '1', '--no-recurse-submodules', '--quiet',
      `https://github.com/${source}.git`, dir], { env, stdio: 'ignore', timeout: 180000 });
  } catch { save({ error: 'clone-failed' }); continue; }
  const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirs = skillDirs(dir);
  const entry = { sha, skills: {} };
  for (const skill of skills.filter(s => s.source === source)) {
    const hit = dirs.find(d => d.name === skill.skillId || d.name === skill.name) ?? dirs.find(d => path.basename(d.dir) === skill.skillId);
    if (!hit) { entry.skills[skill.skillId] = { unresolved: true }; continue; }
    try {
      entry.skills[skill.skillId] = { path: path.relative(dir, hit.dir) || '.', installs: skill.installs, findings: await scan(hit.dir) };
    } catch (error) { entry.skills[skill.skillId] = { error: error.message }; }
  }
  save(entry);
  rmSync(path.dirname(dir), { recursive: true, force: true });
}
