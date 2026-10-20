# sbs-deck

SecureBine console styling for Claude Code in the terminal. It is a Claude Code
mod: a small plugin that changes how the session is drawn. It does not change
what Claude does or what Claude reads.

## What it does

| Piece | What you see |
|---|---|
| Prompt box | Each of your messages sits in a gold box labelled `OPERATOR // UPLINK: <the email of the Claude account signed in now>`, with a shield icon |
| Queued messages | A message you type while Claude is still working sits in a slate-blue box labelled `OPERATOR // QUEUED:`. It turns gold when Claude has been handed it |
| Reply header | The first block of each reply is headed `CLAUDE // DOWNLINK`, with a robot icon. The name can be the agent's own: see `/sbs name` |
| Quiet tool rows | Each tool call is one line saying what it is for: `▸` running, `✓` finished, `✗` failed. Output is hidden unless the call failed |
| Colored output | With quiet rows off, shell and MCP output is colored by pattern: up/down states, IP and MAC addresses, interface names, numbers with units, paths, JSON |
| Working line | While Claude works, the mod draws a two-row line: a 32 by 2 cell full-color animation (a reel) beside a science-fiction phrase for what it is doing and a readout. A new phrase each time the state changes. In a narrow or short terminal it is one row: the phrase and the readout |
| Readout | What Claude is doing, then time, tokens and effort for the turn: `THINK · 12s · ~4.2k tokens · effort high`. The tag is `THINK`, `PREP` (writing a tool call), `REPLY`, `SEND` (waiting on the API), or the running tool's name (`BASH`, `READ`, `MCP` for an MCP tool, `TOOL` when none is known), so a phrase change has a visible reason. The `~` shows while a step is still streaming and the count is an estimate |
| Reels | Twelve reels, each its own scene, picked by what Claude is doing (shell, editing, web, subagents and so on) and shuffled per context, so none repeats until that context's pool has played. About 1 turn in 50 plays a rare one. [`docs/reels.md`](docs/reels.md) lists how they are picked and how to add your own |
| Themes | SecureBine gold is the default. `/sbs theme nightcity` switches to the Night City palette, and adds its own phrases while Breach Protocol or Sandevistan plays |

The working line has 295 phrases across five states (connecting, thinking, setting up
a tool call, running it, answering). Each is filed under the state its plain
meaning suggests, so you can tell at a glance what Claude is doing.
Night City adds 28 of its own. [`docs/phrases.md`](docs/phrases.md) lists every
phrase and the work it is from.

## Requirements

- Claude Code 2.1.287 or later. Mods are an early-access feature and may change
  between releases.
- A terminal font with Nerd Font icons (Nerd Fonts 3.0 or later, where the
  robot icon lives), for the shield and robot. Without one they show as empty
  boxes; everything else works.
- `jq`, for the install script.

## Install

```bash
git clone git@github.com:scottcrosby-securebine/sbs-deck.git ~/.claude/mods/sbs-deck
~/.claude/mods/sbs-deck/install.sh --theme
```

For the Night City theme instead, run `install.sh --theme nightcity`.

Then start a new Claude Code session.

`install.sh` adds this folder to `CLAUDE_CODE_PLUGIN_DIRS` in
`~/.claude/settings.json`, after backing the file up. `--theme` also installs
the SecureBine color theme (prompt border, accents and diff colors) and
selects it, and `--theme nightcity` does the same with the Night City theme;
leave the flag off to keep your current theme.

To update a machine: `git pull` in the folder. Claude Code watches it, so a
running session picks the change up.

The repo is also a plugin marketplace, if you prefer that route:

```bash
claude plugin marketplace add scottcrosby-securebine/sbs-deck
claude plugin install sbs-deck@sbs-deck
```

## Commands

| Command | Effect |
|---|---|
| `/sbs` or `/sbs status` | Show what is on now, and this list. Changes nothing |
| `/sbs on`, `/sbs off` | All the styling on or off |
| `/sbs normal` | Stock Claude Code. The same as `/sbs off` |
| `/sbs reset` | Styling on with its defaults: quiet on, color on |
| `/sbs quiet on`, `/sbs quiet off` | One-line tool rows with output hidden, or full commands and their output |
| `/sbs color on`, `/sbs color off` | Pattern coloring of output. Only seen with quiet off |
| `/sbs theme [securebine\|nightcity]` | The colors the mod draws in. With no name, shows the current theme and the choices. The choice is saved and kept by `/sbs reset`. It also recolors a reel that is already playing. It cannot change Claude Code's own theme: `/sbs theme nightcity` replies with the `install.sh --theme nightcity` command to run, or you can pick it with `/theme` once installed |
| `/sbs anim [name]` | The reel on the working line. In `auto` (the default) the reel follows what Claude is doing. `/sbs anim <name>` pins one reel, `/sbs anim auto` goes back, `/sbs anim off` stops all motion and draws the one-row line, and `/sbs anim list` prints every name. With no name, or `next`, it steps to the next new reel and skips the rare one. The 22 older animations, `bar`, `wave`, `cylon`, `rain`, `pulse`, `helix`, `load`, `stars`, `sonar`, `fire`, `comet`, `pong`, `invader`, `life`, `warp`, `orbit`, `morse`, `shield`, `binary`, `glitch`, `dial` and `eq`, are still there by name only |
| `/config`, search `Reel` | One switch per new reel, `Reel: <title> · sbs-deck`, on by default. Enter or Space flips it, or type `/config sbs-deck.reelHokuto=false`. The field is `reel` plus the reel's name with its first letter capitalized. A reel switched off is never picked in `auto`, and `/sbs anim` and `next` step past it. `/sbs anim <name>` still pins it. A context whose reels are all off picks from the rest of the `other` pool, and with every new reel off `auto` plays `bar`. `/sbs anim list` marks off reels `(off)` and `/sbs status` names them. A change reloads the mod at once and starts the shuffle afresh |
| `/sbs name <name>` | What the reply header calls the assistant, in place of `CLAUDE`. `/sbs name clear` undoes it. Without it, the name comes from the first of: `SBS_AGENT_NAME` in the environment; on the SBSForge platform, the agent's `display_name` in `~/.sbsforge/config/agent.yaml`; the platform's `SBSFORGE_AGENT_NAME`; and otherwise `CLAUDE` |

