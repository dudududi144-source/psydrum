import { existsSync } from 'fs';

// PSYDRUM structure gate: every required file must exist.
// Phase 0 scaffold + phase 1 shim + phase 2 core types/counters/latency + phase 3 note-router/audit-B1; grows as phases land.

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
  'tests/psy-drum/shim-contract.test.ts',
  'src/psy-drum/types.ts',
  'src/psy-drum/counters.ts',
  'src/psy-drum/latency.ts',
  'tests/psy-drum/types.test.ts',
  'tests/psy-drum/counters.test.ts',
  'tests/psy-drum/latency.test.ts',
  'src/psy-drum/note-router.ts',
  'tests/psy-drum/note-router.test.ts',
  'tests/psy-drum/audit-b1.test.ts',
  'src/psy-drum/choke.ts',
  'tests/psy-drum/choke.test.ts',
  'src/psy-drum/voice.ts',
  'src/psy-drum/voice-synth.ts',
  'src/psy-drum/default-kit.ts',
  'src/psy-drum/kit-builtin.ts',
  'src/psy-drum/sample-gen.ts',
  'src/psy-drum/fx.ts',
  'tests/psy-drum/fx.test.ts',
  'tests/psy-drum/default-kit.test.ts',
  'tests/psy-drum/kit-builtin.test.ts',
  'tests/psy-drum/voice-synth.test.ts',
  'tests/psy-drum/voice.test.ts',
  'src/psy-drum/voice-pool.ts',
  'tests/psy-drum/voice-pool.test.ts',
  'src/psy-drum/kit-library.ts',
  'tests/psy-drum/kit-library.test.ts',
  'src/psy-drum/variance-rules.ts',
  'tests/psy-drum/variance-rules.test.ts',
  'src/psy-drum/midi-map.ts',
  'tests/psy-drum/midi-map.test.ts',
  'src/psy-drum/device.ts',
  'src/psy-drum/index.ts',
  'tests/psy-drum/device.test.ts',
  'tests/psy-drum/contract.test.ts'
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
