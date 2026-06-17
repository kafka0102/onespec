#!/usr/bin/env bash
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    die "shasum or sha256sum is required"
  fi
}

hash_text() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    die "shasum or sha256sum is required"
  fi
}

json_escape() {
  sed 's/\\/\\\\/g; s/"/\\"/g' <<<"$1"
}

display_path() {
  local file="$1"
  case "$file" in
    */openspec/*)
      printf 'openspec/%s\n' "${file##*/openspec/}"
      ;;
    *)
      printf '%s\n' "$file"
      ;;
  esac
}

valid_change() {
  local change="$1"
  [[ -n "$change" ]] || die "change name is required"
  [[ "$change" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "invalid change name: $change"
  [[ "$change" != *".."* ]] || die "change name must not contain '..'"
}

source_files() {
  for file in "$change_dir/proposal.md" "$change_dir/design.md" "$change_dir/tasks.md"; do
    [ -f "$file" ] && printf '%s\n' "$file"
  done
  if [ -d "$change_dir/specs" ]; then
    find "$change_dir/specs" -path '*/spec.md' -type f | sort
  fi
}

context_hash() {
  source_files | while IFS= read -r file; do
    printf '%s %s\n' "$(hash_file "$file")" "$file"
  done | hash_text
}

summary_text() {
  local files count first
  files="$(source_files)"
  count="$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')"
  first="$(printf '%s\n' "$files" | sed -n '1p')"
  printf '%s handoff from %s file(s); primary artifact: %s' "$purpose" "$count" "$(display_path "$first")"
}

write_excerpt() {
  local file="$1"
  local max_lines=100
  local lines
  lines="$(wc -l < "$file" | tr -d ' ')"
  echo "## $file"
  echo
  echo "- sha256: $(hash_file "$file")"
  echo "- lines: $lines"
  echo
  if [ "$mode" = "full" ] || [ "$lines" -le "$max_lines" ]; then
    echo '```md'
    cat "$file"
    echo '```'
  else
    echo "[TRUNCATED: first ${max_lines} lines only]"
    echo
    echo '```md'
    sed -n "1,${max_lines}p" "$file"
    echo '```'
  fi
  echo
}

change="${1:-}"
purpose="${2:-}"
action="${3:-}"
full_flag="${4:-}"

[ "$action" = "--write" ] || die "usage: onespec-handoff.sh <change> <purpose> --write [--full]"
valid_change "$change"
case "$purpose" in proposal|plan|review|archive) ;; *) die "purpose must be proposal, plan, review, or archive" ;; esac
case "$full_flag" in "" ) mode="compact" ;; "--full" ) mode="full" ;; * ) die "unknown option: $full_flag" ;; esac

change_dir="openspec/changes/$change"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
state="$("${BASH:-bash}" "$script_dir/onespec-state.sh" path "$change")"
[ -f "$state" ] || die "state file not found: $state"
change_dir="$(cd "$(dirname "$state")" && pwd -P)"
state_label="$(display_path "$state")"

if [ "$(source_files | wc -l | tr -d ' ')" -eq 0 ]; then
  die "no OpenSpec artifacts found under $change_dir"
fi

hash="$(context_hash)"
summary="$(summary_text)"

"${BASH:-bash}" "$script_dir/onespec-state.sh" set "$change" handoff_context "$state_label"
"${BASH:-bash}" "$script_dir/onespec-state.sh" set "$change" handoff_purpose "$purpose"
"${BASH:-bash}" "$script_dir/onespec-state.sh" set "$change" handoff_summary "$summary"
"${BASH:-bash}" "$script_dir/onespec-state.sh" set "$change" handoff_hash "$hash"

echo "$state_label"
