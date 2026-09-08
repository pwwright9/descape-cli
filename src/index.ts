#!/usr/bin/env node
import { AnsiStripStream } from './stripAnsi.js';

function printUsage(): void {
  process.stdout.write(
    'descape - strip terminal escape sequences from a stream\n\n' +
      'usage:\n' +
      '  descape < colorful.log > clean.log\n' +
      '  some-command-with-colors | descape | less\n\n' +
      'reads bytes from stdin and writes them to stdout with ANSI/VT100\n' +
      'escape sequences removed (SGR color codes, cursor movement, OSC\n' +
      'title-setting sequences, and similar). the input is processed as\n' +
      'a stream, so it works the same on a 10-byte string, a multi-\n' +
      'gigabyte log file, or a pipe that never closes.\n',
  );
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const stripper = new AnsiStripStream();

  const bailOnEpipe = (err: NodeJS.ErrnoException): void => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
    process.stderr.write(`descape: ${err.message}\n`);
    process.exit(1);
  };

  process.stdin.on('error', bailOnEpipe);
  process.stdout.on('error', bailOnEpipe);
  stripper.on('error', bailOnEpipe);

  process.stdin.pipe(stripper).pipe(process.stdout);
}

main();
