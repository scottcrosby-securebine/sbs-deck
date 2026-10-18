import type { Reel } from '../canvas'
import { noise } from '../canvas'

// The starting point for a new reel. Copy it to hooks/reels/<name>.ts, change
// `name` to match the file, and draw. Files that start with `_` are tested but
// never loaded: only hooks/reels.test.tsx imports this one. See docs/reels.md.

const template: Reel = {
  // Must equal the file name: lower case letters and digits, starting with a
  // letter, and never auto, off, list or next.
  name: 'template',
  // What the reel is called to a person, and the work it comes from.
  title: 'Template',
  source: 'sbs-deck',
  // Where the picker may choose it: a context, or context:variant. Empty means
  // it plays only in the `other` pool and when pinned with /sbs anim <name>.
  // Never `other`: every reel except the rare one, the legacy reels and
  // kodama is in that pool already.
  contexts: [],
  // true puts it in the rare pool instead (about 1 turn in 50).
  rare: false,
  // At least one variant. `loop` is in frames at 8 per second. Beats name the
  // catchphrases: the first by frame 15, 12 frames apart, and a loop of at
  // least 36 frames per beat. A catchphrase is shown whole for 12 frames.
  variants: {
    main: {
      loop: 72,
      beats: [
        { at: 4, phrase: 'TEMPLATE ONLINE' },
        { at: 40, phrase: 'SWAP ME OUT' },
      ],
    },
  },

  // Pure: the same frame, seed and variant always draw the same cells.
  // `frame` counts from 0 each time the reel starts, never from the clock.
  draw(canvas, frame, seed) {
    const { cols } = canvas

    // bg: a cell background. Row 1 is a band of deep red (or slate).
    for (let col = 0; col < cols; col++) canvas.bg(col, 1, 'deep')

    // pix: a half-block pixel, 32 across by 4 down. Row 0 holds y 0 and 1.
    // A head of hot runs along the top edge, trailing off through mix, which
    // blends a slot toward base in steps of 0.25, 0.5 and 0.75.
    const head = frame % cols
    const trail = [canvas.mix('hot', 'base', 0.5), canvas.mix('hot', 'base', 0.75)]
    canvas.pix(head, 0, 'hot')
    trail.forEach((ink, i) => canvas.pix((head - 1 - i + cols) % cols, 0, ink))

    // put: a braille dot, 64 across by 8 down, with a priority. The cell's
    // colour comes from its highest-priority dot. The seed picks the column,
    // which holds for 8 frames. Keep dots out of cells that hold pixels: a
    // dot in a cell erases the pixels there, so skip the head and its trail.
    const col = 2 + Math.floor(noise(seed, frame >> 3) * (cols - 4))
    const underHead = [0, 1, 2].some(i => (head - i + cols) % cols === col)
    if (!underHead) {
      canvas.put(col * 2, 2, 'spark', 1)
      canvas.put(col * 2 + 1, 1, 'spark', 2)
    }

    // glyph: one character in a cell, never in deep ink. Cells 8 to 23 stay
    // in the 16-column form, so keep what matters there.
    'DECK'.split('').forEach((char, i) => canvas.glyph(14 + i, 1, char, 'cool'))
  },
}

export default template
