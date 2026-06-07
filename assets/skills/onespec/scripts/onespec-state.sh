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
handoff_hash: null
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
    phase|ambiguity|complexity|implementation_path|execution_method|workspace|origin_branch|origin_workspace_path|origin_workspace_mode|plan|handoff_context|handoff_hash|review_result|archive|updated_at)
      ;;
    *)
      die "unsupported field: $key"
      ;;
  esac

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
  for key in phase ambiguity complexity implementation_path execution_method workspace origin_branch origin_workspace_path origin_workspace_mode plan handoff_context handoff_hash review_result archive updated_at; do
    printf '%s: %s\n' "$key" "$(field_value "$file" "$key")"
  done

  case "$(field_value "$file" phase)" in
    intake)
      echo "下一步: 执行歧义扫描，然后创建或恢复 OpenSpec 提案"
      ;;
    proposal-ready)
      echo "下一步: 汇总提案并等待用户明确批准"
      ;;
    approved)
      echo "下一步: 创建或校验实现计划"
      ;;
    plan-ready)
      echo "下一步: 确认 Superpowers 执行方式和工作区隔离方式"
      ;;
    implementing)
      echo "下一步: 继续未完成任务，然后更新 tasks.md"
      ;;
    review)
      echo "下一步: 等待用户评审，并根据反馈修复或收尾"
      ;;
    done|archived)
      echo "下一步: 没有剩余实现工作"
      ;;
    *)
      echo "下一步: 检查 OpenSpec 产物并修复状态"
      ;;
  esac
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
