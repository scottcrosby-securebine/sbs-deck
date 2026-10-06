# sbs-deck

SecureBine console styling for Claude Code in the terminal. It is a Claude Code
mod: a small plugin that changes how the session is drawn. It does not change
what Claude does or what Claude reads.

## What it does

| Piece | What you see |
|---|---|
| Prompt box | Each of your messages sits in a gold box labelled `OPERATOR // UPLINK: <your Claude account email>`, with a shield icon |
| Queued messages | A message you type while Claude is still working sits in a slate-blue box labelled `OPERATOR // QUEUED:`. It turns gold when Claude has been handed it |
| Reply header | The first block of each reply is headed `CLAUDE // DOWNLINK`, with a robot icon |
| Quiet tool rows | Each tool call is one line saying what it is for: `▸` running, `✓` finished, `✗` failed. Output is hidden unless the call failed |
| Colored output | With quiet rows off, shell and MCP output is colored by pattern: up/down states, IP and MAC addresses, interface names, numbers with units, paths, JSON |
| Spinner | While Claude works, a science-fiction phrase for what it is doing decrypts out of noise, with a scanning bar. A new phrase each time the state changes |

The spinner has 295 phrases across five states (connecting, thinking, setting up
a tool call, running it, answering). Each is filed under the state its plain
meaning suggests, so you can tell at a glance what Claude is doing.
[`docs/phrases.md`](docs/phrases.md) lists every phrase and the work it is from.

## Requirements

- Claude Code 2.1.287 or later. Mods are an early-access feature and may change
  between releases.
- A terminal font with Nerd Font icons, for the shield and robot. Without one
  they show as empty boxes; everything else works.
- `jq`, for the install script.

## Install

```bash
git clone git@github.com:scottcrosby-securebine/sbs-deck.git ~/.claude/mods/sbs-deck
~/.claude/mods/sbs-deck/install.sh --theme
```

Then start a new Claude Code session.

`install.sh` adds this folder to `CLAUDE_CODE_PLUGIN_DIRS` in
`~/.claude/settings.json`, after backing the file up. `--theme` also installs
the SecureBine color theme (prompt border, accents and diff colors) and
selects it; leave the flag off to keep your current theme.

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
| `/sbs anim [name]` | The animation after the spinner phrase. In `auto` (the default) a phrase gets a themed animation only where its own words call for one: rain for the digital rain, a scanning eye for a scan, stars for a jump, a filling bar for loading. Every other phrase keeps the plain `bar`. Or fix one: `bar`, `wave`, `cylon`, `rain`, `pulse`, `helix`, `load`, `stars`, `sonar`, `fire`, `comet`, `pong`, `invader`, `life`, `warp`, `orbit`, `morse`, `shield`, `binary`, `glitch`, `dial`, `eq`. With no name it steps to the next |

`/sbs quiet` and `/sbs color` with no second word flip that switch. The
settings are remembered per machine. The color theme is separate: change it
with `/theme`.

## Changing it

- **Colors and labels**: the constants at the top of `hooks/register.tsx`.
- **Icons**: `OPERATOR_ICON` and `ASSISTANT_ICON` in the same file.
- **Spinner phrases**: the pools in `hooks/spinner.ts`. A test rejects any
  phrase over 28 characters, any non-ASCII character and any duplicate. Add the
  source to `docs/phrases.md`.
- **Output coloring rules**: `hooks/color.ts`.

Check a change with:

```bash
claude plugin validate .
claude plugin test .
```

## Known limits

- The label shows the email of the account signed in to Claude Code, read
  from `.claude.json` (the record the status line uses) each time you send a
  prompt, so a new sign-in shows on your next message. Where that record
  cannot be read, the machine login name is shown.
- Quiet rows cannot be expanded with ctrl+o. Use `/sbs quiet` to see the detail.
- With quiet rows off and coloring on, a long shell result shows its first 20
  lines and a count of the rest.
- A queued message is recognised by its text. Send the same text twice, once
  queued and once not, and both show as queued until one is read.
- What the mod remembers about queued messages and spinner position is
  forgotten if the mod reloads mid-session.
- Recognising a delivered message relies on the wording Claude Code 2.1.289
  wraps around it. If a later release changes that wording, a queued message
  turns gold when the next turn starts instead of the moment it is read.
- The pattern coloring is plain text matching, so words such as `up` or
  `active` inside ordinary sentences in command output are colored too.

## Review status

The phrase list was reviewed over eight rounds by two independent reviewers,
one of them a different model family, on four tests: readable at a glance,
accurate to its source, no suggestion that Claude has failed, and short enough
for the line. The last five passes over the list found nothing to stop it.

The code was reviewed in the same rounds. Every finding raised was fixed and
given a test. Changes made after the last review pass have not been seen by a
reviewer: the final two fixes (delivered-message matching and mixed MCP
results), the slate-blue queue color, the icons, the rename to `sbs-deck`, and
the 1.0.1 spinner fix (a phrase could stay scrambled for the rest of a turn
after the spinner had been off screen) and the account name in the label. The
test suite passes, 25 tests, on
Claude Code 2.1.289.
