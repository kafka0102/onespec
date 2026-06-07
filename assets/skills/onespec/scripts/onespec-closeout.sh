#!/usr/bin/env bash
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

fail_message() {
  echo "$*" >&2
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
  printf '%s/.onespec.yaml\n' "$(change_dir "$change")"
}

field_value() {
  local file="$1"
  local key="$2"
  awk -F ': *' -v key="$key" '$1 == key { sub(/^[^:]+: */, ""); print; found=1; exit } END { if (!found) exit 0 }' "$file" 2>/dev/null
}

get_state_value() {
  local change="$1"
  local key="$2"
  local file
  file="$(state_file "$change")"
  [ -f "$file" ] || die "state not found: $file"
  field_value "$file" "$key"
}

ensure_git_repo() {
  git rev-parse --show-toplevel >/dev/null 2>&1 || die "current directory is not inside a git repository"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

current_branch() {
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  printf '%s\n' "${branch:-detached}"
}

current_workspace_path() {
  pwd -P
}

canonicalize_path() {
  local input="$1"
  if [ -z "$input" ] || [ "$input" = "unknown" ] || [ ! -d "$input" ]; then
    printf '%s\n' "$input"
    return 0
  fi
  (
    cd "$input"
    pwd -P
  )
}

get_remote_url() {
  git remote get-url origin 2>/dev/null || true
}

parse_remote_host() {
  local remote="$1"
  if [[ "$remote" =~ ^https?://([^/@]+@)?([^/:]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[2]}"
    return 0
  fi
  if [[ "$remote" =~ ^ssh://([^/@]+@)?([^/:]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[2]}"
    return 0
  fi
  if [[ "$remote" =~ ^[^@]+@([^:]+): ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  printf '\n'
}

detect_repo_platform() {
  local host="$1"
  local host_lc
  host_lc="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"

  if [ -n "${ONESPEC_REPO_PLATFORM:-}" ]; then
    printf '%s\n' "$ONESPEC_REPO_PLATFORM"
    return 0
  fi

  case "$host_lc" in
    *github*)
      echo "github"
      return 0
      ;;
    *gitlab*)
      echo "gitlab"
      return 0
      ;;
  esac

  if [ -n "$host" ] && command_exists gh && gh auth status --hostname "$host" >/dev/null 2>&1; then
    echo "github"
    return 0
  fi
  if [ -n "$host" ] && command_exists glab && glab auth status --hostname "$host" >/dev/null 2>&1; then
    echo "gitlab"
    return 0
  fi

  echo "unknown"
}

probe_review_request() {
  ensure_git_repo

  local remote_url remote_host platform kind supported tool error
  remote_url="$(get_remote_url)"
  remote_host="$(parse_remote_host "$remote_url")"
  platform="$(detect_repo_platform "$remote_host")"
  kind="PR/MR"
  supported="false"
  tool="none"
  error="无法自动创建 PR/MR：未能判断仓库托管平台，请先确认 remote 或手动创建。"

  case "$platform" in
    github)
      kind="PR"
      tool="gh"
      error="无法创建 PR：未检测到 gh，或 gh 未登录到 ${remote_host:-<host>}。"
      if command_exists gh && [ -n "$remote_host" ] && gh auth status --hostname "$remote_host" >/dev/null 2>&1; then
        supported="true"
        error="none"
      fi
      ;;
    gitlab)
      kind="MR"
      tool="glab"
      error="无法创建 MR：未检测到 glab，或 glab 未登录到 ${remote_host:-<host>}。"
      if command_exists glab && [ -n "$remote_host" ] && glab auth status --hostname "$remote_host" >/dev/null 2>&1; then
        supported="true"
        error="none"
      fi
      ;;
    unknown)
      ;;
    *)
      platform="unknown"
      ;;
  esac

  cat <<EOF
remote_url: ${remote_url:-unknown}
remote_host: ${remote_host:-unknown}
repo_platform: $platform
review_request_kind: $kind
review_request_supported: $supported
review_request_tool: $tool
review_request_error: $error
EOF
}

selected_actions_csv() {
  local joined=""
  local item
  for item in "$@"; do
    if [ -n "$joined" ]; then
      joined="${joined},${item}"
    else
      joined="$item"
    fi
  done
  printf '%s\n' "$joined"
}

normalize_action() {
  case "$1" in
    submit-review|review-request|pr|mr)
      echo "submit-review"
      ;;
    merge|merge-branch|local-merge)
      echo "merge"
      ;;
    archive|run-archive)
      echo "archive"
      ;;
    "")
      echo ""
      ;;
    *)
      die "unsupported closeout action: $1"
      ;;
  esac
}

