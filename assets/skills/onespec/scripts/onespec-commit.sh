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

meta_dir() {
  local change="$1"
  printf '%s/.onespec\n' "$(change_dir "$change")"
}

touched_file() {
  local change="$1"
  printf '%s/touched-files.txt\n' "$(meta_dir "$change")"
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

  for file in AGENTS.md CONTRIBUTING.md CONTRIBUTING.zh-CN.md README.md README-zh.md README.en.md; do
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

  if grep -Eiq '<type>\(<scope>\):|conventional commit|conventional commits|commitlint|type\(scope\)' "$file"; then
    echo "conventional"
    return 0
  fi
  echo "unknown"
}

infer_scope() {
  local change="${1:-}"
  local tracked

  if [ -z "$change" ]; then
    echo "repo"
    return 0
  fi

  tracked="$(touched_file "$change")"
  if [ ! -f "$tracked" ] || [ ! -s "$tracked" ]; then
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
}

cmd_track() {
  local change="$1"
  shift
  valid_change "$change"
  [ "$#" -gt 0 ] || die "track requires at least one path"

  local dir tracked tmp path
  dir="$(meta_dir "$change")"
  tracked="$(touched_file "$change")"
  mkdir -p "$dir"
  tmp="$(mktemp)"

  if [ -f "$tracked" ]; then
    cat "$tracked" > "$tmp"
  fi

  for path in "$@"; do
    normalize_path "$path" >> "$tmp"
  done

  sort_unique_lines < "$tmp" > "$tracked"
  rm -f "$tmp"
  cat "$tracked"
}

cmd_tracked() {
  local change="$1"
  valid_change "$change"

  local tracked
  tracked="$(touched_file "$change")"
  if [ -f "$tracked" ]; then
    cat "$tracked"
  fi
}

cmd_related_dirty() {
  local change="$1"
  valid_change "$change"
  ensure_git_repo

  local tracked
  tracked="$(touched_file "$change")"
  if [ ! -f "$tracked" ] || [ ! -s "$tracked" ]; then
    return 0
  fi

  awk 'NR==FNR { dirty[$0] = 1; next } dirty[$0] { print $0 }' <(git_dirty_paths | sort_unique_lines) "$tracked"
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
  local layout source origin format language confidence scope

  layout="$(repo_layout)"
  scope="$(infer_scope "$change")"
  confidence="default"
  origin="default"
  source="default"
  format="conventional"
  language="en"

  if source="$(find_policy_doc)"; then
    origin="project-doc"
    confidence="explicit"
    format="$(detect_format_from_file "$source")"
    language="$(detect_language_from_doc "$source")"
    [ "$format" != "unknown" ] || format="conventional"
    [ "$language" != "unknown" ] || language="en"
  else
    local config_source
    if config_source="$(find_commit_config)"; then
      source="$config_source"
      origin="project-config"
      confidence="partial"
      format="conventional"
      language="en"
    fi
  fi

  cat <<EOF
policy_source: $source
policy_origin: $origin
policy_confidence: $confidence
commit_format: $format
message_language: $language
repo_layout: $layout
scope_hint: $scope
template: <type>(<scope>): <summary>
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
  *)
    usage
    exit 2
    ;;
esac
