# descape

Strip ANSI/VT100 terminal escape sequences out of a stream of text.

## the problem

Terminal output is full of bytes that are meant for the terminal, not for
the reader: `ESC [ 3 1 m` to turn text red, `ESC ] 0 ; ... BEL` to set the
window title, `ESC [ 2 J` to clear the screen. That's fine as long as the
output stays on a terminal. It stops being fine the moment you redirect it
to a file, grep it, diff two runs of the same command, or feed it to
something that expects plain text. You end up with a log file full of
`^[[0m` noise, or a diff that "changes" on every line because the color
codes shifted.

`descape` reads bytes from stdin and writes the same bytes to stdout with
every escape sequence removed, so what's left is just the text a person
would read.

## usage

```sh
some-colorful-build-tool 2>&1 | descape > build.log

# clean up a log that was captured with colors still in it
descape < raw.log > clean.log

# works fine in the middle of a longer pipeline too
docker logs -f my-container | descape | grep ERROR
```

`descape --help` prints a short usage message. `descape --version` prints the
installed version.

## why streaming matters here

Log output and `docker logs -f`-style pipes don't have a fixed size, and
some of them never end. A tool that reads all of stdin into a string
before processing it will either run out of memory on a large file or
simply hang forever on a live pipe, never producing any output. `descape`
processes stdin as a Node stream: each chunk that arrives is scanned once,
byte by byte, and the result is pushed to stdout immediately. The only
state carried between chunks is which stage of an escape sequence we're
currently in (see `src/stripAnsi.ts`), so memory use doesn't grow with
input size, and output starts flowing before input has finished arriving.

## building

Requires Node.js 18+ and the TypeScript compiler.

```sh
npm install
npm run build
node dist/index.js < some.log
```

There are no runtime dependencies; TypeScript is the only devDependency
and is only needed to compile `src/` to `dist/`.

## testing

```sh
npm test
```

Tests use Node's built-in `node:test` runner, so there's no extra
dependency for this either. Most of them exist to check the one thing a
byte-level state machine is most likely to get wrong: a sequence arriving
split across two `_transform` calls. Each covered sequence is tried at
every possible split point, including right after the initial ESC.

## status

Early skeleton. Handles CSI sequences (colors, cursor movement), OSC
sequences (window titles, terminated by BEL or ST), and simple two-byte
escapes. Not yet handling every obscure escape sequence a terminal might
emit — see the issues for what's next.