append_unique_action() {
  local candidate="$1"
  shift
  local existing
  for existing in "$@"; do
    if [ "$existing" = "$candidate" ]; then
      printf '%s\n' "$@"
      return 0
    fi
  done
  printf '%s\n' "$@"
  printf '%s\n' "$candidate"
}

is_truthy() {
  [ "$1" = "true" ]
}

temporary_worktree_status() {
  local change="$1"
  local origin_branch origin_path origin_mode current_path current_head temporary reason

  origin_branch="$(get_state_value "$change" origin_branch)"
  origin_path="$(get_state_value "$change" origin_workspace_path)"
  origin_mode="$(get_state_value "$change" origin_workspace_mode)"
  origin_path="$(canonicalize_path "$origin_path")"
  current_path="$(current_workspace_path)"
  current_head="$(current_branch)"
  temporary="false"
  reason="none"

  if [ "$origin_mode" = "worktree" ]; then
    temporary="true"
    reason="origin-workspace-mode"
  fi
  if [ -n "$origin_path" ] && [ "$origin_path" != "unknown" ] && [ "$origin_path" != "$current_path" ]; then
    temporary="true"
    reason="workspace-path-differs"
  fi
  if [ -n "$origin_branch" ] && [ "$origin_branch" != "unknown" ] && [ "$origin_branch" != "$current_head" ]; then
    temporary="true"
    if [ "$reason" = "none" ]; then
      reason="branch-differs"
    fi
  fi

  cat <<EOF
current_branch: $current_head
current_workspace_path: $current_path
origin_branch: $origin_branch
origin_workspace_path: $origin_path
origin_workspace_mode: $origin_mode
temporary_worktree: $temporary
temporary_worktree_reason: $reason
EOF
}

recommended_combination() {
  local change="$1"
  local review_probe worktree_probe platform supported temporary recommendation reason

  review_probe="$(probe_review_request)"
  worktree_probe="$(temporary_worktree_status "$change")"
  platform="$(printf '%s\n' "$review_probe" | awk -F ': ' '$1 == "repo_platform" { print $2 }')"
  supported="$(printf '%s\n' "$review_probe" | awk -F ': ' '$1 == "review_request_supported" { print $2 }')"
  temporary="$(printf '%s\n' "$worktree_probe" | awk -F ': ' '$1 == "temporary_worktree" { print $2 }')"

  recommendation="none"
  reason="review-only"

  if [ "$temporary" = "true" ] && { [ "$platform" = "github" ] || [ "$platform" = "gitlab" ]; }; then
    recommendation="submit-review"
    if [ "$supported" = "true" ]; then
      reason="temporary-worktree-review-first"
    else
      reason="temporary-worktree-manual-review-request"
    fi
  elif [ "$temporary" = "false" ]; then
    recommendation="merge,archive"
    reason="already-on-target-path"
  fi

  cat <<EOF
recommended_actions: $recommendation
recommended_reason: $reason
EOF
}

cmd_inspect() {
  local change="$1"
  valid_change "$change"
  ensure_git_repo

  probe_review_request
  temporary_worktree_status "$change"
  cat <<'EOF'
cleanup_local_branch_after_review_request: true
cleanup_local_worktree_after_review_request: true
cleanup_remote_branch_after_review_request: false
cleanup_local_branch_after_merge: true
cleanup_local_worktree_after_merge: true
cleanup_remote_branch_after_merge: false
EOF
  recommended_combination "$change"
}

