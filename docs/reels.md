# Reels

A reel is the 32 by 2 cell animation beside the working line. Each one is a single file in `hooks/reels/`, and you can add one without touching any other code. This page covers how the picker chooses reels, what a reel file holds, how to check one, and the steps to add your own.

## Where reels play

The working line has three forms, set by the terminal:

| Terminal | Form |
|---|---|
| 80 columns or more | Two rows: the reel at 32 cells, then the phrase and the readout |
| 60 to 79 columns | Two rows, with the reel at 16 cells |
| Under 60 columns, width unknown, under 12 rows, the desktop app, VS Code, or `/sbs anim off` | One row, no reel |

With no reel there is no catchphrase either. Both themes draw the line on a black plate, and the reels use the theme's own five colors (slots, below).

Commands:

- `/sbs anim list` prints every reel name. Legacy reels are marked, the rare reel is marked, reels switched off in `/config` are marked `(off)`, and any reel file missing from the index or from `plugin.json` is listed with the line to add.
- `/sbs anim <name>` pins one reel everywhere. `/sbs anim auto` returns to the picker. `/sbs anim off` stops all motion.
- `/sbs anim` or `/sbs anim next` steps to the next new reel. It skips the rare reel and reels switched off, and it never lands on a legacy reel: those 22 are reached by name only.
- `/config`, search `Reel`: one switch per new reel, on by default. A reel switched off is never picked in `auto` and the rare roll skips it, but `/sbs anim <name>` still pins it. `/sbs status` names the reels that are off.

## What the picker does

In `auto`, the picker reads what Claude is doing and draws from that context's pool. The first row that matches wins. With tools running in parallel, the most recently started tool counts.

| Context | When | Pool |
|---|---|---|
| `agents` | An `Agent` or `Task` call runs, or the spinner belongs to a subagent | Together strong, Sandevistan |
| `long-wait` | The spinner's mode and running tool have not changed for 60 seconds | Vortex, Forest spirit |
| `shell` | The running tool is `Bash` | Digital rain, Breach Protocol, Light cycles |
| `edit` | `Edit`, `Write` or `NotebookEdit` runs | Ghost line, Light cycles |
| `web` | `WebSearch`, `WebFetch`, or an MCP tool whose name contains `fetch` runs | Jupiter 2, Ghost line (net-dive variant) |
| `thinking` | Claude is thinking | Breach Protocol, Don't panic (deep-thought variant), Hokuto Shinken (seven-stars variant) |
| `requesting` | Claude is sending a request | Hokuto Shinken (flurry variant), Sandevistan |
| `other` | Anything else | Every reel that is not rare, not legacy and not Forest spirit |

The pools come from each reel's `contexts` list, so a new reel joins a pool by naming it there. `other` is never written in `contexts`. A context that no reel names, or whose reels are all switched off in `/config`, falls back to the `other` pool without the reels switched off. With every new reel off, `auto` plays the legacy `bar`.

- One shuffled bag per context, shared by every spinner in the session. No reel repeats until the bag is empty, and a refill never starts with the reel that just played. Bags reset at session start, at `/clear`, and when a `/config` reel switch changes.
- A spinner draws from the bag when it first appears and each time its reel finishes a loop. Each loop takes a fresh random seed, so no two loops are alike.
- When the context changes, the playing reel finishes its current phase (or its loop, if that ends first) and then picks again. A second change during that wait does not move the end. If the new context's pool holds the playing reel, the reel plays on instead.
- About 1 turn in 50, the main spinner's first pick of a turn plays the rare reel, the Eye of Sauron, for one whole loop and then returns to the bag.
- A reel with several variants rotates through them, one per play, for the whole session. A new session and `/clear` start the rotation again.

## Seeds

Every loop takes a new random seed (a 31-bit integer), which the reel uses to vary its frames. The `noise` function in `hooks/canvas.ts` turns numbers into a repeatable value between 0 and 1, so `noise(seed, frame)` is the same on every call with the same inputs. Use it for anything that should differ from loop to loop. Never use `Math.random` or the clock in `draw`.

The flash rule is a safety rule, and a rule that only passes for seeds 1 to 3 would not protect anyone, because real seeds are random. So the shared test runs every indexed reel twice: once on seeds 1 to 3 in full, and once on the same checks shifted by each of 12 seed offsets (see `SEED_OFFSETS` in `hooks/reels.test.tsx`). The second run skips the `seed` rule, since shifted seeds 1 and 2 are just two more seeds. A failure from the second run has a leading number:

```
the <name> reel meets the reel rules on many seeds
  447: flash: variant <variant>, seed 2, form 32, theme nightcity, frame 17, ...
```

The `447` is the offset. The seed named inside the detail is the base seed (1, 2 or 3), and the reel actually drew `seed + 447`. To reproduce, call the reel's `draw` with that sum. The first-run test, which has no leading number, fails for the same reasons on seeds 1 to 3.

The usual causes:

