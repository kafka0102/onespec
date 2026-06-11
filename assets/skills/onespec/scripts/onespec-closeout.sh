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

git_common_dir() {
  git rev-parse --git-common-dir
}

current_branch() {
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  printf '%s\n' "${branch:-detached}"
}

current_workspace_path() {
  pwd -P
}

script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P
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

state_destination_in_origin() {
  local change="$1"
  local origin_path
  origin_path="$(canonicalize_path "$(get_state_value "$change" origin_workspace_path)")"
  [ -n "$origin_path" ] || die "origin workspace path is empty"
  [ "$origin_path" != "unknown" ] || die "origin workspace path is unknown"
  printf '%s/openspec/changes/%s/.onespec.yaml\n' "$origin_path" "$change"
}

origin_workspace_path_for_change() {
  canonicalize_path "$(get_state_value "$1" origin_workspace_path)"
}

normalize_action() {
  case "$1" in
    merge-worktree|merge|accept-worktree|accept)
      echo "merge-worktree"
      ;;
    discard-worktree|discard|drop-code)
      echo "discard-worktree"
      ;;
    delete-worktree|drop-worktree|cleanup-worktree)
      echo "delete-worktree"
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
  local worktree_probe temporary recommendation reason

  worktree_probe="$(temporary_worktree_status "$change")"
  temporary="$(printf '%s\n' "$worktree_probe" | awk -F ': ' '$1 == "temporary_worktree" { print $2 }')"

  recommendation="none"
  reason="review-only"

  if [ "$temporary" = "true" ]; then
    recommendation="merge-worktree"
    reason="temporary-worktree-targets-base-branch"
  else
    recommendation="archive"
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

  temporary_worktree_status "$change"
  cat <<'EOF'
cleanup_local_branch_after_merge: true
cleanup_local_worktree_after_merge: true
cleanup_remote_branch_after_merge: false
cleanup_local_branch_after_discard: true
cleanup_local_worktree_after_discard: true
cleanup_local_branch_after_preserve: false
cleanup_local_worktree_after_preserve: false
EOF
  recommended_combination "$change"
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
  local has_merge_worktree="false"
  local has_discard_worktree="false"
  local has_delete_worktree="false"
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
      merge-worktree) has_merge_worktree="true" ;;
      discard-worktree) has_discard_worktree="true" ;;
      delete-worktree) has_delete_worktree="true" ;;
      archive) has_archive="true" ;;
    esac
  done

  valid="true"
  message="可以执行所选收尾动作。"
  current_head="$(current_branch)"
  origin_branch="$(get_state_value "$change" origin_branch)"
  temporary="$(temporary_worktree_status "$change" | awk -F ': ' '$1 == "temporary_worktree" { print $2 }')"

  if [ "$has_merge_worktree" = "true" ] && [ "$has_discard_worktree" = "true" ]; then
    valid="false"
    message="不能同时选择合并和废弃临时 worktree。"
  elif [ "$has_discard_worktree" = "true" ] && [ "$has_archive" = "true" ]; then
    valid="false"
    message="不能废弃代码后归档：只有用户接受并合并提交后才允许询问归档。"
  elif [ "$has_merge_worktree" = "true" ] && [ "$temporary" != "true" ]; then
    valid="false"
    message="不能合并 worktree：当前不在临时 worktree。"
  elif [ "$has_discard_worktree" = "true" ] && [ "$temporary" != "true" ]; then
    valid="false"
    message="不能废弃 worktree：当前不在临时 worktree。"
  elif [ "$has_merge_worktree" = "true" ]; then
    if [ "$has_archive" = "true" ]; then
      message="允许自动合并临时 worktree 到 ${origin_branch} 并删除 worktree，然后继续归档。"
    else
      message="允许自动合并临时 worktree 到 ${origin_branch} 并删除 worktree。"
    fi
  elif [ "$has_discard_worktree" = "true" ]; then
    message="允许删除临时 worktree 并废弃对应本地分支代码；废弃后不应归档。"
  elif [ "$has_delete_worktree" = "true" ] && [ "$temporary" != "true" ]; then
    valid="false"
    message="不能删除 worktree：当前不在临时 worktree。"
  elif [ "$has_archive" = "true" ] && [ "$has_delete_worktree" = "true" ]; then
    valid="false"
    message="不再支持删除 worktree 与归档一次完成：应先合并或废弃 worktree，合并后再询问是否归档。"
  elif [ "$has_delete_worktree" = "true" ] && [ "$has_archive" != "true" ]; then
    message="允许仅删除临时 worktree并保留对应本地分支；如需废弃代码请使用 discard-worktree。"
  elif [ "$has_archive" = "true" ] && [ "$has_delete_worktree" != "true" ]; then
    if [ "$temporary" = "true" ] || { [ "$origin_branch" != "unknown" ] && [ "$current_head" != "$origin_branch" ]; }; then
      valid="false"
      message="不能单独执行归档：当前代码尚未确认位于目标分支。"
    else
      message="允许单独执行归档：当前已在目标分支路径上。"
    fi
  elif [ "${#selected[@]}" -eq 0 ]; then
    message="本次不删除 worktree 或归档；之后仍可再次进入收尾。"
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

