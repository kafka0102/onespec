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

write_markdown() {
  {
    echo "# OneSpec 交接包"
    echo
    echo "- change: $change"
    echo "- purpose: $purpose"
    echo "- mode: $mode"
    echo "- hash: $hash"
    echo
    echo "Generated-by: onespec-handoff.sh"
    echo
    echo "这是脚本生成的确定性交接上下文。OpenSpec 产物仍是事实来源。"
    echo
    source_files | while IFS= read -r file; do
      write_excerpt "$file"
    done
  } > "$context_md"
}

write_json() {
  {
    echo "{"
    echo "  \"change\": \"$(json_escape "$change")\","
    echo "  \"purpose\": \"$(json_escape "$purpose")\","
    echo "  \"mode\": \"$(json_escape "$mode")\","
    echo "  \"hash\": \"$hash\","
    echo "  \"files\": ["
    local first=1
    while IFS= read -r file; do
      if [ "$first" -eq 0 ]; then
        echo ","
      fi
      first=0
      printf '    { "path": "%s", "sha256": "%s" }' "$(json_escape "$file")" "$(hash_file "$file")"
    done < <(source_files)
    echo
    echo "  ]"
    echo "}"
  } > "$context_json"
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
state="$change_dir/.onespec.yaml"
[ -d "$change_dir" ] || die "change directory not found: $change_dir"
[ -f "$state" ] || die "state file not found: $state"

if [ "$(source_files | wc -l | tr -d ' ')" -eq 0 ]; then
  die "no OpenSpec artifacts found under $change_dir"
fi

handoff_dir="$change_dir/.onespec/handoff"
mkdir -p "$handoff_dir"
context_md="$handoff_dir/${purpose}-context.md"
context_json="$handoff_dir/${purpose}-context.json"
hash="$(context_hash)"

write_markdown
write_json

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
"${BASH:-bash}" "$script_dir/onespec-state.sh" set "$change" handoff_context "$context_json"
"${BASH:-bash}" "$script_dir/onespec-state.sh" set "$change" handoff_hash "$hash"

echo "$context_md"
