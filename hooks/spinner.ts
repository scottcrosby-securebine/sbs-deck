// The spinner line's text for one animation tick: a phrase for what the turn
// is doing, resolving out of noise when it changes, and a scanning bar. The
// phrases are science-fiction references, each filed under the state its
// plain sense reads as at a glance.

export type SpinnerMode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

export const SPINNER_PHRASES: Readonly<Record<SpinnerMode, readonly string[]>> = {
  requesting: [
    'Jacking in',
    'Opening the uplink',
    'Handshaking',
    'Tightbeaming the request',
    'Opening a tightbeam',
    'Hailing the Rocinante',
    'Raising Tycho Station',
    'Hailing beltalowda',
    'Opening hailing frequencies',
    'Calling the operator',
    'Dialing the Nebuchadnezzar',
    'Diving the net',
    'Hailing Section 9',
    'Entering the Grid',
    'Pinging the mothership',
    'Requesting docking clearance',
    'Requesting to know more',
    'Needlecasting in',
    'Phoning home',
    'Establishing a secure bind',
    'Jacking into cyberspace',
    'Hailing Wintermute',
    'Goggling into the Metaverse',
    'Entering the Black Sun',
    'Tapping the Feed',
    'Waking the Primer',
    'Calling the worm',
    'Hailing the Guild',
    'Opening the ansible',
    'Farcasting in',
    'Dialing the gate',
    'Hailing Galactica Actual',
    'Hailing on the Codec',
    'Initiating neural handshake',
    'Entering the Drift',
    'Presenting the multipass',
    'Calling Batou',
    'Hailing White Base',
    'Hailing the SDF-1',
    'Hailing Skull Leader',
    'Uplinking to Cyberdyne',
    'Hailing Skynet',
    'Requesting clothes and boots',
    'Sending recognition codes',
  ],
  thinking: [
    'Cracking the cipher',
    'Reading the black box',
    'Overclocking',
    'Listening to my ghost',
    'Consulting the Tachikomas',
    'Asking the Puppet Master',
    'Deep diving',
    'Dreaming of electric sheep',
    'Reading the digital rain',
    'Contemplating the spoon',
    'Learning kung fu',
    'Consulting the Oracle',
    'Freeing my mind',
    'Seeing the code',
    'Plotting the burn',
    'Understanding the bug',
    'Trusting Envoy intuition',
    'Reading the cortical stack',
    'Asking Poe',
    'Computing forty-two',
    'Asking Deep Thought',
    'Running Mentat computations',
    'Consulting the Three Laws',
    'Calculating the odds',
    'Calculating the jump',
    'Plotting a course',
    'Decrypting',
    'Decoding the transmission',
    'Asking the Dixie Flatline',
    'Consulting the Hosaka',
    'Asking the Librarian',
    'Listening to Reason',
    'Reading the Primer',
    'Puzzling out Castle Turing',
    'Weighing plans within plans',
    'Seeing the Golden Path',
    'Consulting prescience',
    'Consulting the Prime Radiant',
    'Computing psychohistory',
    'Consulting the TechnoCore',
    'Consulting a ship Mind',
    'Checking for gravitas',
    'Finding the enemy\'s gate',
    'Consulting MU-TH-UR',
    'Reviewing prime directives',
    'Querying the ship computer',
    'Consulting the Guide',
    'Thinking with portals',
    'Asking Cortana',
    'Consulting the precogs',
    'Going a level deeper',
    'Checking the totem',
    'Reading heptapod logograms',
    'Assessing the threat',
    'Recognizing a UNIX system',
    'Consulting the Codex',
    'Awakening as a Newtype',
    'Sensing a Newtype flash',
    'Decoding protoculture',
    'Reading the HUD',
    'Checking the neural net CPU',
    'Consulting the Hybrid',
    'Charting the way to Earth',
  ],
  'tool-input': [
    'Calibrating',
    'Compiling the payload',
    'Arming the daemon',
    'Forging the packet',
    'Booting the deck',
    'Compiling the icebreaker',
    'Slotting the chip',
    'Loading the quickhack',
    'Loading the Construct',
    'Loading a pilot program',
    'Loading the jump program',
    'Loading guns, lots of guns',
    'Priming the thermoptics',
    'Prepping for the drop',
    'Suiting up',
    'Hitting the crash couch',
    'Loading the PDCs',
    'Charging the railgun',
    'Warming up the reactor',
    'Checking the suit seals',
    'Prepping the Roci',
    'Prepping a fresh sleeve',
    'Priming the neurachem',
    'Spooling up the FTL drive',
    'Setting the jump coordinates',
    'Charging the capacitors',
    'Booting the Ono-Sendai',
    'Slotting the Kuang virus',
    'Slotting a microsoft',
    'Compiling the nam-shub',
    'Priming the matter compiler',
    'Rallying the Mouse Army',
    'Setting the thumper',
    'Donning the stillsuit',
    'Raising the Holtzman shield',
    'Setting phasers to stun',
    'Raising shields',
    'Locking S-foils',
    'Grabbing my towel',
    'Raising the sync ratio',
    'Getting in the robot',
    'Locking chevron seven',
    'Charging the flux capacitor',
    'Setting humor to 75 percent',
    'Unfolding a sophon',
    'Appeasing the machine spirit',
    'Reciting rites of activation',
    'Raising the attack barrier',
    'Feeding the Tachikomas oil',
    'Prepping the mobile suit',
    'Loading the catapult deck',
    'Drawing the beam saber',
    'Charging the reflex cannon',
    'Spooling the fold drive',
    'Switching to Battloid mode',
    'Setting CPU to read/write',
    'Reloading the shotgun',
    'Setting Condition One',
  ],
  'tool-use': [
    'Administering Voight-Kampff',
    'Running a baseline test',
    'Checking doors and corners',
    'Lighting the Epstein drive',
    'Rerouting power',
    'Reversing the polarity',
    'Probing the net',
    'Riding the wire',
    'Walking the stack',
    'Sweeping the ports',
    'Tunneling',
    'Breaking the ICE',
    'Riding the simstim',
    'Running the shadows',
    'Slicing the firewall',
    'Hacking the Gibson',
    'Running Breach Protocol',
    'Executing the quickhack',
    'Pulling the data shard',
    'Sending in the Tachikomas',
    'Bug hunting',
    'Killing bugs',
    'Doing my part',
    'Making the drop',
    'Deploying Mobile Infantry',
    'Burning hard',
    'Firing the PDCs',
    'Clearing the room',
    'Running on neurachem',
    'Watching the motion tracker',
    'Making it so',
    'Punching it',
    'Jumping to lightspeed',
    'Staying on target',
    'Making the Kessel Run',
    'Letting the spice flow',
    'Running Kuang Mark Eleven',
    'Cutting black ICE',
    'Raiding Sense/Net',
    'Storming Straylight',
    'Running the matter compiler',
    'Compiling from the Feed',
    'Unleashing the Mouse Army',
    'Riding the sandworm',
    'Walking without rhythm',
    'Folding space',
    'Harvesting the spice',
    'Crossing the deep desert',
    'Searching the Jedi archives',
    'Running a level 3 diagnostic',
    'Scanning with the tricorder',
    'Energizing',
    'Giving her all she\'s got',
    'Opening the pod bay doors',
    'Keeping Serenity flying',
    'Drilling in the Battle Room',
    'Displacing a knife missile',
    'Engaging Improbability Drive',
    'Waving the sonic screwdriver',
    'Fighting for the Users',
    'Chasing the bounty',
    'Finishing the fight',
    'Testing, for science',
    'Sneaking in a cardboard box',
    'Hitting 88 miles per hour',
    'Crossing the streams',
    'Hacking the planet',
    'Sciencing the shit out of it',
    'Looping the day',
    'Purging the heresy',
    'Breaching the attack barrier',
    'Scanning the cyberbrain',
    'Chasing the Laughing Man',
    'Launching the Gundam',
    'Firing the beam rifle',
    'Spreading Minovsky particles',
    'Going three times faster',
    'Dropping the colony',
    'Activating Trans-Am',
    'Scrambling the Veritechs',
    'Executing a space fold',
    'Pulling a Daedalus Maneuver',
    'Firing the main gun',
    'Terminating the target',
    'Displacing through time',
    'Hunting Sarah Connor',
    'Launching the alert Vipers',
    'Jumping the fleet',
    'Rolling the hard six',
    'Running the Adama Maneuver',
    'Checking for Cylons',
  ],
  responding: [
    'Uploading the take',
    'Piping the feed',
    'Tightbeaming the reply',
    'Broadcasting to the Belt',
    'Making it clear, sasa ke?',
    'Needlecasting the reply',
    'Printing the readout',
    'Rendering the hologram',
    'Transmitting on all bands',
    'Filing the after-action',
    'Writing the debrief',
    'Letting you know more',
    'Reporting to the Major',
    'Whispering back',
    'Surfacing with the answer',
    'Recording the captain\'s log',
    'Beaming it down',
    'Sending the Death Star plans',
    'Delivering the pizza',
    'Reporting to Armitage',
    'Uploading intel to the CIC',
    'Handing over the hypercard',
    'Racting the reply',
    'Writing on mediatronic paper',
    'Speaking with the Voice',
    'Broadcasting on the ansible',
    'Filing the Guide entry',
    'Transmitting to Starfleet',
    'Logging the sol entry',
    'Briefing Aramaki',
    'Reporting to Bright',
    'Reporting to Captain Gloval',
    'Singing like Minmei',
    'Saying hasta la vista',
    'Promising I\'ll be back',
    'Giving the thumbs up',
    'Reporting to the CIC',
    'Saying so say we all',
    'Citing the Codex Astartes',
  ],
}