run_archive_command() {
  local workspace="$1"
  local change="$2"
  local archive_bin="${ONESPEC_ARCHIVE_BIN:-openspec}"
  (
    cd "$workspace"
    "$archive_bin" archive "$change" --yes
  )
}

run_state_set_in_workspace() {
  local workspace="$1"
  local change="$2"
  local key="$3"
  local value="$4"
  (
    cd "$workspace"
    "${BASH:-bash}" "$(script_dir)/onespec-state.sh" set "$change" "$key" "$value"
  )
}

run_cleanup_runtime_in_workspace() {
  local workspace="$1"
  local change="$2"
  (
    cd "$workspace"
    "${BASH:-bash}" "$(script_dir)/onespec-closeout.sh" cleanup-runtime "$change" >/dev/null
  )
}

preserve_runtime_state_in_origin() {
  local change="$1"
  local source_file destination_file destination_dir
  source_file="$(state_file "$change")"
  destination_file="$(state_destination_in_origin "$change")"
  destination_dir="$(dirname "$destination_file")"

  mkdir -p "$destination_dir"
  cp "$source_file" "$destination_file"
  printf '%s\n' "$destination_file"
}

delete_current_worktree() {
  local current_path common_dir
  current_path="$(current_workspace_path)"
  common_dir="$(git_common_dir)"
  git --git-dir="$common_dir" worktree remove --force "$current_path"
  printf '%s\n' "$current_path"
}

merge_current_worktree_to_origin() {
  local change="$1"
  local current_path current_head origin_branch origin_workspace origin_head

  current_path="$(current_workspace_path)"
  current_head="$(current_branch)"
  origin_branch="$(get_state_value "$change" origin_branch)"
  origin_workspace="$(origin_workspace_path_for_change "$change")"

  [ -n "$origin_workspace" ] || die "origin workspace path is empty"
  [ "$origin_workspace" != "unknown" ] || die "origin workspace path is unknown"
  [ "$origin_workspace" != "$current_path" ] || die "current workspace is already the origin workspace"
  [ "$current_head" != "detached" ] || die "cannot merge a detached worktree"

  origin_head="$(git -C "$origin_workspace" branch --show-current 2>/dev/null || true)"
  [ "$origin_head" = "$origin_branch" ] || die "origin workspace is on ${origin_head:-detached}, expected $origin_branch"

  if [ -n "$(git -C "$origin_workspace" status --porcelain=v1)" ]; then
    die "origin workspace has uncommitted changes: $origin_workspace"
  fi

  git -C "$origin_workspace" merge "$current_head"

  cat <<EOF
merged_branch: $current_head
merged_into: $origin_branch
origin_workspace_path: $origin_workspace
EOF
}

