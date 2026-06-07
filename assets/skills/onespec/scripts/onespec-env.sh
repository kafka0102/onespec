#!/usr/bin/env bash

_onespec_env_source="${BASH_SOURCE[0]:-$0}"
_onespec_script_dir="$(cd "$(dirname "$_onespec_env_source")" && pwd -P)"

export ONESPEC_STATE="${ONESPEC_STATE:-${_onespec_script_dir}/onespec-state.sh}"
export ONESPEC_HANDOFF="${ONESPEC_HANDOFF:-${_onespec_script_dir}/onespec-handoff.sh}"
export ONESPEC_BASH="${ONESPEC_BASH:-${BASH:-bash}}"

if [ ! -f "$ONESPEC_STATE" ] || [ ! -f "$ONESPEC_HANDOFF" ]; then
  echo "ERROR: OneSpec scripts are incomplete. Re-run onespec init --overwrite." >&2
  return 1 2>/dev/null || exit 1
fi
