// PSYDRUM bundle build (phase 15/16, size budget < 40KB).
//
// Bun.build compiles src/psy-drum/index.ts (and its tree) into a single-file
// browser ESM bundle at public/psydrum.js. The demo page (public/index.html)
// imports it. `bun run bundle` produces it; CI does not require it (it is a
// build artifact, not source).

import { build } from 'bun'
import { mkdirSync } from 'node:fs'

const out = await build({
  entrypoints: ['./src/psy-drum/demo-entry.ts'],
  outdir: './public',
  target: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
  naming: '[dir]/psydrum.js',
})

if (!out.success) {
  console.error('bundle failed:')
  for (const log of out.logs) console.error(log)
  process.exit(1)
}

mkdirSync('./public', { recursive: true })
console.log('bundle written to public/psydrum.js')
for (const o of out.outputs) {
  console.log('  ', o.path, (o.size / 1024).toFixed(1) + ' KB')
}
