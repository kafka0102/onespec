#!/usr/bin/env bash
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

valid_change() {
  local change="$1"
  [[ -n "$change" ]] || die "change name is required"
  [[ "$change" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "invalid change name: $change"
  [[ "$change" != *".."* ]] || die "change name must not contain '..'"
}

change_dir() {
  local change="$1"
  if [ -d "openspec/changes/$change" ]; then
    printf 'openspec/changes/%s\n' "$change"
  elif [ -d "openspec/changes/archive/$change" ]; then
    printf 'openspec/changes/archive/%s\n' "$change"
  else
    printf 'openspec/changes/%s\n' "$change"
  fi
}

state_file() {
  local change="$1"
  local script_root
  script_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
  "${BASH:-bash}" "$script_root/onespec-state.sh" path "$change"
}

normalize_path() {
  local input="$1"
  local normalized="${input#./}"
  [[ -n "$normalized" ]] || die "path must not be empty"
  [[ "$normalized" != .*"/../"* ]] || die "path must not contain parent traversal: $input"
  [[ "$normalized" != ../* ]] || die "path must not contain parent traversal: $input"
  [[ "$normalized" != *"/.." ]] || die "path must not contain parent traversal: $input"
  printf '%s\n' "$normalized"
}

sort_unique_lines() {
  awk 'NF && !seen[$0]++ { print $0 }'
}

field_value() {
  local file="$1"
  local key="$2"
  awk -F ': *' -v key="$key" '$1 == key { sub(/^[^:]+: */, ""); print; found=1; exit } END { if (!found) exit 0 }' "$file" 2>/dev/null
}

set_field() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  if grep -q "^${key}:" "$file"; then
    awk -v key="$key" -v value="$value" '
      $0 ~ "^" key ":" { print key ": " value; next }
      { print }
    ' "$file" > "$tmp"
  else
    cat "$file" > "$tmp"
    printf '%s: %s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$file"
}

encode_base64() {
  base64 | tr -d '\n'
}

decode_base64() {
  if base64 --help >/dev/null 2>&1; then
    base64 --decode 2>/dev/null || base64 -d 2>/dev/null || base64 -D
  else
    base64 -d 2>/dev/null || base64 -D
  fi
}

load_tracked_lines() {
  local change="$1"
  local file encoded
  file="$(state_file "$change")"
  [ -f "$file" ] || return 0
  encoded="$(field_value "$file" touched_files_b64)"
  if [ -z "$encoded" ] || [ "$encoded" = "null" ]; then
    return 0
  fi
  printf '%s' "$encoded" | decode_base64
}

save_tracked_lines() {
  local change="$1"
  local file="$2"
  local state encoded
  state="$(state_file "$change")"
  [ -f "$state" ] || die "state not found: $state"
  if [ ! -s "$file" ]; then
    set_field "$state" touched_files_b64 "null"
    return 0
  fi
  encoded="$(encode_base64 < "$file")"
  set_field "$state" touched_files_b64 "$encoded"
}

ensure_git_repo() {
  git rev-parse --show-toplevel >/dev/null 2>&1 || die "current directory is not inside a git repository"
}

git_dirty_paths() {
  git status --porcelain=v1 --untracked-files=all | awk '
    {
      path = substr($0, 4)
      sub(/^.* -> /, "", path)
      if (length(path) > 0) {
        print path
      }
    }
  '
}

dirty_change_artifact_paths() {
  local change="$1"
  local active_prefix archive_prefix
  active_prefix="openspec/changes/$change/"
  archive_prefix="openspec/changes/archive/$change/"
  git_dirty_paths | awk -v active="$active_prefix" -v archived="$archive_prefix" '
    index($0, active) == 1 || index($0, archived) == 1 { print }
  '
}

repo_layout() {
  if [ -f "pnpm-workspace.yaml" ] || [ -f "nx.json" ] || [ -f "turbo.json" ] || [ -f "lerna.json" ] || [ -f "go.work" ] || [ -f "settings.gradle" ] || [ -f "settings.gradle.kts" ]; then
    echo "multi"
    return 0
  fi
  if [ -f "package.json" ] && grep -Eq '"workspaces"[[:space:]]*:' package.json; then
    echo "multi"
    return 0
  fi
  if [ -f "Cargo.toml" ] && grep -Eq '^\[workspace\]' Cargo.toml; then
    echo "multi"
    return 0
  fi
  if [ -f "pom.xml" ] && grep -Eq '<modules>' pom.xml; then
    echo "multi"
    return 0
  fi
  echo "single"
}

find_policy_doc() {
  local pattern='提交|commit message|commit messages|提交信息|提交规范|提交格式|conventional commit|conventional commits|git workflow|commitlint|commitizen'
  local file

  for file in \
    AGENTS.md \
    agents.md \
    .agents.md \
    CLAUDE.md \
    claude.md \
    .claude.md \
    CONTRIBUTING.md \
    CONTRIBUTING.zh-CN.md \
    README.md \
    README-zh.md \
    README.en.md \
    README.zh-CN.md
  do
    if [ -f "$file" ] && grep -Eiq "$pattern" "$file"; then
      printf '%s\n' "$file"
      return 0
    fi
  done

  if [ -d docs ]; then
    while IFS= read -r file; do
      if grep -Eiq "$pattern" "$file"; then
        printf '%s\n' "$file"
        return 0
      fi
    done < <(find docs -type f \( -name '*.md' -o -name '*.txt' \) | sort)
  fi

  return 1
}

find_commit_config() {
  local file

  for file in \
    commitlint.config.js \
    commitlint.config.cjs \
    commitlint.config.mjs \
    commitlint.config.ts \
    .commitlintrc \
    .commitlintrc.json \
    .commitlintrc.yml \
    .commitlintrc.yaml \
    .commitlintrc.js \
    .commitlintrc.cjs \
    .czrc
  do
    if [ -f "$file" ]; then
      printf '%s\n' "$file"
      return 0
    fi
  done

  if [ -f "package.json" ] && grep -Eiq '"(commitlint|commitizen)"[[:space:]]*:' package.json; then
    echo "package.json"
    return 0
  fi

  return 1
}

detect_language_from_doc() {
  local file="$1"

  if grep -Eiq '简体中文|中文 conventional|中文提交|提交标题.*中文|描述.*中文' "$file"; then
    echo "zh"
    return 0
  fi
  if grep -Eiq 'english|commit message.*english|description.*english' "$file"; then
    echo "en"
    return 0
  fi
  if grep -q '[一-龥]' "$file"; then
    echo "zh"
    return 0
  fi
  echo "unknown"
}

detect_format_from_file() {
  local file="$1"

  if grep -Eiq '<type>\(<scope>\):|type\(scope\)' "$file"; then
    echo "conventional-scope"
    return 0
  fi
  if grep -Eiq '<type>:[[:space:]]*<|^```text$|^```$' "$file" && grep -Eiq '<type>:[[:space:]]*<' "$file"; then
    echo "conventional"
    return 0
  fi
  if grep -Eiq 'conventional commit|conventional commits|commitlint' "$file"; then
    echo "conventional"
    return 0
  fi
  echo "unknown"
}

scope_mode_for_format() {
  case "$1" in
    conventional-scope)
      echo "required"
      ;;
    conventional)
      echo "optional"
      ;;
    *)
      echo "optional"
      ;;
  esac
}

