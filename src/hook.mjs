// Claude Code PreToolUse hook: scan a skill before `npx skills add <source>` fetches it.
// Reads the hook JSON on stdin; prints a permission decision on stdout. Never runs repo code.
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scan } from './scan.mjs';

const runner = /^(?:npx|bunx|pnpx)$/;
const github = /^(?:https:\/\/github\.com\/|github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/.*)?\/?$/;

/** GitHub sources named by `skills add` commands inside a shell command line. */
export function installSources(command) {
  const words = command.split(/\s+/);
  const found = [];
  for (let i = 0; i < words.length; i++) {
    const at = words[i] === 'skills' || words[i].startsWith('skills@') ? i : -1;
    const dlx = words[i - 1] === 'dlx' || runner.test(words[i - 1] ?? '') || ['-y', '--yes'].includes(words[i - 1]);
    if (at < 0 || !dlx || !['add', 'install', 'a', 'i'].includes(words[i + 1])) continue;
    const source = words.slice(i + 2).find(w => !w.startsWith('-'));
    const match = source?.match(github);
    if (match && !source.startsWith('.') && !source.startsWith('/')) found.push(`https://github.com/${match[1]}/${match[2]}.git`);
  }
  return [...new Set(found)];
}

function cloneRepo(url, dir) {
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--depth', '1', '--no-recurse-submodules', '--quiet', url, dir],
    { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: 'ignore', timeout: 60000 });
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function skillDirs(root) {
  const found = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === '.git') continue;
      const abs = path.join(dir, entry);
      const stat = lstatSync(abs);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(abs); else if (entry === 'SKILL.md') found.push(dir);
    }
  })(root);
  return found;
}

const where = f => `${f.file}:${f.line} ${f.rule}`; // never echo repo text into the decision

/** Decide for one source. Returns { decision, reason } or null when it could not be scanned. */
export async function checkSource(url, clone = cloneRepo) {
  const base = mkdtempSync(path.join(tmpdir(), 'skill-vet-hook-'));
  try {
    let sha;
    try { sha = clone(url, path.join(base, 'repo')); } catch { return null; } // private repo, offline: fail open
    const findings = [];
    for (const dir of skillDirs(path.join(base, 'repo')).slice(0, 300)) {
      for (const f of await scan(dir)) findings.push({ ...f, file: path.relative(path.join(base, 'repo'), path.join(dir, f.file)) });
    }
    const name = url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    const high = findings.filter(f => f.severity === 'high');
    if (high.length) return { decision: 'deny', reason: `agent-skill-vet: ${name}@${sha.slice(0, 12)} has ${high.length} high finding(s): ${high.slice(0, 5).map(where).join('; ')}. Not installed.` };
    const risky = findings.filter(f => ['shipped-script', 'pipe-to-shell', 'secret'].includes(f.rule));
    if (risky.length) {
      const by = {};
      for (const f of risky) by[f.rule] = (by[f.rule] ?? 0) + 1;
      return { decision: 'ask', reason: `agent-skill-vet: ${name}@${sha.slice(0, 12)} ships code or risky commands (${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ')}). Read them before installing.` };
    }
    return { decision: 'allow', reason: `agent-skill-vet: ${name}@${sha.slice(0, 12)} scanned clean.` };
  } finally { rmSync(base, { recursive: true, force: true }); }
}

export async function runHook(stdin, clone) {
  let command = '';
  try { command = JSON.parse(stdin)?.tool_input?.command ?? ''; } catch { return null; }
  const results = [];
  for (const url of typeof command === 'string' ? installSources(command) : []) {
    const result = await checkSource(url, clone);
    if (result) results.push(result);
  }
  const worst = ['deny', 'ask', 'allow'].find(d => results.some(r => r.decision === d));
  if (!worst || worst === 'allow') return null; // clean or unscannable: leave the normal permission flow alone
  const reason = results.filter(r => r.decision === worst).map(r => r.reason).join(' ');
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: worst, permissionDecisionReason: reason } };
}
