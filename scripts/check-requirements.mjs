#!/usr/bin/env node
// Validates docs/produto/requisitos.md: every requirement heading must be
// followed by a Situação field using the closed vocabulary and by an
// Evidência field, and RF/RNF numbering must be sequential with no gaps.
import { readFile } from 'node:fs/promises';

const FILE = process.argv[2] ?? 'docs/produto/requisitos.md';
const EXPECTED = { RF: 19, RNF: 15 };
const ALLOWED = [
  /^implementado$/,
  /^implementado com defeito \((BUG|CS)-\d{2}\)$/,
  /^documentado mas inexistente$/,
  /^não implementado$/,
];

const text = await readFile(FILE, 'utf8');
const lines = text.split('\n');
const errors = [];
const seen = { RF: [], RNF: [] };

for (let i = 0; i < lines.length; i += 1) {
  const heading = lines[i].match(/^### (RF|RNF)(\d{2}) — /);
  if (!heading) continue;
  const [, kind, num] = heading;
  const id = `${kind}${num}`;
  seen[kind].push(Number(num));

  const window = lines.slice(i + 1, i + 12).join('\n');
  const situacao = window.match(/\*\*Situação\.\*\*\s*`([^`]+)`/);
  if (!situacao) {
    errors.push(`${id}: sem campo Situação nas linhas seguintes ao título`);
    continue;
  }
  if (!ALLOWED.some((re) => re.test(situacao[1]))) {
    errors.push(`${id}: Situação fora do vocabulário: "${situacao[1]}"`);
  }
  if (!window.includes('**Evidência.**')) {
    errors.push(`${id}: sem campo Evidência`);
  }
}

for (const [kind, total] of Object.entries(EXPECTED)) {
  const nums = seen[kind];
  nums.forEach((n, idx) => {
    if (n !== idx + 1) errors.push(`${kind}: esperado ${kind}${String(idx + 1).padStart(2, '0')}, encontrado ${kind}${String(n).padStart(2, '0')}`);
  });
  if (nums.length !== total) errors.push(`${kind}: esperados ${total}, encontrados ${nums.length}`);
}

if (errors.length > 0) {
  console.error(`check-requirements: ${errors.length} problema(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-requirements: ${seen.RF.length + seen.RNF.length} requisitos validados (${seen.RF.length} RF + ${seen.RNF.length} RNF)`);