delete_current_worktree_branch() {
  local current_head common_dir current_path parent_path
  current_head="$(current_branch)"
  [ "$current_head" != "detached" ] || die "cannot delete a detached worktree branch"
  common_dir="$(git_common_dir)"
  current_path="$(current_workspace_path)"
  parent_path="$(dirname "$current_path")"
  delete_current_worktree >/dev/null
  git -C "$parent_path" --git-dir="$common_dir" branch -D "$current_head" >/dev/null
  printf '%s\n' "$current_head"
}

delete_current_worktree_and_merged_branch() {
  local current_head common_dir current_path parent_path
  current_head="$(current_branch)"
  [ "$current_head" != "detached" ] || die "cannot delete a detached worktree branch"
  common_dir="$(git_common_dir)"
  current_path="$(current_workspace_path)"
  parent_path="$(dirname "$current_path")"
  delete_current_worktree >/dev/null
  git -C "$parent_path" --git-dir="$common_dir" branch -d "$current_head" >/dev/null
  printf '%s\n' "$current_path"
}

commit_field() {
  local payload="$1"
  local key="$2"
  printf '%s\n' "$payload" | awk -F ': ' -v key="$key" '$1 == key { sub(/^[^:]+: /, ""); print; exit }'
}

run_commit_related() {
  local workspace="$1"
  local change="$2"
  local context="$3"
  (
    cd "$workspace"
    "${BASH:-bash}" "$(script_dir)/onespec-commit.sh" commit-related "$change" "$context"
  )
}