infer_scope() {
  local change="${1:-}"
  local tracked

  if [ -z "$change" ]; then
    echo "repo"
    return 0
  fi

  tracked="$(mktemp)"
  load_tracked_lines "$change" > "$tracked"
  if [ ! -s "$tracked" ]; then
    rm -f "$tracked"
    echo "repo"
    return 0
  fi

  awk -F/ '
    function scope_for(path, first, second) {
      first = $1
      second = $2
      if (first == "packages" || first == "apps" || first == "services" || first == "libs") {
        return second != "" ? second : "repo"
      }
      if (first == "docs" || first == "openspec") {
        return "docs"
      }
      if (second == "") {
        return "repo"
      }
      return first
    }
    {
      candidate = scope_for($0)
      seen[candidate] = 1
    }
    END {
      count = 0
      for (key in seen) {
        choice = key
        count++
      }
      if (count == 1) {
        print choice
      } else {
        print "repo"
      }
    }
  ' "$tracked"
  rm -f "$tracked"
}

valid_commit_context() {
  case "$1" in
    closeout|archive|preserve-state) ;;
    *)
      die "unsupported commit context: $1"
      ;;
  esac
}

policy_value() {
  local policy="$1"
  local key="$2"
  printf '%s\n' "$policy" | awk -F ': ' -v key="$key" '$1 == key { print $2; exit }'
}

