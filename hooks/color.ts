// Colors plain command and device output by pattern: it splits each line
// into segments, the matched ones carrying a style, for a hook to draw as Text.

import { ROLES } from './theme'
import type { Paint, Role, ThemeName } from './theme'

export type Segment = { text: string; style?: Paint }

// Tried in this order at each position, so the earlier rule wins a tie: a MAC
// before a clock time, "administratively down" before "down".
const RULES: readonly (readonly [string, Role])[] = [
  ['https?://[^\\s"\'<>)\\]]+', 'url'],
  ['\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b|\\b[0-9A-Fa-f]{4}\\.[0-9A-Fa-f]{4}\\.[0-9A-Fa-f]{4}\\b', 'mac'],
  ['\\b\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?Z?)?\\b|\\b\\d{2}:\\d{2}:\\d{2}\\b', 'time'],
  ['\\b(?:\\d{1,3}\\.){3}\\d{1,3}(?:/\\d{1,2})?(?::\\d{1,5})?\\b', 'address'],
  ['\\b(?:[0-9A-Fa-f]{1,4}:){2,7}(?::?[0-9A-Fa-f]{1,4}){1,6}(?:/\\d{1,3})?\\b', 'address'],
  // A quote right after a backslash never opens a string, so an escaped quote
  // never starts a scan to the end of the line.
  ['(?<!\\\\)"[^"\\\\]*(?:\\\\.[^"\\\\]*)*"(?=\\s*:)', 'key'],
  ['(?<!\\\\)"[^"\\\\]*(?:\\\\.[^"\\\\]*)*"', 'string'],
  [
    '\\b(?:GigabitEthernet|TenGigabitEthernet|FortyGigabitEthernet|HundredGigE|FastEthernet|Ethernet|Port-channel|Loopback|Tunnel|Vlan|Gi|Te|Fo|Hu|Fa|Eth|Po|Lo|Tu|Vl)\\d+(?:/\\d+)*(?:\\.\\d+)?\\b|\\b(?:ge|xe|et|ae|irb|lo|em|fxp|vme|st)-?\\d+(?:/\\d+)*(?:\\.\\d+)?\\b|\\bethernet\\d+/\\d+(?:\\.\\d+)?\\b',
    'interface',
  ],
  ['(?<![\\w.])~?(?:\\.{1,2})?/[\\w.@+-]+(?:/[\\w.@+-]+)+/?', 'path'],
  [
    '\\b(?:administratively down|admin down|err-disabled|notconnect|not connected|warning|warn|deprecated|degraded|pending|skipped|suspended|stale)\\b',
    'warn',
  ],
  [
    '\\b(?:down|failed|failure|fail|errors?|fatal|critical|panic|denied|refused|rejected|unreachable|timed out|timeout|disabled|offline|inactive|idle|missing|not found|false)\\b',
    'bad',
  ],
  [
    '\\b(?:up|established|active|connected|ok|pass|passed|success|successful|succeeded|enabled|running|online|ready|complete|completed|done|true)\\b',
    'good',
  ],
  ['\\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\\d)(?:[0-9a-f]{7,12}|[0-9a-f]{40})\\b', 'hash'],
  ['\\b\\d+(?:\\.\\d+)?(?:%|ms|[KMGT]i?B|[kKMG]?bps|pps|[KMG]?Hz)(?![\\w])', 'number'],
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

export function colorLine(line: string, theme: ThemeName = 'securebine'): Segment[] {
  const roles = ROLES[theme]

  if (line.length === 0) {
    return [{ text: ' ' }]
  }

  if (RULE_LINE.test(line)) {
    return [{ text: line, style: roles.rule }]
  }

  if (COMMENT_LINE.test(line)) {
    return [{ text: line, style: roles.comment }]
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

    segments.push({ text: match[0], style: roles[rule[1]] })
    cursor = match.index + match[0].length
  }

  if (cursor < line.length) {
    segments.push({ text: line.slice(cursor) })
  }

  return segments
}