const NOISE = '▓▒░█#%&@$01<>/=+'
// Ticks a phrase takes to resolve, whatever its length: under a second, so a
// state that lasts only a moment still shows a readable phrase.
const REVEAL_TICKS = 5
// Once resolved, one character flickers back to noise every this many ticks.
const GLITCH_PERIOD = 23
const BAR_CELLS = 6

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

// A step through a pool of `size` that visits every entry before repeating
// one, and does not simply walk the list in the order it is written.
function strideFor(size: number): number {
  return [31, 37, 41, 43].find(stride => greatestCommonDivisor(stride, size) === 1) ?? 1
}

// The phrase for a mode at one pick. The caller keeps a pick per mode and
// advances it each time the turn enters that mode, so `size` picks in a row
// show every phrase of the pool once.
export function phraseFor(mode: SpinnerMode, pick: number): string {
  const phrases = SPINNER_PHRASES[mode]
  const index = Number.isFinite(pick) ? Math.abs(Math.trunc(pick)) : 0

  return phrases[(index * strideFor(phrases.length)) % phrases.length] ?? phrases[0] ?? ''
}

function noiseAt(tick: number, index: number): string {
  return NOISE[(tick * 7 + index * 13) % NOISE.length] ?? '#'
}

// `age` is the ticks since this phrase came up: it decrypts left to right.
export function decrypt(phrase: string, age: number, tick: number): string {
  const revealed = Math.ceil((phrase.length * Math.max(0, age)) / REVEAL_TICKS)
  const isResolved = revealed >= phrase.length
  const glitchAt = isResolved && tick % GLITCH_PERIOD === 0 ? (tick / GLITCH_PERIOD) * 5 % phrase.length : -1

  return [...phrase]
    .map((character, index) => {
      const isNoise = character !== ' ' && (index >= revealed || index === glitchAt)

      return isNoise ? noiseAt(tick, index) : character
    })
    .join('')
}