`/sbs quiet` and `/sbs color` with no second word flip that switch. The
settings are remembered per machine. Claude Code's own color theme is separate:
change it with `/theme`.

## Changing it

- **Colors**: the role tables in `hooks/theme.ts`. It is the only place a hex
  value may appear.
- **Labels**: the constants at the top of `hooks/register.tsx`.
- **Reels**: one file each in `hooks/reels/`, with a line in `hooks/reels/index.ts`
  and a `/config` switch in `.claude-plugin/plugin.json`. See [`docs/reels.md`](docs/reels.md).
- **Icons**: `OPERATOR_ICON` and `ASSISTANT_ICON` in the same file.
- **Spinner phrases**: the pools in `hooks/spinner.ts`. A test rejects any
  phrase over 28 characters, any non-ASCII character and any duplicate. Add the
  source to `docs/phrases.md`. The Night City phrases are in `hooks/spinner.ts`
  too (`NIGHT_CITY_PHRASES`). A reel's catchphrases are in its own file.
- **Output coloring rules**: `hooks/color.ts`.

Check a change with:

```bash
claude plugin validate .
claude plugin test .
tsc --project tsconfig.json --noEmit --pretty false
grep -snE "#[0-9A-Fa-f]{6}\b" hooks/*.ts hooks/*.tsx hooks/reels/*.ts | grep -vE "^hooks/theme\.ts:|\.test\.tsx?:"
```

The last command must print nothing: no color value is written outside
`hooks/theme.ts` and the tests.

## Known limits

- Night City is a dark-terminal theme. On a light terminal, only the text on a
  plate (the labels, the header and the working line) is guaranteed to read.
- The token count is this agent's output tokens, not the whole session's. It
  shows `~` while a step is still streaming, and jumps to the real figure when
  the step ends.
- The working line draws one row, with no reel, under 60 columns, under 12
  rows, in the desktop app and in VS Code. Between 60 and 79 columns the reel
  is 16 cells.
- Red and dark red nearly merge when a terminal rounds to 256 colors.
- A reel file dropped into `hooks/reels/` also needs its line in
  `hooks/reels/index.ts` and its `userConfig` field in
  `.claude-plugin/plugin.json`. The mod toasts either line at session start if
  it is missing, and `/sbs anim list` prints it. A reel with no field plays as
  if switched on.

- The label shows the email of the account signed in to Claude Code, read
  from `.claude.json` (the record the status line uses) each time you send a
  prompt, so a new sign-in shows on your next message, and on the earlier
  messages too. Where that record cannot be read, the machine login name is
  shown.
- Quiet rows cannot be expanded with ctrl+o. Use `/sbs quiet` to see the detail.
- With quiet rows off and coloring on, a long shell result shows its first 20
  lines and a count of the rest.
- A queued message is recognised by its text. Send the same text twice, once
  queued and once not, and both show as queued until one is read. A queued
  message you take back out of the queue leaves any row with the same text
  slate-blue until that text is sent again. If another plugin drops or
  rewrites a message you queue, rows with the text you typed can stay
  slate-blue, and a rewritten message shows gold while it waits.
- What the mod remembers about queued messages and spinner position is
  forgotten if the mod reloads mid-session.
- Recognising a delivered message relies on the wording Claude Code wraps
  around it, checked against 2.1.302. If a later release changes that
  wording, a message read mid-turn can stay slate-blue for the rest of the
  session.
- The pattern coloring is plain text matching, so words such as `up` or
  `active` inside ordinary sentences in command output are colored too.

## Review status

The phrase list was reviewed over eight rounds by two independent reviewers,
one of them a different model family, on four tests: readable at a glance,
accurate to its source, no suggestion that Claude has failed, and short enough
for the line. The last five passes over the list found nothing to stop it.

The code was reviewed in the same rounds. Every finding raised was fixed and
given a test. The changes made after those rounds (delivered-message
matching, mixed MCP results, the slate-blue queue color, the icons, the rename
to `sbs-deck`, the 1.0.1 spinner fix, the account name in the label, the
thirteen added animations and the agent name in the reply header) were audited
in October 2026 by independent reviewers, one of them a different model
family. Every blocking finding was fixed, each code fix with a test that
fails without it, or, by the owner's ruling, is listed under Known limits.
The Night City theme, the two-row working line with its readout and the
twelve reels are not yet reviewed. The test suite passes, 255 tests, on Claude
Code 2.1.302.
The live checks this host can run passed in tmux in October 2026: both themes at
80, 60 and 40 columns, 256 colors, a subagent turn and a reload, `/sbs anim off`,
`/clear`, the missing-index toast and `auto` in use. Over a herdr remote link
the new line costs no more than the old one: the ssh send rate stayed within
its own background swing (29 to 70 KB/s for both), and typing felt the same.
The owner's checks still pending: the desktop app, a light terminal and the
twelve-reel review.
