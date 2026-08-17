import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Secret-scan: fail CI if any credential-looking token is present in tracked text files.
// PSYDRUM ships procedural/CC0 audio assets only - credentials must never appear.

var SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/g,
  /gho_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g
];

var SKIP_DIRS: Record<string, boolean> = {
  '.git': true,
  'node_modules': true,
  'dist': true
};

var SKIP_EXT: Record<string, boolean> = {
  '.png': true, '.jpg': true, '.jpeg': true, '.gif': true, '.webp': true,
  '.wav': true, '.mp3': true, '.ogg': true, '.flac': true, '.aiff': true
};

var violations: string[] = [];

function scanFile(path: string): void {
  var text = readFileSync(path, 'utf-8');

  for (var i = 0; i < SECRET_PATTERNS.length; i++) {
    SECRET_PATTERNS[i].lastIndex = 0;
    if (SECRET_PATTERNS[i].test(text)) {
      violations.push(path);
      return;
    }
  }
}

function walk(dir: string): void {
  var entries = readdirSync(dir);

  for (var i = 0; i < entries.length; i++) {
    var full = join(dir, entries[i]);
    var stat = statSync(full);

    if (stat.isDirectory()) {
      if (!SKIP_DIRS[entries[i]]) walk(full);
    } else {
      var dot = entries[i].lastIndexOf('.');
      var ext = dot >= 0 ? entries[i].slice(dot).toLowerCase() : '';
      if (!SKIP_EXT[ext]) scanFile(full);
    }
  }
}

walk('.');

if (violations.length > 0) {
  console.error('SECRET SCAN FAILED - potential credentials found in:');
  for (var v = 0; v < violations.length; v++) {
    console.error('  ' + violations[v]);
  }
  process.exit(1);
}

console.log('secret-scan: CLEAN - no credentials found');