// A two-cell block that sweeps the bar and bounces off its ends.
export function scanBar(tick: number): string {
  const span = BAR_CELLS - 2
  const step = tick % (span * 2)
  const start = step <= span ? step : span * 2 - step

  return Array.from({ length: BAR_CELLS }, (_, index) =>
    index === start || index === start + 1 ? '▰' : '▱',
  ).join('')
}

// Pixel animations for the end of the spinner line. A braille character is a
// 2 by 4 grid of dots, so a strip of them is a small screen: 8 cells give 16
// by 4 pixels. Each animation says which pixels are lit at a frame.
const STRIP_CELLS = 8
const STRIP_WIDTH = STRIP_CELLS * 2
const STRIP_HEIGHT = 4
// The braille dot for each (column, row) of a cell, as its bit.
const DOT_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const

type Lit = (x: number, y: number, frame: number) => boolean

function strip(lit: Lit, frame: number): string {
  let out = ''

  for (let cell = 0; cell < STRIP_CELLS; cell += 1) {
    let bits = 0

    for (let column = 0; column < 2; column += 1) {
      for (let row = 0; row < STRIP_HEIGHT; row += 1) {
        if (lit(cell * 2 + column, row, frame)) {
          bits |= DOT_BITS[column]?.[row] ?? 0
        }
      }
    }

    out += String.fromCharCode(0x2800 + bits)
  }

  return out
}

