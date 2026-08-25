#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
DRILL_SCRIPT="$ROOT_DIR/deploy/aws/lightsail/restore-postgres-drill.sh"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'
REAL_DOCKER="$(command -v docker)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pressly-restore-drill-proof.XXXXXXXX")"
BIN_DIR="$WORK_DIR/bin"
GNUPG_DIR="$WORK_DIR/gnupg"
PASSPHRASE_FILE="$WORK_DIR/backup-passphrase.txt"
BACKUP_FILE="$WORK_DIR/pressly-restore-drill-proof.dump.gpg"
SUCCESS_OUTPUT="$WORK_DIR/success.out"
SUCCESS_ERROR="$WORK_DIR/success.err"
FAILURE_OUTPUT="$WORK_DIR/failure.out"
FAILURE_ERROR="$WORK_DIR/failure.err"
TARGET_RECORD="$WORK_DIR/drill-target"
OBSERVATION_FILE="$WORK_DIR/drill-observation"
SOURCE_CONTAINER="pressly-restore-drill-proof-$(id -u)-$$-source"
SOURCE_VOLUME="$SOURCE_CONTAINER-data"
SOURCE_DATABASE='pressly_restore_source'
SOURCE_USER='pressly_restore_source'
SOURCE_PASSWORD="$(openssl rand -hex 24)"
PROBE_DELAY_SECONDS=4
DRILL_DELAY_SECONDS=6

fail() {
  echo "Disposable restore-drill proof failed: $*" >&2
  exit 1
}

for command in docker gpg grep openssl sha256sum; do
  command -v "$command" >/dev/null || fail "$command is required"
done
[[ -x "$DRILL_SCRIPT" ]] || fail "restore drill is not executable: $DRILL_SCRIPT"
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] ||
  fail 'refusing a non-local DOCKER_HOST'
