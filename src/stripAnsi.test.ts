import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnsiStripStream } from './stripAnsi.js';

function run(chunks: (string | Buffer)[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = new AnsiStripStream();
    const output: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => output.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(output).toString('utf8')));
    stream.on('error', reject);
    for (const chunk of chunks) {
      stream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    }
    stream.end();
  });
}

// Feeds `prefix + sequence + suffix` through the stream once per possible
// split point of `sequence`, across a two-chunk write. A correct byte-level
// parser has to produce the same clean output no matter where the boundary
// between reads falls, including right after ESC itself.
function testSplitAtEveryBoundary(name: string, sequence: string): void {
  test(name, async () => {
    const prefix = 'before ';
    const suffix = ' after';
    for (let i = 0; i <= sequence.length; i++) {
      const first = prefix + sequence.slice(0, i);
      const second = sequence.slice(i) + suffix;
      const result = await run([first, second]);
      assert.equal(
        result,
        prefix + suffix,
        `split at index ${i} of ${JSON.stringify(sequence)} left stray bytes`,
      );
    }
  });
}

test('passes plain text through unchanged', async () => {
  const result = await run(['hello world\n']);
  assert.equal(result, 'hello world\n');
});

test('strips a CSI SGR color sequence', async () => {
  const result = await run(['\x1b[31mred\x1b[0m plain']);
  assert.equal(result, 'red plain');
});

test('strips an OSC window-title sequence terminated by BEL', async () => {
  const result = await run(['before \x1b]0;my title\x07 after']);
  assert.equal(result, 'before  after');
});

test('strips an OSC sequence terminated by ST (ESC \\)', async () => {
  const result = await run(['before \x1b]0;my title\x1b\\ after']);
  assert.equal(result, 'before  after');
});

test('strips a simple two-byte escape', async () => {
  const result = await run(['before \x1bc after']);
  assert.equal(result, 'before  after');
});

test('does not terminate an OSC sequence on a bare ESC that is not part of ST', async () => {
  // ESC here isn't followed by a backslash, so it's just OSC payload, not a
  // string terminator, and the sequence keeps going until the BEL.
  const result = await run(['before \x1b]0;abc\x1bXyz\x07 after']);
  assert.equal(result, 'before  after');
});

test('OSC_ESC absorbs a run of consecutive ESC bytes before the terminator', async () => {
  const result = await run(['x\x1b]0;t\x1b\x1b\\y']);
  assert.equal(result, 'xy');
});

test('strips several sequences fed one byte at a time', async () => {
  const input = 'a\x1b[1;31mb\x1b]2;title\x07c\x1bd';
  const chunks = Array.from(Buffer.from(input, 'utf8')).map((byte) => Buffer.from([byte]));
  const result = await run(chunks);
  assert.equal(result, 'abc');
});

testSplitAtEveryBoundary('CSI sequence split across a chunk boundary', '\x1b[31m');
testSplitAtEveryBoundary('OSC/BEL sequence split across a chunk boundary', '\x1b]0;title\x07');
testSplitAtEveryBoundary('OSC/ST sequence split across a chunk boundary', '\x1b]0;title\x1b\\');
testSplitAtEveryBoundary(
  'OSC/ST sequence with a doubled ESC split across a chunk boundary',
  '\x1b]0;title\x1b\x1b\\',
);
testSplitAtEveryBoundary('two-byte escape split across a chunk boundary', '\x1bc');