default_commit_summary() {
  local change="$1"
  local context="$2"
  local language="$3"

  case "$context" in
    closeout)
      if [ "$language" = "zh" ]; then
        printf '提交 %s 收尾前改动\n' "$change"
      else
        printf 'record %s before closeout\n' "$change"
      fi
      ;;
    archive)
      if [ "$language" = "zh" ]; then
        printf '归档 %s\n' "$change"
      else
        printf 'archive %s\n' "$change"
      fi
      ;;
    preserve-state)
      if [ "$language" = "zh" ]; then
        printf '保存 %s 收尾状态\n' "$change"
      else
        printf 'preserve %s closeout state\n' "$change"
      fi
      ;;
  esac
}

build_commit_message() {
  local change="$1"
  local context="$2"
  local policy language scope summary format scope_mode type

  valid_commit_context "$context"
  policy="$(cmd_detect_policy "$change")"
  language="$(policy_value "$policy" message_language)"
  scope="$(policy_value "$policy" scope_hint)"
  format="$(policy_value "$policy" commit_format)"
  scope_mode="$(policy_value "$policy" scope_mode)"
  [ -n "$language" ] || language="en"
  [ -n "$scope" ] || scope="repo"
  [ -n "$format" ] || format="conventional-scope"
  [ -n "$scope_mode" ] || scope_mode="optional"
  type="chore"
  case "$context" in
    archive|preserve-state)
      scope="docs"
      ;;
  esac
  summary="$(default_commit_summary "$change" "$context" "$language")"

  if [ "$scope_mode" = "required" ]; then
    printf '%s(%s): %s\n' "$type" "$scope" "$summary"
  else
    printf '%s: %s\n' "$type" "$summary"
  fi
}

has_staged_changes() {
  ! git diff --cached --quiet --exit-code
}

cmd_track() {
  local change="$1"
  shift
  valid_change "$change"
  [ "$#" -gt 0 ] || die "track requires at least one path"

  local tracked tmp path
  tracked="$(mktemp)"
  tmp="$(mktemp)"

  load_tracked_lines "$change" > "$tmp"

  for path in "$@"; do
    normalize_path "$path" >> "$tmp"
  done

  sort_unique_lines < "$tmp" > "$tracked"
  save_tracked_lines "$change" "$tracked"
  cat "$tracked"
  rm -f "$tmp" "$tracked"
}

cmd_tracked() {
  local change="$1"
  valid_change "$change"
  load_tracked_lines "$change"
}

cmd_related_dirty() {
  local change="$1"
  valid_change "$change"
  ensure_git_repo

  local tracked state dirty artifacts
  tracked="$(mktemp)"
  dirty="$(mktemp)"
  artifacts="$(mktemp)"
  load_tracked_lines "$change" > "$tracked"
  state="$(state_file "$change")"
  git_dirty_paths | sort_unique_lines > "$dirty"
  dirty_change_artifact_paths "$change" | sort_unique_lines > "$artifacts"

  if grep -Fxq "$state" "$dirty"; then
    printf '%s\n' "$state" >> "$tracked"
  fi

  if [ -s "$artifacts" ]; then
    cat "$artifacts" >> "$tracked"
  fi

  sort_unique_lines < "$tracked" > "${tracked}.sorted"
  mv "${tracked}.sorted" "$tracked"

  if [ ! -s "$tracked" ]; then
    rm -f "$tracked" "$dirty" "$artifacts"
    return 0
  fi

  awk 'NR==FNR { dirty[$0] = 1; next } dirty[$0] { print $0 }' "$dirty" "$tracked" | sort_unique_lines
  rm -f "$tracked" "$dirty" "$artifacts"
}