DOCKER_CONTEXT="$($REAL_DOCKER context show)"
DOCKER_ENDPOINT="$($REAL_DOCKER context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
[[ "$DOCKER_ENDPOINT" == unix://* ]] ||
  fail "refusing a non-local Docker endpoint: $DOCKER_ENDPOINT"
[[ "$SOURCE_CONTAINER" =~ ^pressly-restore-drill-proof-[0-9]+-[0-9]+-source$ ]] ||
  fail 'source container name is unsafe'
if "$REAL_DOCKER" container inspect "$SOURCE_CONTAINER" >/dev/null 2>&1; then
  fail "refusing to reuse source container: $SOURCE_CONTAINER"
fi
if "$REAL_DOCKER" volume inspect "$SOURCE_VOLUME" >/dev/null 2>&1; then
  fail "refusing to reuse source volume: $SOURCE_VOLUME"
fi

read_target_record() {
  local expected_mode="$1"
  local target=''
  local mode=''
  [[ -f "$TARGET_RECORD" ]] || fail 'Docker shim did not record the drill container'
  IFS='|' read -r target mode < "$TARGET_RECORD"
  [[ "$target" =~ ^pressly-restore-drill-[0-9]+$ ]] ||
    fail 'Docker shim recorded an unsafe drill container name'
  [[ "$mode" == "$expected_mode" ]] ||
    fail "Docker shim recorded mode $mode instead of $expected_mode"
  printf '%s' "$target"
}

assert_drill_cleanup() {
  local target="$1"
  if "$REAL_DOCKER" container inspect "$target" >/dev/null 2>&1; then
    fail "drill container survived cleanup: $target"
  fi
  if "$REAL_DOCKER" volume inspect "$target-data" >/dev/null 2>&1; then
    fail "drill volume survived cleanup: $target-data"
  fi
}

cleanup() {
  local exit_code="$?"
  local cleanup_failed=false
  local target=''
  local mode=''
  trap - EXIT INT TERM
  set +e
  if "$REAL_DOCKER" container inspect "$SOURCE_CONTAINER" >/dev/null 2>&1; then
    if ((exit_code != 0)); then
      "$REAL_DOCKER" logs --tail 100 "$SOURCE_CONTAINER" >&2
    fi
    "$REAL_DOCKER" container rm --force "$SOURCE_CONTAINER" >/dev/null 2>&1 ||
      cleanup_failed=true
  fi
  "$REAL_DOCKER" volume rm "$SOURCE_VOLUME" >/dev/null 2>&1 || true
  if [[ -f "$TARGET_RECORD" ]]; then
    IFS='|' read -r target mode < "$TARGET_RECORD"
    if [[ "$target" =~ ^pressly-restore-drill-[0-9]+$ ]]; then
      "$REAL_DOCKER" container rm --force "$target" >/dev/null 2>&1 || true
      "$REAL_DOCKER" volume rm "$target-data" >/dev/null 2>&1 || true
    else
      cleanup_failed=true
    fi
  fi
  rm -rf "$WORK_DIR" || cleanup_failed=true
  if ((exit_code == 0)) && [[ "$cleanup_failed" == true ]]; then
    echo 'Disposable restore-drill proof passed, but teardown was incomplete.' >&2
    exit_code=1
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$BIN_DIR" "$GNUPG_DIR"
chmod 700 "$BIN_DIR" "$GNUPG_DIR"
export GNUPGHOME="$GNUPG_DIR"
openssl rand -hex -out "$PASSPHRASE_FILE" 32
chmod 600 "$PASSPHRASE_FILE"

cat > "$BIN_DIR/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

real_docker="${PRESSLY_DRILL_PROOF_REAL_DOCKER:?}"
postgres_image="${PRESSLY_DRILL_PROOF_POSTGRES_IMAGE:?}"
target_record="${PRESSLY_DRILL_PROOF_TARGET_RECORD:?}"
observation_file="${PRESSLY_DRILL_PROOF_OBSERVATION_FILE:?}"
mode="${PRESSLY_DRILL_PROOF_MODE:?}"
delay_seconds="${PRESSLY_DRILL_PROOF_DELAY_SECONDS:?}"

if [[ "${1:-}" == exec && "${2:-}" =~ ^pressly-restore-drill-[0-9]+$ ]]; then
  target="${2:-}"
  restore_command=false
  for argument in "${@:3}"; do
    if [[ "$argument" == pg_restore ]]; then
      restore_command=true
      break
    fi
  done
  if [[ "$restore_command" == true ]]; then
    pid_one="$($real_docker exec "$target" cat /proc/1/comm 2>/dev/null || true)"
    if [[ "$pid_one" != postgres ]]; then
      printf 'restore-before-final-postmaster:%s\n' "$pid_one" > "$observation_file"
      echo 'Docker shim rejected pg_restore before the final PostgreSQL postmaster.' >&2
      exit 96
    fi
    printf 'restore-after-final-postmaster\n' > "$observation_file"
  fi
fi

if [[ "${1:-}" != run ]]; then
  exec "$real_docker" "$@"
fi

target=''
arguments=("$@")
for ((index = 0; index < ${#arguments[@]}; index += 1)); do
  if [[ "${arguments[$index]}" == --name && $((index + 1)) -lt ${#arguments[@]} ]]; then
    target="${arguments[$((index + 1))]}"
    break
  fi
done
if [[ ! "$target" =~ ^pressly-restore-drill-[0-9]+$ ]]; then
  exec "$real_docker" "$@"
fi
case "$mode" in
  delay|fail) ;;
  *)
    echo "Unsupported restore-drill proof mode: $mode" >&2
    exit 2
    ;;
esac
printf '%s|%s\n' "$target" "$mode" > "$target_record"

delay_command='printf "SELECT pg_sleep(%s);\n" "$PRESSLY_DRILL_PROOF_DELAY_SECONDS" > /docker-entrypoint-initdb.d/00-hold.sql; exec /usr/local/bin/docker-entrypoint.sh postgres'
failure_command='echo "pressly-proof-postgres-start-failure" >&2; exit 23'
rewritten=()
image_found=false
for argument in "$@"; do
  if [[ "$argument" == "$postgres_image" && "$image_found" == false ]]; then
    image_found=true
    if [[ "$mode" == delay ]]; then
      rewritten+=(
        --tmpfs /docker-entrypoint-initdb.d:rw,noexec,nosuid,nodev,size=1m,mode=0755
        --env "PRESSLY_DRILL_PROOF_DELAY_SECONDS=$delay_seconds"
        --entrypoint bash
        "$argument"
        -ceu
        "$delay_command"
      )
    else
      rewritten+=(--entrypoint bash "$argument" -ceu "$failure_command")
    fi
  else
    rewritten+=("$argument")
  fi
done
[[ "$image_found" == true ]] || {
  echo 'Restore-drill Docker shim did not find the pinned PostgreSQL image.' >&2
  exit 2
}
exec "$real_docker" "${rewritten[@]}"
SH
chmod 700 "$BIN_DIR/docker"

SOURCE_INIT_COMMAND='printf "SELECT pg_sleep(%s);\n" "$PRESSLY_DRILL_PROOF_DELAY_SECONDS" > /docker-entrypoint-initdb.d/00-hold.sql; exec /usr/local/bin/docker-entrypoint.sh postgres'
"$REAL_DOCKER" volume create "$SOURCE_VOLUME" >/dev/null
"$REAL_DOCKER" run --detach --name "$SOURCE_CONTAINER" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --cap-add SETGID \
  --cap-add SETUID \
  --pids-limit 200 \
  --memory 1g \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --tmpfs /var/run/postgresql:rw,nosuid,nodev,size=16m,uid=999,gid=999 \
  --tmpfs /docker-entrypoint-initdb.d:rw,noexec,nosuid,nodev,size=1m,mode=0755 \
  --volume "$SOURCE_VOLUME:/var/lib/postgresql" \
  --env POSTGRES_DB="$SOURCE_DATABASE" \
  --env POSTGRES_USER="$SOURCE_USER" \
  --env POSTGRES_PASSWORD="$SOURCE_PASSWORD" \
  --env PRESSLY_DRILL_PROOF_DELAY_SECONDS="$PROBE_DELAY_SECONDS" \
  --entrypoint bash \
  "$POSTGRES_IMAGE" \
  -ceu "$SOURCE_INIT_COMMAND" >/dev/null

temporary_postmaster_observed=false
for _ in {1..120}; do
  source_state="$($REAL_DOCKER inspect --format '{{.State.Status}}' "$SOURCE_CONTAINER")"
  [[ "$source_state" == running ]] ||
    fail "source PostgreSQL stopped while proving temporary readiness: $source_state"
  pid_one="$($REAL_DOCKER exec "$SOURCE_CONTAINER" cat /proc/1/comm 2>/dev/null || true)"
  if [[ "$pid_one" != postgres ]] &&
    "$REAL_DOCKER" exec "$SOURCE_CONTAINER" \
      pg_isready -U "$SOURCE_USER" -d "$SOURCE_DATABASE" >/dev/null 2>&1; then
    temporary_postmaster_observed=true
    break
  fi
  sleep 0.1
done
[[ "$temporary_postmaster_observed" == true ]] ||
  fail 'PostgreSQL 18 temporary postmaster readiness was not observed'

final_postmaster_observed=false
for _ in {1..300}; do
  pid_one="$($REAL_DOCKER exec "$SOURCE_CONTAINER" cat /proc/1/comm 2>/dev/null || true)"
  if [[ "$pid_one" == postgres ]] &&
    "$REAL_DOCKER" exec "$SOURCE_CONTAINER" \
      pg_isready -U "$SOURCE_USER" -d "$SOURCE_DATABASE" >/dev/null 2>&1; then
    final_postmaster_observed=true
    break
  fi
  sleep 0.1
done
[[ "$final_postmaster_observed" == true ]] ||
  fail 'PostgreSQL 18 final postmaster readiness was not observed'

"$REAL_DOCKER" exec -i "$SOURCE_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$SOURCE_USER" -d "$SOURCE_DATABASE" >/dev/null <<'SQL'
CREATE SCHEMA drizzle;
CREATE TABLE drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint NOT NULL
);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (1, 'proof-migration-one', 1), (2, 'proof-migration-two', 2);
CREATE TABLE public.auth_identities (
  id uuid PRIMARY KEY,
  email_normalized text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auth_identities (id, email_normalized)
VALUES ('00000000-0000-4000-8000-000000000001', 'restore-proof@pressly.invalid');
CREATE TABLE public.restore_drill_proof (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payload text NOT NULL
);
INSERT INTO public.restore_drill_proof (payload) VALUES ('restorable');
SQL

"$REAL_DOCKER" exec "$SOURCE_CONTAINER" \
  pg_dump -U "$SOURCE_USER" -d "$SOURCE_DATABASE" \
    --format=custom --compress=9 --no-owner --no-privileges |
  gpg --symmetric --cipher-algo AES256 --batch \
    --passphrase-file "$PASSPHRASE_FILE" \
    --output "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
(
  cd "$WORK_DIR"
  sha256sum "$(basename "$BACKUP_FILE")" > "$(basename "$BACKUP_FILE").sha256"
)
chmod 600 "$BACKUP_FILE.sha256"

"$REAL_DOCKER" container rm --force "$SOURCE_CONTAINER" >/dev/null
"$REAL_DOCKER" volume rm "$SOURCE_VOLUME" >/dev/null

export \
  PRESSLY_DRILL_PROOF_REAL_DOCKER="$REAL_DOCKER" \
  PRESSLY_DRILL_PROOF_POSTGRES_IMAGE="$POSTGRES_IMAGE" \
  PRESSLY_DRILL_PROOF_TARGET_RECORD="$TARGET_RECORD" \
  PRESSLY_DRILL_PROOF_OBSERVATION_FILE="$OBSERVATION_FILE"

set +e
PATH="$BIN_DIR:$PATH" \
PRESSLY_DRILL_PROOF_MODE=delay \
PRESSLY_DRILL_PROOF_DELAY_SECONDS="$DRILL_DELAY_SECONDS" \
PRESSLY_BACKUP_PASSPHRASE_FILE="$PASSPHRASE_FILE" \
  bash "$DRILL_SCRIPT" "$BACKUP_FILE" > "$SUCCESS_OUTPUT" 2> "$SUCCESS_ERROR"
success_status="$?"
set -e
if [[ "$success_status" -ne 0 ]]; then
  sed -n '1,240p' "$SUCCESS_ERROR" >&2
  fail "actual restore drill failed with exit $success_status"
fi
success_target="$(read_target_record delay)"
assert_drill_cleanup "$success_target"
grep -Fx 'Restore drill passed.' "$SUCCESS_OUTPUT" >/dev/null ||
  fail 'actual restore drill did not report success'
grep -Fx 'Public tables: 2' "$SUCCESS_OUTPUT" >/dev/null ||
  fail 'actual restore drill did not restore both public tables'
grep -Fx 'auth_identities present: yes' "$SUCCESS_OUTPUT" >/dev/null ||
  fail 'actual restore drill did not prove auth_identities'
grep -Fx 'restore-after-final-postmaster' "$OBSERVATION_FILE" >/dev/null ||
  fail 'actual restore began before final-postmaster proof'

rm -f "$TARGET_RECORD" "$OBSERVATION_FILE"
set +e
PATH="$BIN_DIR:$PATH" \
PRESSLY_DRILL_PROOF_MODE=fail \
PRESSLY_DRILL_PROOF_DELAY_SECONDS="$DRILL_DELAY_SECONDS" \
PRESSLY_BACKUP_PASSPHRASE_FILE="$PASSPHRASE_FILE" \
  bash "$DRILL_SCRIPT" "$BACKUP_FILE" > "$FAILURE_OUTPUT" 2> "$FAILURE_ERROR"
failure_status="$?"
set -e
[[ "$failure_status" -eq 1 ]] || {
  sed -n '1,240p' "$FAILURE_ERROR" >&2
  fail "startup-failure drill exited $failure_status instead of 1"
}
failure_target="$(read_target_record fail)"
assert_drill_cleanup "$failure_target"
grep -F 'Restore drill container state:' "$FAILURE_ERROR" >/dev/null ||
  fail 'startup failure omitted disposable container state'
grep -F 'status=exited exitCode=23 oomKilled=false' "$FAILURE_ERROR" >/dev/null ||
  fail 'startup failure omitted exact container exit evidence'
grep -F 'pressly-proof-postgres-start-failure' "$FAILURE_ERROR" >/dev/null ||
  fail 'startup failure omitted disposable container logs'

cat "$SUCCESS_OUTPUT"
echo 'Disposable restore-drill readiness proof passed.'
echo 'Temporary PostgreSQL 18 postmaster observed before final PID 1: yes'
echo 'Actual restore waited for the final postmaster: yes'
echo 'Failure diagnostics retained before cleanup: yes'
echo 'Disposable Docker resources retained: no'