cmd_guard_review_request() {
  local change="$1"
  valid_change "$change"
  local probe supported error

  probe="$(probe_review_request)"
  supported="$(printf '%s\n' "$probe" | awk -F ': ' '$1 == "review_request_supported" { print $2 }')"
  error="$(printf '%s\n' "$probe" | awk -F ': ' '$1 == "review_request_error" { sub(/^[^:]+: /, ""); print }')"

  if [ "$supported" != "true" ]; then
    fail_message "$error"
  fi

  printf '%s\n' "$probe"
}

cmd_recommend_actions() {
  local change="$1"
  valid_change "$change"
  ensure_git_repo
  cmd_inspect "$change"
}

cmd_validate_actions() {
  local change="$1"
  shift
  valid_change "$change"
  ensure_git_repo

  local -a selected=()
  local action normalized
  local already_selected
  local has_review="false"
  local has_merge="false"
  local has_archive="false"
  local current_head origin_branch temporary valid message

  for action in "$@"; do
    normalized="$(normalize_action "$action")"
    [ -n "$normalized" ] || continue
    already_selected="false"
    for action in "${selected[@]:-}"; do
      if [ "$action" = "$normalized" ]; then
        already_selected="true"
        break
      fi
    done
    if [ "$already_selected" != "true" ]; then
      selected+=("$normalized")
    fi
  done

  for action in "${selected[@]}"; do
    case "$action" in
      submit-review) has_review="true" ;;
      merge) has_merge="true" ;;
      archive) has_archive="true" ;;
    esac
  done

  valid="true"
  message="可以执行所选收尾动作。"
  current_head="$(current_branch)"
  origin_branch="$(get_state_value "$change" origin_branch)"
  temporary="$(temporary_worktree_status "$change" | awk -F ': ' '$1 == "temporary_worktree" { print $2 }')"

  if [ "$has_review" = "true" ] && [ "$has_archive" = "true" ]; then
    valid="false"
    message="不能同时选择“提交 PR/MR”和“执行归档”：代码尚未真正合入目标分支。"
  elif [ "$has_review" = "true" ] && [ "$has_merge" = "true" ]; then
    valid="false"
    message="不能同时选择“提交 PR/MR”和“合并分支”：这是两条不同的集成路径。"
  elif [ "$has_archive" = "true" ] && [ "$has_merge" != "true" ]; then
    if [ "$temporary" = "true" ] || [ "$origin_branch" != "unknown" ] && [ "$current_head" != "$origin_branch" ]; then
      valid="false"
      message="不能单独执行归档：当前代码尚未确认位于目标分支。"
    else
      message="允许单独执行归档：当前已在目标分支路径上。"
    fi
  elif [ "${#selected[@]}" -eq 0 ]; then
    message="本次不执行合并、评审单或归档；之后仍可再次进入收尾。"
  fi

  cat <<EOF
selected_actions: $(selected_actions_csv "${selected[@]}")
valid: $valid
message: $message
temporary_worktree: $temporary
current_branch: $current_head
origin_branch: $origin_branch
EOF
}

usage() {
  cat <<'EOF'
用法:
  onespec-closeout.sh inspect <change>
  onespec-closeout.sh guard-review-request <change>
  onespec-closeout.sh recommend-actions <change>
  onespec-closeout.sh validate-actions <change> [submit-review] [merge] [archive]
EOF
}

cmd="${1:-}"
case "$cmd" in
  inspect)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_inspect "$2"
    ;;
  guard-review-request)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_guard_review_request "$2"
    ;;
  recommend-actions)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_recommend_actions "$2"
    ;;
  validate-actions)
    [ "$#" -ge 2 ] || { usage; exit 2; }
    shift
    cmd_validate_actions "$@"
    ;;
  *)
    usage
    exit 2
    ;;
esac
