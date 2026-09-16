import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'app/page.tsx',
  'app/agent/page.tsx',
  'app/projects/page.tsx',
  'app/memory/page.tsx',
  'app/api/chat/route.ts',
  'app/api/agent/route.ts',
  'app/api/models/route.ts',
  'app/api/tools/route.ts',
  'app/api/research/route.ts',
  'app/api/product/route.ts',
  'app/api/readiness/route.ts',
  'db/schema.sql',
  'docs/RELEASE-GATE.md',
  'docs/FEATURE-MATRIX.md'
];

const forbiddenClaims = [
  /persistent:\s*true/i,
  /productionReady:\s*true/i
];

const failures = [];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing required product surface: ${relative}`);
}

const productRoute = fs.readFileSync(path.join(root, 'app/api/product/route.ts'), 'utf8');
const readinessRoute = fs.readFileSync(path.join(root, 'app/api/readiness/route.ts'), 'utf8');
const shareRoute = fs.readFileSync(path.join(root, 'app/api/share/route.ts'), 'utf8');

for (const pattern of forbiddenClaims) {
  if (pattern.test(shareRoute)) failures.push(`Share endpoint contains an unsafe production claim: ${pattern}`);
}

for (const expected of ['deployment: \'deferred\'', 'browserVerificationRequired: true', 'securityReviewRequired: true']) {
  if (!productRoute.includes(expected)) failures.push(`Product contract missing release guard: ${expected}`);
}

for (const expected of ['readyForProduction', 'blockers', 'Missing optional integrations are reported explicitly']) {
  if (!readinessRoute.includes(expected)) failures.push(`Readiness contract missing: ${expected}`);
}

if (failures.length) {
  console.error('Dosthai product contract FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Dosthai product contract passed: ${requiredFiles.length} required surfaces verified.`);