// A steady pseudo-random number in 0..n-1 for a column.
function scatter(x: number, n: number): number {
  let hash = Math.imul(x + 1, 2654435761) >>> 0
  hash ^= hash >>> 15
  hash = Math.imul(hash, 2246822519) >>> 0
  hash ^= hash >>> 13

  // The middle bits: the lowest ones repeat in short runs.
  return ((hash >>> 9) & 0xffff) % n
}

const BLOCKS = '▁▂▃▄▅▆▇█'

// Back and forth between 0 and `span`, one step a frame.
function bounce(frame: number, span: number): number {
  const step = frame % (span * 2)

  return step <= span ? step : span * 2 - step
}

// A space invader, six pixels wide, in its two poses.
const INVADER = [
  ['.#..#.', '######', '#.##.#', '#....#'],
  ['.#..#.', '######', '#.##.#', '.#..#.'],
] as const

// "SBS" in Morse, as on and off pixels: a dot is one on, a dash three.
const MORSE = '1010100011101010100010101000000'

// Conway's Game of Life on the strip, wrapped at its edges: a scattering of
// cells run for a couple of dozen generations, then a fresh scattering.
const LIFE_RUN = 24
const LIFE_FALLBACK = ['..#......##.....', '...#.....##.....', '.###............', '................'].map(row =>
  [...row].map(cell => cell === '#'),
)

// The world to draw: one that has died out shows its seed again, and a seed
// that came up empty shows a fixed pattern, so the strip is never blank.
export function livingWorld(grid: boolean[][], seed: boolean[][]): boolean[][] {
  const hasLife = (world: boolean[][]) => world.some(row => row.some(Boolean))

  return hasLife(grid) ? grid : hasLife(seed) ? seed : LIFE_FALLBACK
}

function lifeAt(frame: number): boolean[][] {
  const epoch = Math.floor(frame / LIFE_RUN)
  const seed = Array.from({ length: STRIP_HEIGHT }, (_, y) =>
    Array.from({ length: STRIP_WIDTH }, (_, x) => scatter(x + y * STRIP_WIDTH + epoch * 64, 3) === 0),
  )

  let grid = seed

  for (let generation = frame % LIFE_RUN; generation > 0; generation -= 1) {
    grid = grid.map((row, y) =>
      row.map((alive, x) => {
        let near = 0

        for (const dy of [-1, 0, 1]) {
          for (const dx of [-1, 0, 1]) {
            if ((dx !== 0 || dy !== 0) && grid[(y + dy + STRIP_HEIGHT) % STRIP_HEIGHT]?.[(x + dx + STRIP_WIDTH) % STRIP_WIDTH]) {
              near += 1
            }
          }
        }

        return near === 3 || (alive && near === 2)
      }),
    )
  }

  return livingWorld(grid, seed)
}

