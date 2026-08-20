import { readFileSync, existsSync } from 'fs';

// Docs-lint: fail CI if contract docs reference repo paths that do not exist.
// Docs must stay consistent with shipped code (repo DoD). Planning/tracking
// docs (ROADMAP.md, PSY-DRUM-IMPLEMENTATION-PLAN.md) describe future work and
// are intentionally NOT scanned.

var CONTRACT_DOCS = [
  'README.md',
  'ARCHITECTURE.md',
  'ARCHITECTURE-STYLE.md',
  'INTEGRATION-GUIDE.md',
  'docs/ARCHITECTURE.md',
  'docs/ADRS.md'
];

// Build outputs that docs may reference but that are not checked into git.
var ALLOW_MISSING: Record<string, boolean> = {
  'public/psydrum.js': true
};

var PATH_RE = /\b(?:src|tests|public|scripts|docs)\/[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)*\.(?:ts|tsx|js|json|html|md|toml|yml|svg|wav)\b/g;

var violations: string[] = [];

for (var d = 0; d < CONTRACT_DOCS.length; d++) {
  var doc = CONTRACT_DOCS[d];
  if (!existsSync(doc)) {
    violations.push(doc + ' (contract doc itself missing)');
    continue;
  }
  var text = readFileSync(doc, 'utf-8');
  var matches = text.match(PATH_RE) || [];
  for (var m = 0; m < matches.length; m++) {
    var p = matches[m];
    if (ALLOW_MISSING[p]) continue;
    if (!existsSync(p)) violations.push(doc + ' references missing path: ' + p);
  }
}

if (violations.length > 0) {
  console.error('DOCS LINT FAILED - docs reference paths that do not exist:');
  for (var v = 0; v < violations.length; v++) {
    console.error('  ' + violations[v]);
  }
  process.exit(1);
}

console.log('docs-lint: CLEAN - all referenced paths exist');