cmd_stage_related() {
  local change="$1"
  valid_change "$change"
  ensure_git_repo

  local -a files=()
  local file
  while IFS= read -r file; do
    files+=("$file")
  done < <(cmd_related_dirty "$change")
  if [ "${#files[@]}" -eq 0 ]; then
    return 0
  fi

  git add -A -- "${files[@]}"
  printf '%s\n' "${files[@]}"
}

cmd_detect_policy() {
  local change="${1:-}"
  local layout source origin format language confidence scope scope_mode template

  layout="$(repo_layout)"
  scope="$(infer_scope "$change")"
  confidence="default"
  origin="default"
  source="default"
  format="conventional-scope"
  language="en"
  scope_mode="optional"
  template="<type>(<scope>): <summary>"

  if source="$(find_policy_doc)"; then
    origin="project-doc"
    confidence="explicit"
    format="$(detect_format_from_file "$source")"
    language="$(detect_language_from_doc "$source")"
    [ "$format" != "unknown" ] || format="conventional-scope"
    [ "$language" != "unknown" ] || language="en"
  else
    local config_source
    if config_source="$(find_commit_config)"; then
      source="$config_source"
      origin="project-config"
      confidence="partial"
      format="conventional-scope"
      language="en"
    fi
  fi

  scope_mode="$(scope_mode_for_format "$format")"
  case "$format" in
    conventional-scope)
      template="<type>(<scope>): <summary>"
      ;;
    conventional)
      template="<type>: <summary>"
      ;;
  esac

  cat <<EOF
policy_source: $source
policy_origin: $origin
policy_confidence: $confidence
commit_format: $format
scope_mode: $scope_mode
message_language: $language
repo_layout: $layout
scope_hint: $scope
template: $template
EOF
}

cmd_commit_related() {
  local change="$1"
  local context="${2:-closeout}"
  local related message sha

  valid_change "$change"
  valid_commit_context "$context"
  ensure_git_repo

  related="$(cmd_related_dirty "$change")"
  if [ -z "$related" ]; then
    cat <<EOF
commit_created: false
commit_context: $context
commit_sha: none
commit_message: none
EOF
    return 0
  fi

  cmd_stage_related "$change" >/dev/null
  if ! has_staged_changes; then
    cat <<EOF
commit_created: false
commit_context: $context
commit_sha: none
commit_message: none
EOF
    return 0
  fi

  message="$(build_commit_message "$change" "$context")"
  git commit -m "$message" >/dev/null
  sha="$(git rev-parse HEAD)"

  cat <<EOF
commit_created: true
commit_context: $context
commit_sha: $sha
commit_message: $message
EOF
}

usage() {
  cat <<'EOF'
用法:
  onespec-commit.sh track <change> <path>...
  onespec-commit.sh tracked <change>
  onespec-commit.sh related-dirty <change>
  onespec-commit.sh stage-related <change>
  onespec-commit.sh detect-policy [change]
  onespec-commit.sh commit-related <change> [closeout|archive|preserve-state]
EOF
}

cmd="${1:-}"
case "$cmd" in
  track)
    [ "$#" -ge 3 ] || { usage; exit 2; }
    shift
    cmd_track "$@"
    ;;
  tracked)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_tracked "$2"
    ;;
  related-dirty)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_related_dirty "$2"
    ;;
  stage-related)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_stage_related "$2"
    ;;
  detect-policy)
    [ "$#" -le 2 ] || { usage; exit 2; }
    cmd_detect_policy "${2:-}"
    ;;
  commit-related)
    [ "$#" -ge 2 ] && [ "$#" -le 3 ] || { usage; exit 2; }
    cmd_commit_related "$2" "${3:-closeout}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
