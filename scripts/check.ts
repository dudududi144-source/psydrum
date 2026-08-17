import { existsSync } from 'fs';

// PSYDRUM structure gate: every required file must exist.
// Phase 0 scaffold baseline + phase 1 foundation shim; grows as phases land.

var requiredFiles = [
  'README.md',
  'ARCHITECTURE.md',
  'ARCHITECTURE-STYLE.md',
  'INTEGRATION-GUIDE.md',
  'PSY-DRUM-IMPLEMENTATION-PLAN.md',
  'package.json',
  'tsconfig.json',
  'bunfig.toml',
  '.gitignore',
  '.github/workflows/ci.yml',
  'scripts/secret-scan.ts',
  'scripts/check.ts',
  'tests/scaffold.test.ts',
  'src/psy-foundation-shim/protocol.ts',
  'src/psy-foundation-shim/transport.ts',
  'src/psy-foundation-shim/device.ts',
  'src/psy-foundation-shim/host.ts',
  'src/psy-foundation-shim/index.ts',
  'tests/psy-drum/shim-sync.test.ts',
  'tests/psy-drum/shim-contract.test.ts'
];

var missing: string[] = [];

for (var i = 0; i < requiredFiles.length; i++) {
  if (!existsSync(requiredFiles[i])) {
    missing.push(requiredFiles[i]);
  }
}

if (missing.length > 0) {
  console.error('STRUCTURE CHECK FAILED - missing files:');
  for (var m = 0; m < missing.length; m++) {
    console.error('  ' + missing[m]);
  }
  process.exit(1);
}

console.log('structure check: OK - all ' + requiredFiles.length + ' required files present');