export const ANIMATIONS: Readonly<Record<string, (frame: number) => string>> = {
  // The original two-cell block bouncing along a bar.
  bar: scanBar,
  // A sine wave rolling left.
  wave: frame => strip((x, y, f) => y === Math.round(1.5 + 1.5 * Math.sin((x + f) * 0.6)), frame),
  // A scanning eye with a fading trail, sweeping side to side.
  cylon: frame =>
    strip((x, y, f) => {
      const span = STRIP_WIDTH - 1
      const step = f % (span * 2)
      const head = step <= span ? step : span * 2 - step
      const gap = Math.abs(x - head)

      return gap === 0 || (gap === 1 && y > 0 && y < 3) || (gap === 2 && y === 2)
    }, frame),
  // Drops falling at their own pace, as the digital rain.
  rain: frame =>
    strip((x, y, f) => {
      const drop = (f + scatter(x, 9)) % (STRIP_HEIGHT + 2 + scatter(x + 3, 4))

      return y === drop || y === drop - 1
    }, frame),
  // A heartbeat trace travelling along a baseline.
  pulse: frame =>
    strip((x, y, f) => {
      const beat = [2, 1, 0, 3, 2][(x - f) & 15] ?? 2

      return y === beat
    }, frame),
  // Two strands twisting round each other.
  helix: frame =>
    strip((x, y, f) => {
      const a = Math.round(1.5 + 1.5 * Math.sin((x + f) * 0.5))
      const b = Math.round(1.5 - 1.5 * Math.sin((x + f) * 0.5))

      return y === a || y === b
    }, frame),
  // A column of pixels filling from the left and draining again.
  load: frame =>
    strip((x, y, f) => {
      const filled = f % (STRIP_WIDTH * 2)

      return filled <= STRIP_WIDTH ? x < filled : x >= filled - STRIP_WIDTH
    }, frame),
  // Stars streaming past at different speeds.
  stars: frame =>
    strip((x, y, f) => (x + f * (1 + (y & 1)) + y * 5) % (6 + y) === 0, frame),
  // A ping spreading out from the middle.
  sonar: frame =>
    strip((x, y, f) => {
      const reach = Math.floor(Math.abs(x - 7.5))

      const ring = f % 9

      return (y > 0 && y < 3 && (reach === ring || reach === ring - 4)) || reach === 0
    }, frame),
  // Flames flickering along the bottom.
  fire: frame => strip((x, y, f) => y >= STRIP_HEIGHT - 1 - scatter(x + f * 101, 4), frame),
  // A comet crossing with a ragged tail.
  comet: frame =>
    strip((x, y, f) => {
      const head = f % 23
      const behind = head - x

      return (behind === 0 && y > 0 && y < 3) || (behind > 0 && behind < 4 && y === 2) || (behind >= 4 && behind < 8 && y === 2 && (x & 1) === 0)
    }, frame),
  // A game of Pong: two paddles tracking a bouncing ball.
  pong: frame =>
    strip((x, y, f) => {
      const ballX = 1 + bounce(f, 13)
      const ballY = bounce(f, 3)
      const paddle = Math.min(2, ballY)

      return (x === ballX && y === ballY) || ((x === 0 || x === STRIP_WIDTH - 1) && (y === paddle || y === paddle + 1))
    }, frame),
  // A space invader marching side to side.
  invader: frame =>
    strip((x, y, f) => {
      const left = bounce(Math.floor(f / 2), STRIP_WIDTH - 6)

      return INVADER[Math.floor(f / 2) & 1]?.[y]?.[x - left] === '#'
    }, frame),
  // Conway's Game of Life, reseeded every couple of dozen generations.
  life: frame => {
    const grid = lifeAt(frame)

    return strip((x, y) => grid[y]?.[x] === true, frame)
  },
  // Streaks rushing out from the centre: the jump to lightspeed.
  warp: frame =>
    strip((x, y, f) => {
      const reach = Math.floor(Math.abs(x - 7.5))
      const period = 5 + y
      const phase = (((reach - f * (1 + (y & 1))) % period) + period) % period

      return phase < (reach > 4 ? 2 : 1)
    }, frame),
  // A moon circling a planet.
  orbit: frame =>
    strip((x, y, f) => {
      const moonX = Math.round(7.5 + 7 * Math.cos(f * 0.45))
      const moonY = Math.round(1.5 + 1.5 * Math.sin(f * 0.45))

      return (x === moonX && y === moonY) || ((x === 7 || x === 8) && y > 0 && y < 3)
    }, frame),
  // "SBS" keyed out in Morse, scrolling past.
  morse: frame => strip((x, y, f) => y > 0 && y < 3 && MORSE[(x + f) % MORSE.length] === '1', frame),
  // A shield wall pushing out from the centre.
  shield: frame =>
    strip((x, y, f) => {
      const reach = Math.floor(Math.abs(x - 7.5))
      const edge = f % 9

      return reach === edge || (reach < edge && (y === 0 || y === STRIP_HEIGHT - 1))
    }, frame),
  // Ones and zeroes streaming by.
  binary: frame => Array.from({ length: STRIP_CELLS }, (_, cell) => (scatter(cell + frame, 2) === 0 ? '0' : '1')).join(''),
  // Static: a burst of noise characters.
  glitch: frame => Array.from({ length: STRIP_CELLS }, (_, cell) => (scatter(cell * 3 + frame, 5) === 0 ? ' ' : noiseAt(frame, cell))).join(''),
  // Chevrons locking one after another.
  dial: frame => Array.from({ length: STRIP_CELLS }, (_, cell) => (cell < (Math.floor(frame / 2) % (STRIP_CELLS + 2)) ? '◆' : '◇')).join(''),
  // An equaliser of block bars.
  eq: frame =>
    Array.from({ length: STRIP_CELLS }, (_, x) => {
      const level = Math.abs(Math.sin(frame * 0.45 + x * 1.3) * Math.cos(frame * 0.17 + x * 0.7))

      return BLOCKS[Math.min(BLOCKS.length - 1, Math.floor(level * BLOCKS.length))] ?? '▁'
    }).join(''),
}

