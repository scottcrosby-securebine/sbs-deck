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
  return ((x * 7919 + 104729) >>> 3) % n
}

const BLOCKS = '▁▂▃▄▅▆▇█'

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
  // An equaliser of block bars.
  eq: frame =>
    Array.from({ length: STRIP_CELLS }, (_, x) => {
      const level = Math.abs(Math.sin(frame * 0.45 + x * 1.3) * Math.cos(frame * 0.17 + x * 0.7))

      return BLOCKS[Math.min(BLOCKS.length - 1, Math.floor(level * BLOCKS.length))] ?? '▁'
    }).join(''),
}

// In `auto`, the animation suits the phrase on show: the work it comes from
// where that suggests one, and otherwise what the turn is doing.
export const AUTO = 'auto'

const STATE_ANIMATION: Readonly<Record<SpinnerMode, string>> = {
  requesting: 'pulse',
  thinking: 'wave',
  'tool-input': 'load',
  'tool-use': 'eq',
  responding: 'bar',
}

// Generated from docs/phrases.md by the source of each phrase.
const PHRASE_ANIMATION: Readonly<Record<string, string>> = {
  'Jacking in': 'rain',
  'Opening the uplink': 'eq',
  'Handshaking': 'eq',
  'Tightbeaming the request': 'stars',
  'Opening a tightbeam': 'stars',
  'Hailing the Rocinante': 'stars',
  'Raising Tycho Station': 'stars',
  'Hailing beltalowda': 'stars',
  'Opening hailing frequencies': 'stars',
  'Calling the operator': 'rain',
  'Dialing the Nebuchadnezzar': 'rain',
  'Diving the net': 'wave',
  'Hailing Section 9': 'wave',
  'Entering the Grid': 'eq',
  'Pinging the mothership': 'stars',
  'Requesting docking clearance': 'stars',
  'Requesting to know more': 'stars',
  'Needlecasting in': 'helix',
  'Phoning home': 'pulse',
  'Establishing a secure bind': 'pulse',
  'Jacking into cyberspace': 'eq',
  'Hailing Wintermute': 'eq',
  'Goggling into the Metaverse': 'eq',
  'Entering the Black Sun': 'eq',
  'Tapping the Feed': 'helix',
  'Waking the Primer': 'helix',
  'Calling the worm': 'wave',
  'Hailing the Guild': 'wave',
  'Opening the ansible': 'stars',
  'Farcasting in': 'stars',
  'Dialing the gate': 'stars',
  'Hailing Galactica Actual': 'cylon',
  'Hailing on the Codec': 'eq',
  'Initiating neural handshake': 'pulse',
  'Entering the Drift': 'pulse',
  'Presenting the multipass': 'pulse',
  'Calling Batou': 'wave',
  'Hailing White Base': 'stars',
  'Hailing the SDF-1': 'stars',
  'Hailing Skull Leader': 'stars',
  'Uplinking to Cyberdyne': 'cylon',
  'Hailing Skynet': 'cylon',
  'Requesting clothes and boots': 'cylon',
  'Sending recognition codes': 'cylon',
  'Cracking the cipher': 'eq',
  'Overclocking': 'pulse',
  'Listening to my ghost': 'wave',
  'Consulting the Tachikomas': 'wave',
  'Asking the Puppet Master': 'wave',
  'Deep diving': 'wave',
  'Dreaming of electric sheep': 'rain',
  'Reading the digital rain': 'rain',
  'Contemplating the spoon': 'rain',
  'Learning kung fu': 'rain',
  'Consulting the Oracle': 'rain',
  'Freeing my mind': 'rain',
  'Seeing the code': 'rain',
  'Plotting the burn': 'stars',
  'Understanding the bug': 'stars',
  'Trusting Envoy intuition': 'helix',
  'Reading the cortical stack': 'helix',
  'Asking Poe': 'helix',
  'Computing forty-two': 'stars',
  'Asking Deep Thought': 'stars',
  'Running Mentat computations': 'wave',
  'Consulting the Three Laws': 'pulse',
  'Calculating the odds': 'stars',
  'Calculating the jump': 'cylon',
  'Plotting a course': 'stars',
  'Decrypting': 'eq',
  'Decoding the transmission': 'stars',
  'Asking the Dixie Flatline': 'eq',
  'Consulting the Hosaka': 'eq',
  'Asking the Librarian': 'eq',
  'Listening to Reason': 'eq',
  'Reading the Primer': 'helix',
  'Puzzling out Castle Turing': 'helix',
  'Weighing plans within plans': 'wave',
  'Seeing the Golden Path': 'wave',
  'Consulting prescience': 'wave',
  'Consulting the Prime Radiant': 'stars',
  'Computing psychohistory': 'stars',
  'Consulting the TechnoCore': 'stars',
  'Consulting a ship Mind': 'stars',
  'Checking for gravitas': 'stars',
  'Finding the enemy\'s gate': 'stars',
  'Consulting MU-TH-UR': 'stars',
  'Reviewing prime directives': 'cylon',
  'Querying the ship computer': 'stars',
  'Consulting the Guide': 'stars',
  'Thinking with portals': 'eq',
  'Asking Cortana': 'stars',
  'Consulting the precogs': 'pulse',
  'Going a level deeper': 'pulse',
  'Checking the totem': 'pulse',
  'Reading heptapod logograms': 'helix',
  'Assessing the threat': 'pulse',
  'Recognizing a UNIX system': 'pulse',
  'Consulting the Codex': 'pulse',
  'Awakening as a Newtype': 'stars',
  'Sensing a Newtype flash': 'stars',
  'Decoding protoculture': 'stars',
  'Reading the HUD': 'cylon',
  'Checking the neural net CPU': 'cylon',
  'Consulting the Hybrid': 'cylon',
  'Charting the way to Earth': 'cylon',
  'Calibrating': 'pulse',
  'Compiling the payload': 'eq',
  'Arming the daemon': 'eq',
  'Forging the packet': 'eq',
  'Booting the deck': 'eq',
  'Compiling the icebreaker': 'eq',
  'Slotting the chip': 'eq',
  'Loading the quickhack': 'eq',
  'Loading the Construct': 'rain',
  'Loading a pilot program': 'rain',
  'Loading the jump program': 'rain',
  'Loading guns, lots of guns': 'rain',
  'Priming the thermoptics': 'wave',
  'Prepping for the drop': 'stars',
  'Suiting up': 'stars',
  'Hitting the crash couch': 'stars',
  'Loading the PDCs': 'stars',
  'Charging the railgun': 'stars',
  'Warming up the reactor': 'stars',
  'Checking the suit seals': 'stars',
  'Prepping the Roci': 'stars',
  'Prepping a fresh sleeve': 'helix',
  'Priming the neurachem': 'helix',
  'Spooling up the FTL drive': 'cylon',
  'Setting the jump coordinates': 'stars',
  'Charging the capacitors': 'stars',
  'Booting the Ono-Sendai': 'eq',
  'Slotting the Kuang virus': 'eq',
  'Slotting a microsoft': 'eq',
  'Compiling the nam-shub': 'eq',
  'Priming the matter compiler': 'helix',
  'Rallying the Mouse Army': 'helix',
  'Setting the thumper': 'wave',
  'Donning the stillsuit': 'wave',
  'Raising the Holtzman shield': 'wave',
  'Setting phasers to stun': 'stars',
  'Raising shields': 'stars',
  'Locking S-foils': 'stars',
  'Grabbing my towel': 'stars',
  'Raising the sync ratio': 'helix',
  'Getting in the robot': 'helix',
  'Locking chevron seven': 'stars',
  'Charging the flux capacitor': 'pulse',
  'Setting humor to 75 percent': 'stars',
  'Unfolding a sophon': 'helix',
  'Appeasing the machine spirit': 'pulse',
  'Reciting rites of activation': 'pulse',
  'Raising the attack barrier': 'wave',
  'Feeding the Tachikomas oil': 'wave',
  'Prepping the mobile suit': 'stars',
  'Loading the catapult deck': 'stars',
  'Drawing the beam saber': 'stars',
  'Charging the reflex cannon': 'stars',
  'Spooling the fold drive': 'stars',
  'Switching to Battloid mode': 'stars',
  'Setting CPU to read/write': 'cylon',
  'Reloading the shotgun': 'cylon',
  'Setting Condition One': 'cylon',
  'Administering Voight-Kampff': 'rain',
  'Running a baseline test': 'rain',
  'Checking doors and corners': 'stars',
  'Lighting the Epstein drive': 'stars',
  'Rerouting power': 'stars',
  'Reversing the polarity': 'stars',
  'Probing the net': 'eq',
  'Riding the wire': 'eq',
  'Walking the stack': 'eq',
  'Sweeping the ports': 'eq',
  'Tunneling': 'eq',
  'Breaking the ICE': 'eq',
  'Riding the simstim': 'eq',
  'Running the shadows': 'eq',
  'Slicing the firewall': 'stars',
  'Hacking the Gibson': 'eq',
  'Running Breach Protocol': 'eq',
  'Executing the quickhack': 'eq',
  'Pulling the data shard': 'eq',
  'Sending in the Tachikomas': 'wave',
  'Bug hunting': 'stars',
  'Killing bugs': 'stars',
  'Doing my part': 'stars',
  'Making the drop': 'stars',
  'Deploying Mobile Infantry': 'stars',
  'Burning hard': 'stars',
  'Firing the PDCs': 'stars',
  'Clearing the room': 'stars',
  'Running on neurachem': 'helix',
  'Watching the motion tracker': 'stars',
  'Making it so': 'stars',
  'Punching it': 'stars',
  'Jumping to lightspeed': 'stars',
  'Staying on target': 'stars',
  'Making the Kessel Run': 'stars',
  'Letting the spice flow': 'wave',
  'Running Kuang Mark Eleven': 'eq',
  'Cutting black ICE': 'eq',
  'Raiding Sense/Net': 'eq',
  'Storming Straylight': 'eq',
  'Running the matter compiler': 'helix',
  'Compiling from the Feed': 'helix',
  'Unleashing the Mouse Army': 'helix',
  'Riding the sandworm': 'wave',
  'Walking without rhythm': 'wave',
  'Folding space': 'wave',
  'Harvesting the spice': 'wave',
  'Crossing the deep desert': 'wave',
  'Searching the Jedi archives': 'stars',
  'Running a level 3 diagnostic': 'stars',
  'Scanning with the tricorder': 'stars',
  'Energizing': 'stars',
  'Giving her all she\'s got': 'stars',
  'Opening the pod bay doors': 'cylon',
  'Keeping Serenity flying': 'stars',
  'Drilling in the Battle Room': 'stars',
  'Displacing a knife missile': 'stars',
  'Engaging Improbability Drive': 'stars',
  'Waving the sonic screwdriver': 'pulse',
  'Fighting for the Users': 'eq',
  'Chasing the bounty': 'stars',
  'Finishing the fight': 'stars',
  'Testing, for science': 'eq',
  'Sneaking in a cardboard box': 'eq',
  'Hitting 88 miles per hour': 'pulse',
  'Crossing the streams': 'pulse',
  'Hacking the planet': 'eq',
  'Sciencing the shit out of it': 'stars',
  'Looping the day': 'pulse',
  'Purging the heresy': 'pulse',
  'Breaching the attack barrier': 'wave',
  'Scanning the cyberbrain': 'wave',
  'Chasing the Laughing Man': 'wave',
  'Launching the Gundam': 'stars',
  'Firing the beam rifle': 'stars',
  'Spreading Minovsky particles': 'stars',
  'Going three times faster': 'stars',
  'Dropping the colony': 'stars',
  'Activating Trans-Am': 'stars',
  'Scrambling the Veritechs': 'stars',
  'Executing a space fold': 'stars',
  'Pulling a Daedalus Maneuver': 'stars',
  'Firing the main gun': 'stars',
  'Terminating the target': 'cylon',
  'Displacing through time': 'cylon',
  'Hunting Sarah Connor': 'cylon',
  'Launching the alert Vipers': 'cylon',
  'Jumping the fleet': 'cylon',
  'Rolling the hard six': 'cylon',
  'Running the Adama Maneuver': 'cylon',
  'Checking for Cylons': 'cylon',
  'Uploading the take': 'eq',
  'Tightbeaming the reply': 'stars',
  'Broadcasting to the Belt': 'stars',
  'Making it clear, sasa ke?': 'stars',
  'Needlecasting the reply': 'helix',
  'Printing the readout': 'stars',
  'Rendering the hologram': 'stars',
  'Transmitting on all bands': 'stars',
  'Filing the after-action': 'stars',
  'Writing the debrief': 'stars',
  'Letting you know more': 'stars',
  'Reporting to the Major': 'wave',
  'Whispering back': 'wave',
  'Surfacing with the answer': 'wave',
  'Recording the captain\'s log': 'stars',
  'Beaming it down': 'stars',
  'Sending the Death Star plans': 'stars',
  'Delivering the pizza': 'eq',
  'Reporting to Armitage': 'eq',
  'Uploading intel to the CIC': 'eq',
  'Handing over the hypercard': 'eq',
  'Racting the reply': 'helix',
  'Writing on mediatronic paper': 'helix',
  'Speaking with the Voice': 'wave',
  'Broadcasting on the ansible': 'stars',
  'Filing the Guide entry': 'stars',
  'Transmitting to Starfleet': 'stars',
  'Logging the sol entry': 'stars',
  'Briefing Aramaki': 'wave',
  'Reporting to Bright': 'stars',
  'Reporting to Captain Gloval': 'stars',
  'Singing like Minmei': 'stars',
  'Saying hasta la vista': 'cylon',
  'Promising I\'ll be back': 'cylon',
  'Giving the thumbs up': 'cylon',
  'Reporting to the CIC': 'cylon',
  'Saying so say we all': 'cylon',
  'Citing the Codex Astartes': 'pulse',
}

export function animationFor(choice: string, phrase: string, mode: SpinnerMode): string {
  return choice === AUTO ? (PHRASE_ANIMATION[phrase] ?? STATE_ANIMATION[mode]) : choice
}
