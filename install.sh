#!/usr/bin/env bash
# Points Claude Code at this folder so it loads sbs-deck in every session.
# With --theme, also installs and selects a color theme.
#
#   ./install.sh                     load the mod
#   ./install.sh --theme             load the mod and switch to the SecureBine theme
#   ./install.sh --theme securebine  the same
#   ./install.sh --theme nightcity   load the mod and switch to the Night City theme
#
# Safe to run again: it changes nothing that is already in place.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
config_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$config_dir/settings.json"
theme=""

while (($# > 0)); do
  case "$1" in
    --theme)
      theme=securebine
      if (($# > 1)) && [[ $2 != -* ]]; then
        case "$2" in
          securebine | nightcity) theme="$2" ;;
          *)
            echo "Unknown theme: $2" >&2
            exit 1
            ;;
        esac
        shift
      fi
      ;;
    -h | --help)
      sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if ! command -v jq >/dev/null 2>&1; then
  echo "install.sh needs jq. Install it and run this again." >&2
  exit 1
fi

mkdir -p "$config_dir"
[[ -f $settings ]] || echo '{}' >"$settings"
cp -p "$settings" "$settings.bak.$(date +%s)"

tmp="$(mktemp "$settings.XXXXXX")"
jq --arg dir "$here" '
  .env = (.env // {})
  | (.env.CLAUDE_CODE_PLUGIN_DIRS // "") as $current
  | ($current | split(":") | map(select(length > 0))) as $dirs
  | .env.CLAUDE_CODE_PLUGIN_DIRS =
      (if ($dirs | index($dir)) then $current else ($dirs + [$dir] | join(":")) end)
' "$settings" >"$tmp"
mv "$tmp" "$settings"
echo "Claude Code will load sbs-deck from $here"

if [[ -n $theme ]]; then
  mkdir -p "$config_dir/themes"
  cp "$here/theme/$theme.json" "$config_dir/themes/$theme.json"
  tmp="$(mktemp "$settings.XXXXXX")"
  jq --arg theme "custom:$theme" '.theme = $theme' "$settings" >"$tmp"
  mv "$tmp" "$settings"
  echo "$(jq -r .name "$here/theme/$theme.json") theme installed and selected (switch back any time with /theme)"
fi

echo "Start a new Claude Code session to see it."
