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

today() {
  date +%Y-%m-%d
}

now_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

field_value() {
  local file="$1"
  local key="$2"
  awk -F ': *' -v key="$key" '$1 == key { sub(/^[^:]+: */, ""); print; found=1; exit } END { if (!found) exit 0 }' "$file" 2>/dev/null
}

enum_contains() {
  local needle="$1"
  shift
  local candidate
  for candidate in "$@"; do
    if [ "$candidate" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

validate_enum_value() {
  local key="$1"
  local value="$2"

  case "$key" in
    phase)
      enum_contains "$value" intake proposal-ready approved plan-ready implementing review done archived \
        || die "invalid value for $key: $value"
      ;;
    ambiguity)
      enum_contains "$value" unknown low high || die "invalid value for $key: $value"
      ;;
    complexity)
      enum_contains "$value" unknown low medium high || die "invalid value for $key: $value"
      ;;
    implementation_path)
      enum_contains "$value" undecided openspec-apply superpowers || die "invalid value for $key: $value"
      ;;
    execution_method)
      enum_contains "$value" undecided subagent local native || die "invalid value for $key: $value"
      ;;
    workspace|origin_workspace_mode)
      enum_contains "$value" unknown undecided worktree current-branch main-override \
        || die "invalid value for $key: $value"
      ;;
    review_result)
      enum_contains "$value" pending changes-requested approved || die "invalid value for $key: $value"
      ;;
    archive)
      enum_contains "$value" pending skipped archived || die "invalid value for $key: $value"
      ;;
  esac
}

phase_transition_allowed() {
  local old="$1"
  local new="$2"

  [ "$old" = "$new" ] && return 0

  case "$old" in
    intake)
      enum_contains "$new" proposal-ready
      ;;
    proposal-ready)
      enum_contains "$new" intake approved
      ;;
    approved)
      enum_contains "$new" proposal-ready plan-ready implementing
      ;;
    plan-ready)
      enum_contains "$new" proposal-ready approved implementing
      ;;
    implementing)
      enum_contains "$new" proposal-ready approved plan-ready review
      ;;
    review)
      enum_contains "$new" implementing done archived
      ;;
    done)
      enum_contains "$new" review archived
      ;;
    archived)
      return 1
      ;;
    *)
      return 1
      ;;
  esac
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

cmd_init() {
  local change="$1"
  valid_change "$change"

  local dir file
  dir="$(change_dir "$change")"
  file="$(state_file "$change")"
  mkdir -p "$dir"

  if [ -f "$file" ]; then
    echo "$file"
    return 0
  fi

  cat > "$file" <<EOF
version: 1
change: $change
phase: intake
ambiguity: unknown
complexity: unknown
implementation_path: undecided
execution_method: undecided
workspace: undecided
origin_branch: unknown
origin_workspace_path: unknown
origin_workspace_mode: unknown
plan: null
handoff_context: null
handoff_purpose: null
handoff_summary: null
handoff_hash: null
touched_files_b64: null
review_result: pending
archive: pending
created_at: $(today)
updated_at: $(now_utc)
EOF
  echo "$file"
}

cmd_get() {
  local change="$1"
  local key="$2"
  valid_change "$change"
  local file
  file="$(state_file "$change")"
  [ -f "$file" ] || die "state not found: $file"
  field_value "$file" "$key"
}

cmd_set() {
  local change="$1"
  local key="$2"
  local value="$3"
  valid_change "$change"
  local file
  file="$(state_file "$change")"
  [ -f "$file" ] || die "state not found: $file"

  case "$key" in
    phase|ambiguity|complexity|implementation_path|execution_method|workspace|origin_branch|origin_workspace_path|origin_workspace_mode|plan|handoff_context|handoff_purpose|handoff_summary|handoff_hash|touched_files_b64|review_result|archive|updated_at)
      ;;
    *)
      die "unsupported field: $key"
      ;;
  esac

  validate_enum_value "$key" "$value"
  if [ "$key" = "phase" ]; then
    local current_phase
    current_phase="$(field_value "$file" phase)"
    phase_transition_allowed "$current_phase" "$value" \
      || die "illegal phase transition: $current_phase -> $value"
  fi

  set_field "$file" "$key" "$value"
  set_field "$file" "updated_at" "$(now_utc)"
}

