#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { scan, repoFindings } from '../src/scan.mjs';

try {
  const { values, positionals } = parseArgs({
    options: { json: { type: 'boolean' }, verbose: { type: 'boolean' }, repo: { type: 'string' }, installs: { type: 'string' }, pin: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log('Usage: skill-vet <path> [--json] [--verbose] [--repo owner/name] [--installs N] [--pin]');
  } else {
    if (positionals.length !== 1) throw new Error('Provide one skill directory (use --help for usage)');
    const installs = values.installs === undefined ? undefined : Number(values.installs);
    if (installs !== undefined && (!/^\d+$/.test(values.installs) || !Number.isSafeInteger(installs))) throw new Error('--installs must be a nonnegative integer');
    const directory = path.resolve(positionals[0]);
    const findings = await scan(directory);
    const result = { findings };
    if (values.repo) {
      const metadata = await repoFindings(values.repo, installs);
      result.stars = metadata.stars;
      findings.push(...metadata.findings);
    }
    if (values.pin) {
      try {
        // Disable hooks, fsmonitor, and replacement objects; never run target code.
        const { stdout } = await promisify(execFile)('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-C', directory, 'rev-parse', 'HEAD'], { timeout: 5000, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
        const commit = stdout.trim();
        result.commit = /^[a-f0-9]{40,64}$/.test(commit) ? commit : null;
      } catch { result.commit = null; }
    }
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      const scripts = findings.filter(f => f.rule === 'shipped-script');
      const shown = values.verbose || scripts.length < 4 ? findings : findings.filter(f => f.rule !== 'shipped-script');
      if (shown.length) console.table(shown);
      if (shown.length < findings.length) console.log(`${scripts.length} shipped scripts (use --verbose to list)`);
      if (!findings.length)      console.log('No findings.');
      if ('stars' in result) console.log(`GitHub stars: ${result.stars ?? 'unavailable'}`);
      if ('commit' in result) console.log(result.commit ? `Commit to pin: ${result.commit}` : 'Commit to pin: unavailable');
    }
    process.exitCode = findings.some(f => f.severity === 'high') ? 1 : 0;
  }
} catch (error) {
  console.error(`skill-vet: ${error.message}`);
  process.exitCode = 1;
}
