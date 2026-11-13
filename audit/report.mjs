import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const listed = read(new URL('./skills.json', import.meta.url));
let results;
try {
  results = read(process.argv[2] || new URL('./results.json', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  results = {};
}
const sources = [...new Set(listed.map(skill => skill.source))];
const entries = sources.map(source => results[source]).filter(Boolean);
const skills = entries.flatMap(entry => Object.values(entry.skills || {}));
const scanned = skills.filter(skill => Array.isArray(skill.findings));
const rules = new Map(), unicode = new Map(), scripts = [];
for (const { findings } of scanned) {
  for (const rule of new Set(findings.map(finding => finding.rule))) {
    rules.set(rule, (rules.get(rule) || 0) + 1);
  }
  const shipped = findings.filter(finding => finding.rule === 'shipped-script').length;
  if (shipped) scripts.push(shipped);
  for (const finding of findings.filter(finding => finding.rule === 'hidden-unicode')) {
    const key = JSON.stringify([finding.severity, finding.message.replace(/^\d+/, 'N')]);
    unicode.set(key, (unicode.get(key) || 0) + 1);
  }
}
scripts.sort((a, b) => a - b);
const middle = Math.floor(scripts.length / 2);
const median = scripts.length ? (scripts[middle] + scripts[Math.floor((scripts.length - 1) / 2)]) / 2 : 0;
const cell = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const row = (label, count) => `| ${cell(label)} | ${count} | ${(scanned.length ? count / scanned.length * 100 : 0).toFixed(1)}% |`;
console.log(`# Audit of the top skills on skills.sh
${process.argv[3] || new Date().toISOString().slice(0, 10)}

## Scope
- Listed skills: ${listed.length}
- Distinct sources: ${sources.length}
- Sources that are not GitHub repos: ${entries.filter(entry => entry.error === 'not-github').length}
- Sources that could not be cloned: ${entries.filter(entry => entry.error === 'clone-failed').length}
- Skills not found at the repo HEAD (unresolved): ${skills.filter(skill => skill.unresolved).length}
- Skills scanned: ${scanned.length}

## Results
| Finding | Skills | Share of scanned |
| --- | ---: | ---: |
${row('No findings at all', scanned.filter(skill => !skill.findings.length).length)}
${row('Any high finding', scanned.filter(skill => skill.findings.some(finding => finding.severity === 'high')).length)}
${row('Ships a script or executable', rules.get('shipped-script') || 0)}
${[...rules].filter(([rule]) => rule !== 'shipped-script').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rule, count]) => row(rule, count)).join('\n')}

## Shipped scripts
Median: ${median}; max: ${scripts.at(-1) || 0} (among skills with shipped scripts).

## Hidden Unicode
| Severity | Message kind | Occurrences |
| --- | --- | ---: |
${[...unicode].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
  const [severity, message] = JSON.parse(key);
  return `| ${cell(severity)} | ${cell(message)} | ${count} |`;
}).join('\n')}`);