cmd_recover() {
  local change="$1"
  valid_change "$change"
  local file
  file="$(state_file "$change")"
  [ -f "$file" ] || die "state not found: $file"

  echo "OneSpec 恢复状态"
  echo "change: $change"
  for key in phase ambiguity complexity implementation_path execution_method workspace origin_branch origin_workspace_path origin_workspace_mode plan handoff_context handoff_purpose handoff_summary handoff_hash review_result archive updated_at; do
    printf '%s: %s\n' "$key" "$(field_value "$file" "$key")"
  done
  local phase next_skill next_gate allowed_actions next_step
  phase="$(field_value "$file" phase)"

  case "$phase" in
    intake)
      next_skill="onespec-design"
      next_gate="ambiguity-scan"
      allowed_actions="scan-ambiguity,draft-proposal"
      next_step="执行歧义扫描，然后创建或恢复 OpenSpec 提案"
      ;;
    proposal-ready)
      next_skill="onespec-design"
      next_gate="proposal-approval"
      allowed_actions="show-approval-menu,revise-artifacts,pause-design"
      next_step="汇总提案并展示编号批准选项，等待用户回复数字"
      ;;
    approved)
      next_skill="onespec-execute"
      next_gate="implementation-route"
      allowed_actions="confirm-route,create-plan,choose-workspace"
      next_step="进入 \`onespec-execute\`，创建或校验实现计划"
      ;;
    plan-ready)
      next_skill="onespec-execute"
      next_gate="start-implementation"
      allowed_actions="record-phase-implementing,start-work,track-files"
      next_step="进入 \`onespec-execute\`，确认执行方式后开始实现，并先写入 \`phase implementing\`"
      ;;
    implementing)
      next_skill="onespec-execute"
      next_gate="implementation-in-progress"
      allowed_actions="continue-implementation,update-tasks,run-tests"
      next_step="继续未完成任务，然后更新 tasks.md"
      ;;
    review)
      next_skill="onespec-archive"
      next_gate="user-review-closeout"
      allowed_actions="request-changes,choose-archive-menu,direct-instruction"
      next_step="等待用户评审；若用户回复非编号内容则继续修改，若选择归档菜单则进入 \`onespec-archive\` 处理删除 worktree / 归档组合选项"
      ;;
    done|archived)
      next_skill="onespec-archive"
      next_gate="no-implementation-work"
      allowed_actions="stop,archive-if-needed"
      next_step="没有剩余实现工作"
      ;;
    *)
      next_skill="onespec"
      next_gate="repair-state"
      allowed_actions="inspect-artifacts,repair-state"
      next_step="检查 OpenSpec 产物并修复状态"
      ;;
  esac

  printf 'next_skill: %s\n' "$next_skill"
  printf 'next_gate: %s\n' "$next_gate"
  printf 'allowed_actions: %s\n' "$allowed_actions"
  printf '下一步: %s\n' "$next_step"
}

cmd_list() {
  if [ ! -d openspec/changes ]; then
    return 0
  fi
  find openspec/changes -name .onespec.yaml -type f | sort
}

usage() {
  cat <<'EOF'
用法:
  onespec-state.sh init <change>
  onespec-state.sh get <change> <field>
  onespec-state.sh set <change> <field> <value>
  onespec-state.sh recover <change>
  onespec-state.sh list
EOF
}

cmd="${1:-}"
case "$cmd" in
  init)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_init "$2"
    ;;
  get)
    [ "$#" -eq 3 ] || { usage; exit 2; }
    cmd_get "$2" "$3"
    ;;
  set)
    [ "$#" -eq 4 ] || { usage; exit 2; }
    cmd_set "$2" "$3" "$4"
    ;;
  recover)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    cmd_recover "$2"
    ;;
  list)
    cmd_list
    ;;
  *)
    usage
    exit 2
    ;;
esac
