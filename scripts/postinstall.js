#!/usr/bin/env node

function shouldSkipHint() {
  if (process.env.CI === 'true' || process.env.CI === '1') {
    return true;
  }
  if (process.env.ONESPEC_NO_HINTS === '1') {
    return true;
  }
  return false;
}

function main() {
  if (shouldSkipHint()) {
    return;
  }

  console.log('\nOneSpec installed. Next run:');
  console.log('  onespec init');
  console.log('or non-interactive:');
  console.log('  onespec init . --platform codex --scope project --yes\n');
}

try {
  main();
} catch {
  // Never break npm install because of an install hint.
}