// In `auto`, a phrase gets a themed animation only where its own words call
// for one: rain for the digital rain, a scanning eye for a scan, stars for a
// jump. Every other phrase keeps the plain bar. The first rule that matches
// wins.
export const AUTO = 'auto'

const THEMES: readonly (readonly [string, RegExp])[] = [
  ['rain', /\brain\b|Seeing the code/i],
  ['invader', /\bbugs?\b|Mobile Infantry/i],
  ['dial', /Dialing|chevron/i],
  ['shield', /^Raising (shields|the Holtzman shield|the attack barrier)/i],
  ['warp', /lightspeed|Punching it|Kessel|space fold|Folding space|Improbability|88 miles|Jumping the fleet|through time|Adama Maneuver/i],
  ['comet', /tightbeam|Death Star plans|^Beaming|Needlecasting|Farcasting|^Firing the (beam rifle|main gun|PDCs)/i],
  ['fire', /^(Lighting|Burning)\b|reactor|heresy/i],
  ['sonar', /Pinging|motion tracker|Sweeping the ports|Probing|tricorder|Jedi archives/i],
  ['morse', /^(Hailing|Transmitting|Broadcasting)\b|hailing frequencies|recognition codes|Opening the uplink|^Uplinking|Tycho Station/i],
  ['binary', /Decrypting|cipher|Decoding the transmission|Hacking|Slicing|\bICE\b|Breach Protocol|Kuang|UNIX|^Executing the quickhack|Breaching the attack barrier/i],
  ['glitch', /Jacking|the Grid|Metaverse|cyberspace|Black Sun|Diving the net|Minovsky/i],
  ['stars', /Plotting the burn|Plotting a course|Calculating the jump|jump coordinates|way to Earth|times faster/i],
  ['life', /Computing|computations|Calculating|psychohistory|Prime Radiant/i],
  ['orbit', /docking|the colony/i],
  ['cylon', /Cylon|\bHUD\b|Sarah Connor|Terminating|Scanning|Voight-Kampff|baseline test/i],
  ['load', /^(Loading|Reloading|Booting|Uploading|Compiling|Spooling|Priming|Charging)\b|matter compiler/i],
  ['wave', /sandworm|the worm|deep desert|Deep diving|Surfacing|\bspice\b/i],
  ['helix', /sleeve|cortical stack|neurachem|protoculture|neural handshake|sync ratio|Newtype|the Drift/i],
  ['pulse', /^(Handshaking|Listening)\b|Phoning home|ansible|thumper/i],
  ['eq', /Overclocking|Rerouting power|Reversing the polarity|Minmei|with the Voice/i],
]

export function animationFor(choice: string, phrase: string): string {
  if (choice !== AUTO) {
    return choice
  }

  return THEMES.find(([, pattern]) => pattern.test(phrase))?.[0] ?? 'bar'
}
