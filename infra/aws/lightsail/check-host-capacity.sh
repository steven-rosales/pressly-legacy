#!/usr/bin/env bash
set -euo pipefail

DISK_USED_LIMIT_PERCENT="${PRESSLY_HOST_DISK_USED_LIMIT_PERCENT:-80}"
MEMORY_AVAILABLE_LIMIT_MIB="${PRESSLY_HOST_MEMORY_AVAILABLE_LIMIT_MIB:-512}"

validate_positive_integer() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "$name must be a canonical positive integer." >&2
    exit 1
  fi
}

validate_nonnegative_integer() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^(0|[1-9][0-9]*)$ ]]; then
    echo "$name must be a canonical nonnegative integer." >&2
    exit 1
  fi
}

validate_positive_integer \
  PRESSLY_HOST_DISK_USED_LIMIT_PERCENT \
  "$DISK_USED_LIMIT_PERCENT"
validate_positive_integer \
  PRESSLY_HOST_MEMORY_AVAILABLE_LIMIT_MIB \
  "$MEMORY_AVAILABLE_LIMIT_MIB"

if [[ "$DISK_USED_LIMIT_PERCENT" -gt 100 ]]; then
  echo "PRESSLY_HOST_DISK_USED_LIMIT_PERCENT must not exceed 100." >&2
  exit 1
fi

disk_paths=(/)
if [[ -d /var/lib/docker ]]; then
  disk_paths+=(/var/lib/docker)
fi

disk_used_percent="$(
  df -P "${disk_paths[@]}" | awk '
    NR > 1 {
      gsub(/%/, "", $5)
      if ($5 > greatest) greatest = $5
      found = 1
    }
    END {
      if (!found) exit 1
      print greatest
    }
  '
)"
memory_available_mib="$(
  free -m | awk '
    $1 == "Mem:" {
      print $7
      found = 1
    }
    END {
      if (!found) exit 1
    }
  '
)"

validate_nonnegative_integer disk_used_percent "$disk_used_percent"
validate_nonnegative_integer memory_available_mib "$memory_available_mib"

if [[ "$disk_used_percent" -ge "$DISK_USED_LIMIT_PERCENT" || \
  "$memory_available_mib" -lt "$MEMORY_AVAILABLE_LIMIT_MIB" ]]; then
  printf \
    'Host capacity threshold exceeded: disk=%s%% limit=%s%% memory_available=%sMiB limit=%sMiB\n' \
    "$disk_used_percent" \
    "$DISK_USED_LIMIT_PERCENT" \
    "$memory_available_mib" \
    "$MEMORY_AVAILABLE_LIMIT_MIB" >&2
  exit 1
fi

printf \
  'Host capacity healthy: disk=%s%% memory_available=%sMiB\n' \
  "$disk_used_percent" \
  "$memory_available_mib"
