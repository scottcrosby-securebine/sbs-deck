// Colors plain command and device output by pattern: it splits each line
// into segments, the matched ones carrying a style, for a hook to draw as Text.

export type Style = { color: string; bold?: boolean; underline?: boolean }
export type Segment = { text: string; style?: Style }

const GOOD: Style = { color: '#3EE08A', bold: true }
const BAD: Style = { color: '#FF5555', bold: true }
const WARN: Style = { color: '#FFC23D', bold: true }
const ADDRESS: Style = { color: '#00E5FF', bold: true }
const MAC: Style = { color: '#B26BFF' }
const INTERFACE: Style = { color: '#F5A701' }
const NUMBER: Style = { color: '#FFC23D' }
const TIME: Style = { color: '#6FA8DC' }
const PATH: Style = { color: '#7FC8D8' }
const URL_LINK: Style = { color: '#00E5FF', underline: true }
const KEY: Style = { color: '#FF2E97' }
const STRING: Style = { color: '#9FD6A8' }
const HASH: Style = { color: '#B26BFF' }
const COMMENT: Style = { color: '#5E7583' }
const RULE: Style = { color: '#FF2E97', bold: true }

// Tried in this order at each position, so the earlier rule wins a tie: a MAC
// before a clock time, "administratively down" before "down".
const RULES: readonly (readonly [string, Style])[] = [
  ['https?://[^\\s"\'<>)\\]]+', URL_LINK],
  ['\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b|\\b[0-9A-Fa-f]{4}\\.[0-9A-Fa-f]{4}\\.[0-9A-Fa-f]{4}\\b', MAC],
  ['\\b\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?Z?)?\\b|\\b\\d{2}:\\d{2}:\\d{2}\\b', TIME],
  ['\\b(?:\\d{1,3}\\.){3}\\d{1,3}(?:/\\d{1,2})?(?::\\d{1,5})?\\b', ADDRESS],
  ['\\b(?:[0-9A-Fa-f]{1,4}:){2,7}(?::?[0-9A-Fa-f]{1,4}){1,6}(?:/\\d{1,3})?\\b', ADDRESS],
  ['"(?:[^"\\\\]|\\\\.)*"(?=\\s*:)', KEY],
  ['"(?:[^"\\\\]|\\\\.)*"', STRING],
  [
    '\\b(?:GigabitEthernet|TenGigabitEthernet|FortyGigabitEthernet|HundredGigE|FastEthernet|Ethernet|Port-channel|Loopback|Tunnel|Vlan|Gi|Te|Fo|Hu|Fa|Eth|Po|Lo|Tu|Vl)\\d+(?:/\\d+)*(?:\\.\\d+)?\\b|\\b(?:ge|xe|et|ae|irb|lo|em|fxp|vme|st)-?\\d+(?:/\\d+)*(?:\\.\\d+)?\\b|\\bethernet\\d+/\\d+(?:\\.\\d+)?\\b',
    INTERFACE,
  ],
  ['(?<![\\w.])~?(?:\\.{1,2})?/[\\w.@+-]+(?:/[\\w.@+-]+)+/?', PATH],
  [
    '\\b(?:administratively down|admin down|err-disabled|notconnect|not connected|warning|warn|deprecated|degraded|pending|skipped|suspended|stale)\\b',
    WARN,
  ],
  [
    '\\b(?:down|failed|failure|fail|errors?|fatal|critical|panic|denied|refused|rejected|unreachable|timed out|timeout|disabled|offline|inactive|idle|missing|not found|false)\\b',
    BAD,
  ],
  [
    '\\b(?:up|established|active|connected|ok|pass|passed|success|successful|succeeded|enabled|running|online|ready|complete|completed|done|true)\\b',
    GOOD,
  ],
  ['\\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\\d)(?:[0-9a-f]{7,12}|[0-9a-f]{40})\\b', HASH],
  ['\\b\\d+(?:\\.\\d+)?(?:%|ms|[KMGT]i?B|[kKMG]?bps|pps|[KMG]?Hz)(?![\\w])', NUMBER],
]

const PATTERN = new RegExp(RULES.map(([source]) => `(${source})`).join('|'), 'gi')
const COMMENT_LINE = /^\s*(?:#|\/\/|!)(?:\s|$)/
const RULE_LINE = /^\s*(?:[=\-*_~]{4,}|={2,}\s.*\s={2,})\s*$/
// The words that mean something else in lower case inside ordinary prose are
// still colored: a false positive costs a color, never a character.

// Escape sequences a command printed are dropped, a tab becomes spaces and any
// other control character goes: a drawn Text may hold none.
const ESCAPE_SEQUENCE = /\u001b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
const MAX_LINE = 2000

export function cleanLine(line: string): string {
  return line.replace(ESCAPE_SEQUENCE, '').replaceAll('\t', '    ').replace(CONTROL, '').slice(0, MAX_LINE)
}

export function colorLine(line: string): Segment[] {
  if (line.length === 0) {
    return [{ text: ' ' }]
  }

  if (RULE_LINE.test(line)) {
    return [{ text: line, style: RULE }]
  }

  if (COMMENT_LINE.test(line)) {
    return [{ text: line, style: COMMENT }]
  }

  const segments: Segment[] = []
  let cursor = 0

  for (const match of line.matchAll(PATTERN)) {
    const rule = RULES[match.slice(1).findIndex(group => group !== undefined)]

    if (!rule || match[0].length === 0) {
      continue
    }

    if (match.index > cursor) {
      segments.push({ text: line.slice(cursor, match.index) })
    }

    segments.push({ text: match[0], style: rule[1] })
    cursor = match.index + match[0].length
  }

  if (cursor < line.length) {
    segments.push({ text: line.slice(cursor) })
  }

  return segments
}