- Seeded sprites stepping into the same cells at a loop or variant junction. Two things that move by seed can land on one cell at the frame where a loop ends and the next begins, or where one variant gives way to another, and the cell jumps brighter and darker too fast. Keep seeded paths from sharing cells at frame 0 and at the last frame, or give the first and last frames fixed positions.
- Seed-dependent mass rises in the 16-column form. The 16-column form crops the middle of the canvas. A seed that puts a lot of bright art inside the crop at the start of a loop can make more than 8 of its 32 cells rise at once. Spread the art, or ramp it in over a few frames.

## What is in a reel file

`hooks/reels/<name>.ts`, with the file name equal to the `name`:

```ts
import type { Reel } from '../canvas'
import { noise } from '../canvas'

const mine: Reel = {
  name: 'mine',
  title: 'My reel',
  source: 'where the idea comes from',
  contexts: ['shell', 'thinking:calm'],
  rare: false,
  variants: {
    calm: { loop: 72, beats: [{ at: 4, phrase: 'FIRST WORDS' }, { at: 40, phrase: 'SECOND WORDS' }] },
  },
  draw(canvas, frame, seed, variant) { /* pure: same inputs, same cells */ },
}

export default mine
```

`hooks/reels/_template.ts` is a small working reel with every call below and a comment on each part. Start from it.

| Field | Meaning |
|---|---|
| `name` | Lower case letters and digits, starting with a letter, the same as the file name. Never `auto`, `off`, `list` or `next`. Unique across all reels |
| `title`, `source` | A display name, and the work the reel comes from |
| `contexts` | Where the picker may choose it: a context, or `context:variant` to play one variant there. Empty means it plays only in the `other` pool and when pinned |
| `rare` | `true` puts it in the rare pool instead of the context pools |
| `variants` | At least one. Each has a `loop` (frames, 8 to the second) and `beats` |
| `compact` | Optional. `true` draws the 16-cell form on a 16-cell canvas of its own, and the full form on 32 cells as usual. Without it the reel draws on 32 cells and the 16-cell form shows columns 8 to 23 |
| `draw` | Draws one frame. It must not touch anything outside its arguments |

`frame` counts from 0 each time the reel starts on a spinner, never from the clock, so every play opens at its beginning. `variant` is the variant name for this play.

### Beats and catchphrases

A beat is `{ at, phrase }`: at frame `at` the catchphrase replaces the working-line phrase for 12 frames, then the phrase returns. A phase runs from one beat to the next, the last wrapping around to the first. The rules for beats are in the table below.

A catchphrase is 1 to 28 printable ASCII characters, appears nowhere else in the library, and says nothing that suggests Claude has failed or warns or insults the user. Each reel file is the register of its own catchphrases. See [`docs/phrases.md`](phrases.md).

### Canvas calls

The canvas is 2 rows of `canvas.cols` cells: 32, or 16 when a `compact` reel draws its 16-cell form. Each cell can hold a background, two half-block pixels, up to eight braille dots and one glyph. The top layer wins: background, then pixels, then dots, then glyph. Coordinates are rounded to the nearest whole number, and a call outside the canvas does nothing.

| Call | Sets | Coordinates |
|---|---|---|
| `bg(col, row, ink)` | A cell's background | `col` 0 to cols - 1, `row` 0 to 1 |
| `pix(x, y, ink)` | A half-block pixel | `x` 0 to cols - 1, `y` 0 to 3. Row 0 holds `y` 0 and 1, row 1 holds 2 and 3 |
| `put(x, y, ink, priority = 1)` | A braille dot | `x` 0 to 2 x cols - 1, `y` 0 to 7. The cell is `x / 2` across, `y / 4` down. The highest priority dot in a cell sets its color, and a tie goes to the first in the cell's scan order: the left column top to bottom, then the right |
| `glyph(col, row, char, ink)` | One character in a cell | As `bg`. It never uses `deep` |
| `mix(a, b, t)` | Returns a blended ink for the other calls | `t` is 0.25, 0.5 or 0.75 |

An ink is a slot name, or the result of `mix`. A later call in the same cell and layer replaces an earlier one, except `put`, which keeps the higher priority.

Glyphs are single-width only: half-width katakana (U+FF66 to U+FF9D), ASCII, and block and box characters (U+2500 to U+259F).

Two layering traps:

- A braille dot in a cell erases the pixels in that cell. Keep dots out of cells that hold pixels, or draw the pixels in the neighbouring cells.
- A figure needs contrast with what is behind it. Check each figure against the background and the other layers it crosses, in both themes, and not just the one you drew in.

### Slots

An ink names one of five slots, and each theme paints them its own way:

| Slot | SecureBine | Night City |
|---|---|---|
| `base` | black `#000000` | black `#000000` |
| `hot` | magenta `#FF2E97` | red `#C5003C` |
| `deep` | slate `#46637B` | dark red `#880425` |
| `spark` | gold `#F5A701` | acid yellow `#F3E600` |
| `cool` | cyan `#00E5FF` | aqua `#55EAD4` |

Draw with slot names only, never a hex value. A hex literal anywhere in `hooks/` outside `hooks/theme.ts` fails the repo's check. A cell with no background counts as `base`. `mix(a, b, t)` blends from `a` toward `b`. It may blend toward `base`, or `hot` with `deep`, and counts as its non-base slot (or as both, when it blends hot and deep).

