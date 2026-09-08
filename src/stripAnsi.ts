import { Transform, type TransformCallback } from 'node:stream';

const ESC = 0x1b;
const BEL = 0x07;
const BACKSLASH = 0x5c;
const LEFT_BRACKET = 0x5b;
const RIGHT_BRACKET = 0x5d;

// Parser states. We only ever need to remember which state we're in
// between chunks, not the bytes we've already seen, which is what
// keeps this safe for streams of unbounded length.
type State = 'GROUND' | 'ESCAPE' | 'CSI' | 'OSC' | 'OSC_ESC';

/**
 * Removes ANSI/VT100 terminal escape sequences (SGR color codes, cursor
 * movement, OSC window-title sequences, and other C1 control sequences
 * introduced by ESC) from a byte stream.
 *
 * The parser is a small state machine that advances one byte at a time.
 * State survives across calls to _transform, so an escape sequence split
 * across two chunks is handled correctly without ever holding onto more
 * than the current chunk.
 */
export class AnsiStripStream extends Transform {
  private state: State = 'GROUND';

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    const kept: number[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];

      switch (this.state) {
        case 'GROUND':
          if (byte === ESC) {
            this.state = 'ESCAPE';
          } else {
            kept.push(byte);
          }
          break;

        case 'ESCAPE':
          if (byte === LEFT_BRACKET) {
            this.state = 'CSI';
          } else if (byte === RIGHT_BRACKET) {
            this.state = 'OSC';
          } else {
            // Two-byte escape (ESC followed by a single char, e.g. ESC c
            // for a full reset). Consumed entirely, nothing to keep.
            this.state = 'GROUND';
          }
          break;

        case 'CSI':
          // A CSI sequence ends at its first byte in 0x40-0x7E (the
          // "final byte"); everything before that is parameters.
          if (byte >= 0x40 && byte <= 0x7e) {
            this.state = 'GROUND';
          }
          break;

        case 'OSC':
          // OSC sequences end at BEL, or at the two-byte ST (ESC \).
          if (byte === BEL) {
            this.state = 'GROUND';
          } else if (byte === ESC) {
            this.state = 'OSC_ESC';
          }
          break;

        case 'OSC_ESC':
          if (byte === BACKSLASH) {
            this.state = 'GROUND';
          } else if (byte !== ESC) {
            // Not a valid string terminator; the ESC we saw was just
            // part of the OSC payload, keep consuming it.
            this.state = 'OSC';
          }
          break;
      }
    }

    if (kept.length > 0) {
      this.push(Buffer.from(kept));
    }
    callback();
  }
}
