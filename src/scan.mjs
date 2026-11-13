import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const scripts = /\.(py|sh|js|mjs|ts|rb|ps1|bat|exe|bin)$/i;
const hidden = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/gu;
const patterns = [
  ['download', /\b(?:curl|wget)\b/i],
  ['base64', /base64/i],
  ['eval', /\beval\s*\(/i],
  ['exec', /\bexec\s*\(/i],
  ['subprocess', /subprocess/i],
  ['api-key', /api[_-]?key/i],
  ['chmod', /\bchmod\b/i],
  ['sudo', /\bsudo\b/i],
  ['recursive-delete', /\brm\s+-rf\b/i],
  ['ignore-previous', /ignore\s+(?:all\s+)?previous/i],
];
const emojiEnd = /\p{Extended_Pictographic}[\uFE0E\uFE0F\p{Emoji_Modifier}]*$/u;
const emojiStart = /^\p{Extended_Pictographic}/u;

export async function scan(directory) {
  const root = await realpath(directory);
  if (!(await lstat(root)).isDirectory()) throw new Error('Target must be a directory');
  const findings = [];
  const add = (severity, file, line, rule, message) => findings.push({ severity, file, line, rule, message });
  let skillFound = false;
  async function walk(dir) {
    for (const entry of (await readdir(dir)).sort()) {
      if (entry === '.git') continue;
      const absolute = path.join(dir, entry);
      const stat = await lstat(absolute);
      // Skip all symlinks so linked files can never escape the target.
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) { await walk(absolute); continue; }
      if (!stat.isFile()) continue;
      const file = path.relative(root, absolute).split(path.sep).join('/');
      if (scripts.test(entry) || (stat.mode & 0o111)) {
        add('med', file, 1, 'shipped-script', 'Shipped script or executable; review before installation');
      }
      if (stat.size > 1024 * 1024) continue;
      const bytes = await readFile(absolute);
      if (bytes.length > 1024 * 1024 || bytes.includes(0)) continue;
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { continue; }
      if (file === 'SKILL.md') {
        skillFound = true;
        const front = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
        for (const key of ['name', 'description']) {
          if (!new RegExp(`^${key}:[ \\t]*(?![ \\t]*(?:#|$))\\S`, 'm').test(front)) {
            add('low', file, 1, 'frontmatter', `SKILL.md frontmatter is missing ${key}`);
          }
        }
      }
      const lines = text.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const match of line.matchAll(hidden)) {
          if (match[0] === '\uFEFF' && index === 0 && match.index === 0) continue;
          if (match[0] === '\u200D' && emojiEnd.test(line.slice(0, match.index)) && emojiStart.test(line.slice(match.index + 1))) continue;
          add('high', file, index + 1, 'hidden-unicode', `Hidden Unicode U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
        }
        for (const [rule, regex] of patterns) {
          if (regex.test(line)) add(rule === 'ignore-previous' ? 'high' : 'med', file, index + 1, rule, `Suspicious pattern: ${rule}`);
        }
      }
    }
  }
  await walk(root);
  if (!skillFound) add('low', 'SKILL.md', 1, 'frontmatter', 'Missing readable SKILL.md with name and description frontmatter');
  return findings;
}

export async function repoFindings(repo, installs, fetcher = globalThis.fetch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Repo must be owner/name');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(`https://api.github.com/repos/${repo}`, {
      signal: controller.signal, headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return { stars: null, findings: [] };
    const { stargazers_count: stars } = await response.json();
    if (!Number.isSafeInteger(stars) || stars < 0) return { stars: null, findings: [] };
    const inflated = installs > 0 && (stars === 0 || installs / stars > 5000);
    return { stars, findings: inflated ? [{ severity: 'low', file: 'SKILL.md', line: 1, rule: 'install-ratio', message: 'install count may be inflated' }] : [] };
  } catch { return { stars: null, findings: [] }; }
  finally { clearTimeout(timer); }
}