Standing rule: every new content item sbs-deck gains gets its own custom graphic in the Night City palette, using all five colors, and a reel that passes every rule but looks timid is not done.

## The rules

The shared test checks each indexed reel on seeds 1 to 3, on both forms and in both themes where the rule needs it, and names the reel that fails. Each failure prints as `<rule>: <detail>`, and the detail says which variant, seed, form, theme and frame it found.

| Rule | What it measures | What a failure line means |
|---|---|---|
| `names` | Name matches `^[a-z][a-z0-9]*$`, is not reserved, and is used once | The name is badly formed, is `auto`, `off`, `list` or `next`, or two reels share it |
| `glyphs` | Every glyph is one code point from the allowed ranges and not in `deep` | The glyph named is more than one code point, is outside the allowed ranges, or is drawn in deep ink |
| `slots` | Every ink is a slot, and every `mix` uses `t` of 0.25, 0.5 or 0.75 toward base or between hot and deep | The ink named is not a slot, the `t` is another number, or the blend is between two non-base slots other than hot and deep |
| `color` | Across each phase, at least 4 of the 5 slots appear, base included | The phase named shows too few slots. Add the missing color to that stretch of frames |
| `coverage` | Averaged over each phase, at least 30% of the 64 cells have a background or a block pixel in a slot other than base | The phase named is too empty. The line gives the percentage it measured |
| `beats` | `loop` is a positive whole number. Beat frames are whole, increasing and not negative. The first beat is at frame 15 or earlier. Beats are at least 12 frames apart. The last beat is at least 12 frames before the loop's end. The loop is at least 36 frames per beat | The line names the number that breaks the rule, for example a beat 10 frames after the one before it |
| `flash` | No cell has 5 or more opposing brightness changes in any 8 frames (a change counts at 0.10 or more, with the darker side under 0.80). At most one frame per loop where more than 16 of the 64 cells (more than 8 of 32 in the 16-cell form) each rise in brightness by 0.10 or more. Measured in both themes, each in truecolor and as a 256-color terminal draws it (each color rounded to the cube, as Claude Code does under tmux) | Either `5 or more counted changes in 8 frames` with the cell at `column,row`, or `frames ... each have more than N cells rising by 0.10 or more`. A finding measured at 256 colors reads `theme <name> at 256 colors`. `(after variant A seed S)` marks a junction: it appeared where variant A on seed S gave way to this variant. Every ordered pair of variants is tried, a variant followed by itself included, because the variant order is shared by every spinner and can skip one |
| `phrases` | Each catchphrase is 1 to 28 printable ASCII characters and appears once in the whole library | The catchphrase named is too long, has a character outside printable ASCII, or repeats another reel's |
| `seed` | Seeds 1 and 2 must draw different frames | The reel ignores its seed. Feed `seed` through `noise` into something visible |

Two rules the test cannot measure: the phrase wording review (no suggestion of failure, no warning or insult to the user) and how the reel looks. Look at it playing before you call it done.

### Keeping a reel inside the rules

- Keep module-level caches bounded. A `Map` that gains one entry per seed or per frame grows for as long as the session runs. Key it by something with a small range, or clear it.
- Keep braille dots out of cells that hold pixels (above).
- Keep a figure contrasting with what is behind it (above).
- Retime a reel by adding story, not by slowing the motion. A longer loop is filled with more action.

## Add a reel

Do this in the git clone that the README installs at `~/.claude/mods/sbs-deck`. A marketplace install is not checked.

1. Copy the template: `cp hooks/reels/_template.ts hooks/reels/<name>.ts`. Set `name` to `<name>`, and the other fields as above.
2. Add one line to `hooks/reels/index.ts`:
   ```ts
   export { default as <name> } from './<name>'
   ```
   The mod only loads files that `index.ts` names. If you forget the line, a toast at session start names it and `/sbs anim list` prints the exact line for every reel file left out.
3. Add its `/config` switch to `userConfig` in `.claude-plugin/plugin.json`. The field is `reel` plus the name with its first letter capitalized:
   ```json
   "reelMine": { "type": "boolean", "title": "Reel: My reel", "description": "From where the idea comes from. In auto it plays for shell commands and anything else.", "required": false, "default": true }
   ```
   Without it the reel plays as if switched on but has no row in `/config`. A toast at session start and `/sbs anim list` give the line to add, and `claude plugin test .` fails until it is there.
4. Draw it, and run `claude plugin test .` until it passes. The test checks only reels named in the index, so a reel without its line is never tested. The whole suite takes about a minute.
5. Reload. Claude Code watches the folder, so a running session picks the change up once the main loop is idle, not while a turn runs. Pin the reel with `/sbs anim <name>` and watch it at 80 columns or wider. Then try 70 columns for the 16-cell form.
6. Run the other checks from the README before you commit.

A file whose name starts with `_` is tested but never loaded. That is why `_template.ts` can sit in the folder: only `hooks/reels.test.tsx` imports it.
