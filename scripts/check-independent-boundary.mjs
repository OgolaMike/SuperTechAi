import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/main.tsx');
const visited = new Set();
const violations = [];
const importPattern = /(?:import|export)\\s+(?:[^'";]*?\\s+from\\s+)?['"]([^'"]+)['"]|import\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)/g;
const forbidden = [
  { pattern: /@supabase\\/supabase-js/i, label: 'Supabase SDK import' },
  { pattern: /supabase\\.co/i, label: 'Supabase endpoint reference' },
  { pattern: /VITE_SUPABASE_/i, label: 'Supabase environment variable' },
  { pattern: /supabase\\.(?:from|rpc|channel|auth|storage)/i, label: 'Supabase client API usage' },
];

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/') 
    ? path.join(root, 'src', specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx'].map((ext) => base + ext),
    ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((name) => path.join(base, name))];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function visit(file) {
  const absolute = path.resolve(file);
  if (visited.has(absolute)) return;
  visited.add(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push({ file: path.relative(root, absolute), rule: rule.label });
  }
  importPattern.lastIndex = 0;
  for (const match of source.matchAll(importPattern)) {
    const dependency = resolveImport(absolute, match[1] ?? match[2]);
    if (dependency) visit(dependency);
  }
}

visit(entry);
if (violations.length) {
  console.error('Independent-platform boundary check failed:');
  for (const item of violations) console.error(`- ${item.file}: ${item.rule}`);
  process.exit(1);
}
console.log(`Independent-platform boundary check passed (${visited.size} reachable source files; no Supabase references).`);