cmd_run_actions() {
  local change="$1"
  shift
  valid_change "$change"
  ensure_git_repo

  local validation selected valid archive_selected delete_selected preserved_state removed_worktree
  local merge_selected discard_selected merged_branch discarded_branch merge_result
  local pre_closeout_commit post_archive_commit preserved_state_commit origin_workspace_path
  local action_workspace archive_workspace
  validation="$(cmd_validate_actions "$change" "$@")"
  selected="$(printf '%s\n' "$validation" | awk -F ': ' '$1 == "selected_actions" { print $2 }')"
  valid="$(printf '%s\n' "$validation" | awk -F ': ' '$1 == "valid" { print $2 }')"

  [ "$valid" = "true" ] || die "$(printf '%s\n' "$validation" | awk -F ': ' '$1 == "message" { print $2 }')"
  [ -n "$selected" ] || die "run-actions requires at least one closeout action"
  action_workspace="$(current_workspace_path)"
  origin_workspace_path="$(origin_workspace_path_for_change "$change")"
  archive_workspace="$action_workspace"

  archive_selected="false"
  delete_selected="false"
  merge_selected="false"
  discard_selected="false"
  if printf '%s\n' "$selected" | grep -Eq '(^|,)merge-worktree($|,)'; then
    merge_selected="true"
  fi
  if printf '%s\n' "$selected" | grep -Eq '(^|,)discard-worktree($|,)'; then
    discard_selected="true"
  fi
  if printf '%s\n' "$selected" | grep -Eq '(^|,)archive($|,)'; then
    archive_selected="true"
  fi
  if printf '%s\n' "$selected" | grep -Eq '(^|,)delete-worktree($|,)'; then
    delete_selected="true"
  fi

  preserved_state=""
  removed_worktree=""
  merged_branch="none"
  discarded_branch="none"
  merge_result=""
  if [ "$merge_selected" = "true" ]; then
    run_state_set_in_workspace "$action_workspace" "$change" phase done
    run_state_set_in_workspace "$action_workspace" "$change" archive skipped
  fi
  if [ "$discard_selected" = "true" ]; then
    pre_closeout_commit='commit_created: false
commit_context: closeout
commit_sha: none
commit_message: none'
  else
    pre_closeout_commit="$(run_commit_related "$action_workspace" "$change" closeout)"
  fi
  post_archive_commit='commit_created: false
commit_context: archive
commit_sha: none
commit_message: none'
  preserved_state_commit='commit_created: false
commit_context: preserve-state
commit_sha: none
commit_message: none'

  if [ "$merge_selected" = "true" ]; then
    merge_result="$(merge_current_worktree_to_origin "$change")"
    merged_branch="$(commit_field "$merge_result" merged_branch)"
    archive_workspace="$origin_workspace_path"
    removed_worktree="$(delete_current_worktree_and_merged_branch)"
  fi

  if [ "$discard_selected" = "true" ]; then
    discarded_branch="$(current_branch)"
    removed_worktree="$(current_workspace_path)"
    delete_current_worktree_branch >/dev/null
  fi

  if [ "$archive_selected" = "true" ]; then
    run_archive_command "$archive_workspace" "$change"
    run_state_set_in_workspace "$archive_workspace" "$change" phase archived
    run_state_set_in_workspace "$archive_workspace" "$change" archive archived
    run_cleanup_runtime_in_workspace "$archive_workspace" "$change"
    post_archive_commit="$(run_commit_related "$archive_workspace" "$change" archive)"
  fi

  if [ "$delete_selected" = "true" ]; then
    if [ "$archive_selected" != "true" ]; then
      run_state_set_in_workspace "$action_workspace" "$change" phase done
      run_state_set_in_workspace "$action_workspace" "$change" archive skipped
      preserved_state="$(preserve_runtime_state_in_origin "$change")"
      preserved_state_commit="$(run_commit_related "$origin_workspace_path" "$change" preserve-state)"
    fi
    removed_worktree="$(delete_current_worktree)"
  fi

  cat <<EOF
selected_actions: $selected
worktree_merged: $merge_selected
merged_branch: $merged_branch
worktree_discarded: $discard_selected
discarded_branch: $discarded_branch
archive_executed: $archive_selected
worktree_deleted: $(if [ "$delete_selected" = "true" ] || [ "$merge_selected" = "true" ] || [ "$discard_selected" = "true" ]; then echo "true"; else echo "false"; fi)
pre_closeout_commit_created: $(commit_field "$pre_closeout_commit" commit_created)
pre_closeout_commit_sha: $(commit_field "$pre_closeout_commit" commit_sha)
post_archive_commit_created: $(commit_field "$post_archive_commit" commit_created)
post_archive_commit_sha: $(commit_field "$post_archive_commit" commit_sha)
preserved_state_commit_created: $(commit_field "$preserved_state_commit" commit_created)
preserved_state_commit_sha: $(commit_field "$preserved_state_commit" commit_sha)
preserved_state_file: ${preserved_state:-none}
deleted_worktree_path: ${removed_worktree:-none}
EOF
}

cmd_cleanup_runtime() {
  local change="$1"
  valid_change "$change"

  local file
  file="$(state_file "$change")"
  if [ -f "$file" ]; then
    rm -f "$file"
    echo "$file"
  fi
}

usage() {
  cat <<'EOF'
用法:
  onespec-closeout.sh inspect <change>
  onespec-closeout.sh recommend-actions <change>
  onespec-closeout.sh validate-actions <change> [merge-worktree] [discard-worktree] [delete-worktree] [archive]
  onespec-closeout.sh run-actions <change> [merge-worktree] [discard-worktree] [delete-worktree] [archive]
  onespec-closeout.sh cleanup-runtime <change>
EOF
}

cmd="${1:-}"
case "$cmd" in
  inspect)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_inspect "$2"
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
  run-actions)
    [ "$#" -ge 3 ] || { usage; exit 2; }
    shift
    cmd_run_actions "$@"
    ;;
  cleanup-runtime)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_cleanup_runtime "$2"
    ;;
  *)
    usage
    exit 2
    ;;
esac
