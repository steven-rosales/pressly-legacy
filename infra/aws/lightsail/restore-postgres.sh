#!/usr/bin/env bash
set -euo pipefail
umask 077

PREFLIGHT_ONLY=false
ABORT_PRE_CUTOVER=false
case "${1:-}" in
  --preflight-only)
    PREFLIGHT_ONLY=true
    BACKUP_FILE="${2:-}"
    [[ -z "${3:-}" ]] || {
      echo 'restore-postgres.sh accepts only one backup path.' >&2
      exit 2
    }
    ;;
  --abort-pre-cutover)
    ABORT_PRE_CUTOVER=true
    BACKUP_FILE="${2:-}"
    [[ -z "${3:-}" ]] || {
      echo 'restore-postgres.sh accepts only one backup path.' >&2
      exit 2
    }
    ;;
  *)
    BACKUP_FILE="${1:-}"
    [[ -z "${2:-}" ]] || {
      echo 'restore-postgres.sh accepts only one backup path.' >&2
      exit 2
    }
    ;;
esac
APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
MIGRATION_ENV_FILE="${PRESSLY_MIGRATION_ENV_FILE:-$ENV_DIR/migration.env}"
ROLE_ENV_FILE="${PRESSLY_DATABASE_ROLES_ENV_FILE:-$ENV_DIR/database-roles.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
ROLE_SQL="${PRESSLY_DATABASE_ROLES_SQL:-$REPO_DIR/infra/postgres/configure-roles.sql}"
MIGRATION_JOURNAL="${PRESSLY_MIGRATION_JOURNAL:-$REPO_DIR/packages/db/src/migrations/meta/_journal.json}"
PASSPHRASE_FILE="${PRESSLY_BACKUP_PASSPHRASE_FILE:-$APP_ROOT/backup-passphrase.txt}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
OPERATION_LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
BACKUP_LOCK_FILE="$OPERATION_LOCK_DIR/postgres-backup.lock"
CURRENT_RELEASE_FILE="${PRESSLY_CURRENT_RELEASE_FILE:-$APP_ROOT/current-release}"
CURRENT_RELEASE_METADATA_FILE="${PRESSLY_CURRENT_RELEASE_METADATA_FILE:-$APP_ROOT/current-release.json}"
DEPLOYMENT_STATE_FILE="${PRESSLY_DEPLOYMENT_STATE_FILE:-$APP_ROOT/deployment-state.json}"
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
RESTORE_EVIDENCE_FILE="${PRESSLY_RESTORE_EVIDENCE_FILE:-$APP_ROOT/postgres-restore-last.json}"
SERVICE_FENCE_FILE="$APP_ROOT/postgres-restore-fence.compose.yml"
HOST_IDENTITY_FILE="${PRESSLY_HOST_IDENTITY_FILE:-/etc/pressly/host-identity.json}"
API_HEALTH_URL_OVERRIDE="${PRESSLY_API_HEALTH_URL:-}"
WEB_HEALTH_URL_OVERRIDE="${PRESSLY_WEB_HEALTH_URL:-}"
PROCESSOR_HEALTH_URL_OVERRIDE="${PRESSLY_PROCESSOR_HEALTH_URL:-}"
CONTROL_HEALTH_URL_OVERRIDE="${PRESSLY_CONTROL_HEALTH_URL:-}"
EXPECTED_PUBLIC_IP_OVERRIDE="${PRESSLY_EXPECTED_PUBLIC_IP:-}"
API_HEALTH_URL=''
WEB_HEALTH_URL=''
PROCESSOR_HEALTH_URL=''
CONTROL_HEALTH_URL=''
EXPECTED_PUBLIC_IP=''
PUBLIC_HEALTH_TARGET_JSON=''
HEALTH_MAX_ATTEMPTS="${PRESSLY_HEALTH_MAX_ATTEMPTS:-30}"
HEALTH_RETRY_DELAY_SECONDS="${PRESSLY_HEALTH_RETRY_DELAY_SECONDS:-2}"
HEALTH_REQUEST_TIMEOUT_SECONDS="${PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS:-10}"
RESUME_SERVICES="${PRESSLY_RESTORE_RESUME_SERVICES:-true}"
RESTORE_CONFIRM="${PRESSLY_RESTORE_CONFIRM:-}"
PROOF_MODE="${PRESSLY_RESTORE_PROOF_MODE:-false}"
PROOF_BUNDLE_MODE="${PRESSLY_RESTORE_PROOF_BUNDLE_MODE:-false}"
TEST_KILL_PHASE="${PRESSLY_RESTORE_TEST_KILL_PHASE:-}"
TEST_FAIL_ABORT_VALIDATION="${PRESSLY_RESTORE_TEST_FAIL_ABORT_VALIDATION:-false}"
TEST_FAIL_BEFORE_JOURNAL="${PRESSLY_RESTORE_TEST_FAIL_BEFORE_JOURNAL:-false}"
ALLOW_UNVERIFIED_DEPLOYMENT="${PRESSLY_RESTORE_ALLOW_UNVERIFIED_DEPLOYMENT:-false}"
OPS_BUNDLE_ORIGIN=repository-proof

usage() {
  cat <<'EOF'
Usage: restore-postgres.sh [--preflight-only|--abort-pre-cutover] /path/to/pressly-TIMESTAMP.dump.gpg

Restores a verified encrypted backup into a clean candidate database, applies
the current release migrations and database roles, validates the result, and
then promotes it while retaining the damaged database under a quarantined name.

Set PRESSLY_RESTORE_CONFIRM to the exact value printed by the script. Set
PRESSLY_RESTORE_RESUME_SERVICES=false only for a controlled drill.
EOF
}

fail() {
  echo "Postgres restore failed: $*" >&2
  exit 1
}

case "${BACKUP_FILE:-}" in
  --help|-h)
    usage
    exit 0
    ;;
esac

[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || {
  usage >&2
  exit 2
}

case "$RESUME_SERVICES" in
  true|false) ;;
  *) fail 'PRESSLY_RESTORE_RESUME_SERVICES must be true or false.' ;;
esac
case "$PROOF_MODE" in
  true|false) ;;
  *) fail 'PRESSLY_RESTORE_PROOF_MODE must be true or false.' ;;
esac
case "$PROOF_BUNDLE_MODE" in
  true|false) ;;
  *) fail 'PRESSLY_RESTORE_PROOF_BUNDLE_MODE must be true or false.' ;;
esac
if [[ "$PROOF_BUNDLE_MODE" == true && "$PROOF_MODE" != true ]]; then
  fail 'PRESSLY_RESTORE_PROOF_BUNDLE_MODE is available only in proof mode.'
fi
case "$ALLOW_UNVERIFIED_DEPLOYMENT" in
  true|false) ;;
  *) fail 'PRESSLY_RESTORE_ALLOW_UNVERIFIED_DEPLOYMENT must be true or false.' ;;
esac
case "$TEST_FAIL_ABORT_VALIDATION" in
  true|false) ;;
  *) fail 'PRESSLY_RESTORE_TEST_FAIL_ABORT_VALIDATION must be true or false.' ;;
esac
case "$TEST_FAIL_BEFORE_JOURNAL" in
  true|false) ;;
  *) fail 'PRESSLY_RESTORE_TEST_FAIL_BEFORE_JOURNAL must be true or false.' ;;
esac
[[ "$HEALTH_MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] ||
  fail 'PRESSLY_HEALTH_MAX_ATTEMPTS must be a positive integer.'
[[ "$HEALTH_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]] ||
  fail 'PRESSLY_HEALTH_RETRY_DELAY_SECONDS must be a non-negative integer.'
[[ "$HEALTH_REQUEST_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] ||
  fail 'PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS must be a positive integer.'

for command in curl docker flock getent git gpg grep python3 readlink sed sha256sum stat; do
  command -v "$command" >/dev/null || fail "$command is required."
done

RESTORE_JOURNAL_CANONICAL="$(readlink -m -- "$RESTORE_JOURNAL_FILE")"
RESTORE_EVIDENCE_CANONICAL="$(readlink -m -- "$RESTORE_EVIDENCE_FILE")"
[[ "$RESTORE_JOURNAL_FILE" == "$RESTORE_JOURNAL_CANONICAL" ]] ||
  fail 'restore journal path must be canonical and absolute.'
[[ "$RESTORE_EVIDENCE_FILE" == "$RESTORE_EVIDENCE_CANONICAL" ]] ||
  fail 'restore evidence path must be canonical and absolute.'
[[ "$RESTORE_JOURNAL_CANONICAL" != "$RESTORE_EVIDENCE_CANONICAL" ]] ||
  fail 'restore journal and completed evidence paths must be distinct.'
[[ ! -L "$RESTORE_JOURNAL_FILE" && ! -L "$RESTORE_EVIDENCE_FILE" ]] ||
  fail 'restore journal and completed evidence paths cannot be symlinks.'
if [[
  -e "$RESTORE_JOURNAL_FILE" &&
  -e "$RESTORE_EVIDENCE_FILE" &&
  "$RESTORE_JOURNAL_FILE" -ef "$RESTORE_EVIDENCE_FILE"
]]; then
  fail 'restore journal and completed evidence paths cannot share an inode.'
fi

HOST_IDENTITY_BINDINGS="$({
  python3 - "$HOST_IDENTITY_FILE" "$PROOF_MODE" <<'PY'
import ipaddress
import json
import os
import re
import stat
import sys
import urllib.parse

path, proof_mode = sys.argv[1:]
endpoint_names = ('api', 'web', 'processor', 'control')
host_pattern = re.compile(
    r'(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*'
    r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
)
identity_pattern = re.compile(r'[a-z0-9][a-z0-9._-]{2,63}')


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


try:
    absolute_path = os.path.abspath(path)
    if path != absolute_path or os.path.realpath(path) != absolute_path:
        raise ValueError('host identity path must be canonical, absolute, and symlink-free')
    parent = os.path.dirname(path)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        file_stat = os.fstat(descriptor)
        mode = stat.S_IMODE(file_stat.st_mode)
        if not stat.S_ISREG(file_stat.st_mode):
            raise ValueError('host identity must be a regular file')
        if proof_mode == 'true':
            if file_stat.st_uid != os.getuid() or mode != 0o600:
                raise ValueError('proof host identity must be owner-owned mode 0600')
        else:
            parent_stat = os.stat(parent, follow_symlinks=False)
            if (
                not stat.S_ISDIR(parent_stat.st_mode)
                or parent_stat.st_uid != 0
                or stat.S_IMODE(parent_stat.st_mode) & 0o022
            ):
                raise ValueError(
                    'host identity directory must be root-owned and not group/world writable'
                )
            if file_stat.st_uid != 0 or mode != 0o644:
                raise ValueError('host identity must be root-owned mode 0644')
        with os.fdopen(descriptor, encoding='utf-8') as handle:
            descriptor = -1
            document = json.load(handle, object_pairs_hook=unique_object)
    finally:
        if descriptor >= 0:
            os.close(descriptor)

    if not isinstance(document, dict) or set(document) != {
        'schemaVersion',
        'environment',
        'publicHealthTarget',
    }:
        raise ValueError('host identity fields are incomplete or unknown')
    expected_environment = 'proof' if proof_mode == 'true' else 'production'
    if document.get('schemaVersion') != 1 or document.get('environment') != expected_environment:
        raise ValueError('host identity schema or environment is invalid')
    target = document.get('publicHealthTarget')
    if not isinstance(target, dict) or set(target) != {
        'hostIdentity',
        'expectedPublicIpv4',
        *endpoint_names,
    }:
        raise ValueError('publicHealthTarget fields are incomplete or unknown')
    if not identity_pattern.fullmatch(target.get('hostIdentity', '')):
        raise ValueError('publicHealthTarget hostIdentity is invalid')
    try:
        address = ipaddress.ip_address(target.get('expectedPublicIpv4', ''))
    except ValueError as error:
        raise ValueError('publicHealthTarget expectedPublicIpv4 is invalid') from error
    if address.version != 4 or str(address) != target['expectedPublicIpv4']:
        raise ValueError('publicHealthTarget expectedPublicIpv4 must be canonical IPv4')

    hosts = set()
    for name in endpoint_names:
        endpoint = target.get(name)
        if not isinstance(endpoint, dict) or set(endpoint) != {'url', 'host'}:
            raise ValueError(f'publicHealthTarget {name} fields are invalid')
        url = endpoint.get('url')
        host = endpoint.get('host')
        if not isinstance(url, str) or not isinstance(host, str):
            raise ValueError(f'publicHealthTarget {name} values must be strings')
        if host_pattern.fullmatch(host) is None:
            raise ValueError(f'publicHealthTarget {name} host is invalid')
        try:
            parsed = urllib.parse.urlsplit(url)
            port = parsed.port
        except ValueError as error:
            raise ValueError(f'publicHealthTarget {name} URL is invalid') from error
        if (
            parsed.scheme != 'https'
            or parsed.netloc != host
            or parsed.hostname != host
            or port not in (None, 443)
            or not parsed.path.startswith('/')
            or parsed.query
            or parsed.fragment
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError(
                f'publicHealthTarget {name} URL is not exact HTTPS authority'
            )
        if host in hosts:
            raise ValueError('publicHealthTarget hosts must be distinct')
        hosts.add(host)

    print(json.dumps(target, sort_keys=True, separators=(',', ':')))
    print(target['expectedPublicIpv4'])
    for name in endpoint_names:
        print(target[name]['url'])
        print(target[name]['host'])
except (OSError, ValueError) as error:
    raise SystemExit(f'Host identity is invalid: {error}.') from error
PY
} 2>&1)" || fail "$HOST_IDENTITY_BINDINGS"
mapfile -t HOST_IDENTITY_FIELDS <<< "$HOST_IDENTITY_BINDINGS"
[[ "${#HOST_IDENTITY_FIELDS[@]}" == 10 ]] ||
  fail 'host identity returned an invalid binding count.'
PUBLIC_HEALTH_TARGET_JSON="${HOST_IDENTITY_FIELDS[0]}"
EXPECTED_PUBLIC_IP="${HOST_IDENTITY_FIELDS[1]}"
API_HEALTH_URL="${HOST_IDENTITY_FIELDS[2]}"
API_HEALTH_HOST="${HOST_IDENTITY_FIELDS[3]}"
WEB_HEALTH_URL="${HOST_IDENTITY_FIELDS[4]}"
WEB_HEALTH_HOST="${HOST_IDENTITY_FIELDS[5]}"
PROCESSOR_HEALTH_URL="${HOST_IDENTITY_FIELDS[6]}"
PROCESSOR_HEALTH_HOST="${HOST_IDENTITY_FIELDS[7]}"
CONTROL_HEALTH_URL="${HOST_IDENTITY_FIELDS[8]}"
CONTROL_HEALTH_HOST="${HOST_IDENTITY_FIELDS[9]}"

for binding in \
  EXPECTED_PUBLIC_IP \
  API_HEALTH_URL \
  WEB_HEALTH_URL \
  PROCESSOR_HEALTH_URL \
  CONTROL_HEALTH_URL; do
  override_name="${binding}_OVERRIDE"
  if [[ -n "${!override_name}" && "${!override_name}" != "${!binding}" ]]; then
    fail "$override_name does not match the provisioned host identity."
  fi
done

health_hostname() {
  python3 - "$1" <<'PY'
import sys
import urllib.parse

try:
    parsed = urllib.parse.urlsplit(sys.argv[1])
    port = parsed.port
except ValueError as error:
    raise SystemExit(f'invalid health URL: {error}') from error

if parsed.scheme.lower() != 'https':
    raise SystemExit('health URL must use HTTPS')
if not parsed.hostname or parsed.username is not None or parsed.password is not None:
    raise SystemExit('health URL must contain an unauthenticated hostname')
if port not in (None, 443):
    raise SystemExit('health URL must use the default HTTPS port')

print(parsed.hostname)
PY
}

preflight_public_health_hostname() {
  local application="$1"
  local url="$2"
  local hostname
  local resolved_addresses
  local address
  local expected_address_found=false
  local unexpected_address_found=false

  hostname="$(health_hostname "$url")" ||
    fail "$application health URL preflight failed: $url"
  if ! resolved_addresses="$(getent ahostsv4 "$hostname")" || \
    [[ -z "$resolved_addresses" ]]; then
    fail "$application DNS preflight failed for $hostname."
  fi
  while read -r address _; do
    if [[ "$address" == "$EXPECTED_PUBLIC_IP" ]]; then
      expected_address_found=true
    else
      unexpected_address_found=true
    fi
  done <<< "$resolved_addresses"
  if [[
    "$expected_address_found" != true ||
    "$unexpected_address_found" == true
  ]]; then
    fail "$application DNS does not resolve $hostname exclusively to the expected production IP."
  fi
}

preflight_public_health_hostnames() {
  preflight_public_health_hostname API "$API_HEALTH_URL"
  preflight_public_health_hostname Web "$WEB_HEALTH_URL"
  preflight_public_health_hostname Processor "$PROCESSOR_HEALTH_URL"
  preflight_public_health_hostname Control "$CONTROL_HEALTH_URL"
}

exec 9> "$DEPLOY_LOCK_FILE"
if ! flock -n 9; then
  echo 'Another deployment, rollback, or restore is already running.' >&2
  exit 75
fi

mkdir -p "$OPERATION_LOCK_DIR"
chmod 700 "$OPERATION_LOCK_DIR"
exec 8> "$BACKUP_LOCK_FILE"
if ! flock -n 8; then
  echo 'A Postgres backup is already running.' >&2
  exit 75
fi

for file in \
  "$COMPOSE_ENV_FILE" \
  "$POSTGRES_ENV_FILE" \
  "$MIGRATION_ENV_FILE" \
  "$ROLE_ENV_FILE" \
  "$PASSPHRASE_FILE"; do
  [[ -f "$file" ]] || fail "missing required file: $file"
  [[ "$(stat -c '%a' "$file")" == '600' ]] ||
    fail "expected a mode-600 file: $file"
done

for file in \
  "$CURRENT_RELEASE_FILE" \
  "$CURRENT_RELEASE_METADATA_FILE" \
  "$DEPLOYMENT_STATE_FILE"; do
  [[ -f "$file" ]] || fail "missing authoritative release evidence: $file"
done

for file in "$COMPOSE_FILE" "$ROLE_SQL" "$MIGRATION_JOURNAL"; do
  [[ -f "$file" ]] || fail "missing required repository file: $file"
done

CHECKSUM_FILE="$BACKUP_FILE.sha256"
METADATA_FILE="$BACKUP_FILE.json"
for file in "$CHECKSUM_FILE" "$METADATA_FILE"; do
  [[ -f "$file" ]] || fail "missing required backup evidence: $file"
done

set -a
# shellcheck disable=SC1090
source "$COMPOSE_ENV_FILE"
# shellcheck disable=SC1090
source "$POSTGRES_ENV_FILE"
# shellcheck disable=SC1090
source "$MIGRATION_ENV_FILE"
# shellcheck disable=SC1090
source "$ROLE_ENV_FILE"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PRESSLY_MIGRATION_PASSWORD:?PRESSLY_MIGRATION_PASSWORD is required}"
: "${PRESSLY_RUNTIME_PASSWORD:?PRESSLY_RUNTIME_PASSWORD is required}"
: "${PRESSLY_BACKUP_PASSWORD:?PRESSLY_BACKUP_PASSWORD is required}"

# compose.env intentionally does not persist release identity. Derive and
# overwrite every release binding from the durable metadata pair written by a
# verified deployment; never inherit image bindings from the caller's shell.
RELEASE_IDENTITY="$({
  python3 - \
    "$CURRENT_RELEASE_FILE" \
    "$CURRENT_RELEASE_METADATA_FILE" \
    "$DEPLOYMENT_STATE_FILE" \
    "$RESTORE_JOURNAL_FILE" \
    "$PROOF_MODE" \
    "$ALLOW_UNVERIFIED_DEPLOYMENT" <<'PY'
import datetime
import json
import os
import re
import sys

(
    pointer_path,
    metadata_path,
    state_path,
    restore_journal_path,
    proof_mode,
    raw_allow_unverified,
) = sys.argv[1:]
sha_pattern = re.compile(r'[0-9a-f]{40}')
image_pattern = re.compile(
    r'(ghcr\.io/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})'
)
image_fields = (
    ('apiImage', 'api'),
    ('webImage', 'web'),
    ('workerImage', 'worker'),
    ('processorImage', 'processor'),
    ('controlImage', 'control'),
)
identity_fields = {
    'releaseFormat',
    'sourceSha',
    *(field for field, _ in image_fields),
}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


def load_object(path, description):
    try:
        with open(path, encoding='utf-8') as handle:
            value = json.load(handle, object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise ValueError(f'cannot read {description}: {error}') from error
    if not isinstance(value, dict):
        raise ValueError(f'{description} must be a JSON object')
    return value


def parse_timestamp(value, description):
    if not isinstance(value, str):
        raise ValueError(f'{description} must be a UTC timestamp')
    try:
        parsed = datetime.datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')
    except ValueError as error:
        raise ValueError(f'{description} must be a real UTC timestamp') from error
    return parsed.replace(tzinfo=datetime.timezone.utc)


def identity(value):
    return tuple(value[field] for field in (
        'releaseFormat',
        'sourceSha',
        *(field for field, _ in image_fields),
    ))


def identity_object(value):
    return {
        field: value[field]
        for field in (
            'releaseFormat',
            'sourceSha',
            *(field for field, _ in image_fields),
        )
    }


def validate_identity(value, description, proof_tag):
    if not isinstance(value, dict) or set(value) != identity_fields:
        raise ValueError(f'{description} fields are incomplete or unknown')
    if value.get('releaseFormat') != 'five-image-v1':
        raise ValueError(f'{description} must use five-image-v1')
    if not sha_pattern.fullmatch(value.get('sourceSha', '')):
        raise ValueError(f'{description} sourceSha is invalid')

    repositories = set()
    digests = set()
    for field, application in image_fields:
        image = value.get(field)
        if proof_mode == 'true':
            if not isinstance(image, str) or not re.fullmatch(
                rf'pressly-restore-proof-[a-z0-9-]+-{application}:{proof_tag}',
                image,
            ):
                raise ValueError(
                    f'{description} {field} must be an isolated {application} image'
                )
            repository, digest = image, image
        else:
            match = image_pattern.fullmatch(image or '')
            if match is None:
                raise ValueError(
                    f'{description} {field} must be an immutable GHCR digest'
                )
            repository, digest = match.groups()
            repository_name = repository.rsplit('/', 1)[-1]
            if repository_name not in {application, f'pressly-{application}'}:
                raise ValueError(
                    f'{description} {field} repository does not match {application}'
                )
        if repository in repositories:
            raise ValueError('application image repositories must be distinct')
        if digest in digests:
            raise ValueError('application image digests must be distinct')
        repositories.add(repository)
        digests.add(digest)


def validate_release_record(value, description, proof_tag='proof'):
    if not isinstance(value, dict) or set(value) != identity_fields | {'deployedAt'}:
        raise ValueError(f'{description} fields are incomplete or unknown')
    validate_identity(identity_object(value), description, proof_tag)
    return parse_timestamp(value.get('deployedAt'), f'{description} deployedAt')


def validate_exit_state(value, expected_phase):
    exit_code = value.get('exitCode')
    if (
        value.get('phase') == expected_phase
        and value.get('outcome') == 'in_progress'
        and exit_code is None
    ):
        return
    if (
        value.get('phase') == expected_phase
        and value.get('outcome') == 'failed'
        and isinstance(exit_code, int)
        and not isinstance(exit_code, bool)
        and 1 <= exit_code <= 255
    ):
        return
    raise ValueError(f'{expected_phase} phase, outcome, and exitCode are inconsistent')


try:
    with open(pointer_path, encoding='utf-8') as handle:
        pointer = handle.read()
    if not re.fullmatch(r'[0-9a-f]{40}\n', pointer):
        raise ValueError('current release pointer must contain one full lowercase SHA')
    pointer = pointer[:-1]

    metadata = load_object(metadata_path, 'current release metadata')
    deployed_at = validate_release_record(metadata, 'current release metadata')
    current_identity = identity_object(metadata)

    state = load_object(state_path, 'deployment state')
    standard_state_fields = identity_fields | {
        'schemaVersion',
        'phase',
        'outcome',
        'exitCode',
        'updatedAt',
    }
    if pointer != metadata['sourceSha']:
        raise ValueError('current release pointer and metadata SHA differ')

    admission = None
    unresolved_identity = None
    unresolved_state = None
    state_is_verified = False
    if state.get('schemaVersion') == 1:
        if set(state) != standard_state_fields:
            raise ValueError('deployment state fields are incomplete or unknown')
        state_identity = identity_object(state)
        if (
            state.get('phase'),
            state.get('outcome'),
            state.get('exitCode'),
        ) == ('verified', 'succeeded', 0):
            validate_identity(state_identity, 'deployment state', 'proof')
            if identity(current_identity) != identity(state_identity):
                raise ValueError(
                    'verified deployment state does not match current release metadata'
                )
            admission = 'verified'
            state_is_verified = True

            # A power loss can occur after the restore reconciles deployment
            # state but before it retires the exact restore journal. Re-adopt
            # only that journaled schema-1 transition so a fresh process can
            # finish without losing the original unresolved evidence.
            if os.path.exists(restore_journal_path):
                journal = load_object(restore_journal_path, 'restore journal')
                journal_fields = {
                    'schemaVersion',
                    'backupBasename',
                    'backupSha256',
                    'releaseIdentity',
                    'publicHealthTarget',
                    'opsBundleOrigin',
                    'deploymentAdmission',
                    'unresolvedReleaseIdentity',
                    'unresolvedDeploymentState',
                    'targetDatabase',
                    'candidateDatabase',
                    'quarantineDatabase',
                    'resumeServices',
                    'phase',
                    'updatedAt',
                }
                journal_phase = journal.get('phase')
                journal_admission = journal.get('deploymentAdmission')
                if journal_phase in {
                    'deployment_reconciling',
                    'deployment_reconciled',
                } or (
                    journal_phase == 'public_verified'
                    and journal_admission == 'running_unverified'
                ):
                    if set(journal) != journal_fields or journal.get('schemaVersion') != 1:
                        raise ValueError('reconciliation restore journal is malformed')
                    journal_identity = journal.get('releaseIdentity')
                    validate_identity(
                        journal_identity,
                        'reconciliation restore release',
                        'proof',
                    )
                    if identity(journal_identity) != identity(current_identity):
                        raise ValueError(
                            'reconciliation restore release does not match current metadata'
                        )
                    if journal_admission != 'running_unverified':
                        raise ValueError(
                            'reconciliation restore journal admission is invalid'
                        )
                    if journal.get('opsBundleOrigin') != 'current':
                        raise ValueError(
                            'only a current operations bundle can reconcile deployment state'
                        )
                    adopted_identity = journal.get('unresolvedReleaseIdentity')
                    adopted_state = journal.get('unresolvedDeploymentState')
                    if (
                        not isinstance(adopted_state, dict)
                        or set(adopted_state) != standard_state_fields
                        or adopted_state.get('schemaVersion') != 1
                    ):
                        raise ValueError(
                            'reconciliation unresolved deployment state is malformed'
                        )
                    validate_exit_state(adopted_state, 'running_unverified')
                    parse_timestamp(
                        adopted_state.get('updatedAt'),
                        'reconciliation unresolved updatedAt',
                    )
                    if adopted_identity != identity_object(adopted_state):
                        raise ValueError(
                            'reconciliation unresolved identity and state disagree'
                        )
                    adopted_tag = (
                        'proof'
                        if adopted_identity == current_identity
                        else 'unresolved'
                    )
                    validate_identity(
                        adopted_identity,
                        'reconciliation unresolved release',
                        adopted_tag,
                    )
                    if raw_allow_unverified != 'true':
                        raise ValueError(
                            'restore reconciliation requires explicit operator admission'
                        )
                    admission = 'running_unverified'
                    unresolved_identity = adopted_identity
                    unresolved_state = adopted_state
        else:
            validate_exit_state(state, 'running_unverified')
            if raw_allow_unverified != 'true':
                raise ValueError(
                    'running_unverified recovery requires explicit operator admission'
                )
            unresolved_proof_tag = (
                'proof'
                if identity(current_identity) == identity(state_identity)
                else 'unresolved'
            )
            validate_identity(
                state_identity, 'unresolved release', unresolved_proof_tag
            )
            admission = 'running_unverified'
            unresolved_identity = state_identity
            unresolved_state = state
        updated_at = parse_timestamp(state.get('updatedAt'), 'updatedAt')
    elif state.get('schemaVersion') == 2:
        recovery_fields = {
            'schemaVersion',
            'phase',
            'outcome',
            'exitCode',
            'updatedAt',
            'unresolvedRelease',
            'recoveryTarget',
            'rollbackPrevious',
        }
        if set(state) != recovery_fields:
            raise ValueError('recovery deployment state fields are incomplete or unknown')
        validate_exit_state(state, 'recovering_unverified')
        if raw_allow_unverified != 'true':
            raise ValueError(
                'recovering_unverified recovery requires explicit operator admission'
            )
        unresolved_identity = state.get('unresolvedRelease')
        unresolved_tag = (
            'proof'
            if unresolved_identity == current_identity
            else 'unresolved'
        )
        validate_identity(unresolved_identity, 'unresolved release', unresolved_tag)
        recovery_target = state.get('recoveryTarget')
        recovery_target_tag = 'proof' if recovery_target == metadata else 'recovery'
        validate_release_record(
            recovery_target, 'recovery target', recovery_target_tag
        )
        rollback_previous = state.get('rollbackPrevious')
        if rollback_previous is not None:
            rollback_previous_tag = (
                'proof' if rollback_previous == metadata else 'recovery'
            )
            validate_release_record(
                rollback_previous,
                'rollback previous release',
                rollback_previous_tag,
            )
            if identity(rollback_previous) == identity(recovery_target):
                raise ValueError(
                    'rollback previous release and recovery target must differ'
                )
        if identity(unresolved_identity) == identity(recovery_target):
            raise ValueError('unresolved release and recovery target must differ')
        if metadata not in (recovery_target, rollback_previous):
            raise ValueError(
                'current release must exactly match recoveryTarget or rollbackPrevious'
            )
        updated_at = parse_timestamp(state.get('updatedAt'), 'updatedAt')
        admission = 'recovering_unverified'
        unresolved_state = state
    else:
        raise ValueError('deployment state schemaVersion is invalid')

    if state_is_verified and updated_at < deployed_at:
        raise ValueError('deployment state predates current release metadata')

    print(metadata['sourceSha'])
    print(*(metadata[field] for field, _ in image_fields), sep='\n')
    print(admission)
    print(
        '-'
        if unresolved_identity is None
        else json.dumps(unresolved_identity, sort_keys=True, separators=(',', ':'))
    )
    print(
        '-'
        if unresolved_state is None
        else json.dumps(unresolved_state, sort_keys=True, separators=(',', ':'))
    )
except ValueError as error:
    raise SystemExit(f'Authoritative release identity is invalid: {error}.') from error
PY
} 2>&1)" || fail "$RELEASE_IDENTITY"
mapfile -t RELEASE_BINDINGS <<< "$RELEASE_IDENTITY"
[[ "${#RELEASE_BINDINGS[@]}" == 9 ]] ||
  fail 'authoritative release identity returned an invalid binding count.'

PRESSLY_RELEASE_SHA="${RELEASE_BINDINGS[0]}"
PRESSLY_API_IMAGE="${RELEASE_BINDINGS[1]}"
PRESSLY_WEB_IMAGE="${RELEASE_BINDINGS[2]}"
PRESSLY_WORKER_IMAGE="${RELEASE_BINDINGS[3]}"
PRESSLY_PROCESSOR_IMAGE="${RELEASE_BINDINGS[4]}"
PRESSLY_CONTROL_IMAGE="${RELEASE_BINDINGS[5]}"
DEPLOYMENT_ADMISSION="${RELEASE_BINDINGS[6]}"
UNRESOLVED_RELEASE_JSON="${RELEASE_BINDINGS[7]}"
UNRESOLVED_DEPLOYMENT_STATE_JSON="${RELEASE_BINDINGS[8]}"
export \
  PRESSLY_RELEASE_SHA \
  PRESSLY_API_IMAGE \
  PRESSLY_WEB_IMAGE \
  PRESSLY_WORKER_IMAGE \
  PRESSLY_PROCESSOR_IMAGE \
  PRESSLY_CONTROL_IMAGE

validate_ops_bundle_origin() {
  local script_path
  local payload_directory
  local release_directory
  local releases_directory
  local release_marker
  local current_directory=''
  local candidate_directory=''
  local current_pointer_present=false
  local unresolved_sha=''

  script_path="$(readlink -f "${BASH_SOURCE[0]}")"
  payload_directory="$(dirname "$script_path")"
  release_directory="$(dirname "$payload_directory")"
  releases_directory="$(readlink -m "$OPS_ROOT/releases")"
  [[ "$(basename "$payload_directory")" == payload ]] ||
    fail 'production restore must run through an active checksummed operations bundle.'
  [[ "$release_directory" == "$releases_directory/"* ]] ||
    fail 'restore payload is outside the configured operations releases directory.'
  [[ -f "$release_directory/source-sha" ]] ||
    fail 'operations bundle source marker is missing.'
  release_marker="$(< "$release_directory/source-sha")"
  [[ "$release_marker" =~ ^[0-9a-f]{40}$ ]] ||
    fail 'operations bundle source marker is invalid.'
  [[ "$(stat -c '%s' "$release_directory/source-sha")" == 41 ]] ||
    fail 'operations bundle source marker is not canonical.'
  [[ "$(basename "$release_directory")" == "$release_marker" ]] ||
    fail 'operations bundle directory and source marker disagree.'
  [[ -f "$release_directory/SHA256SUMS" ]] ||
    fail 'operations bundle checksum manifest is missing.'
  (cd "$release_directory" && sha256sum --check --strict --status SHA256SUMS) ||
    fail 'operations bundle checksum verification failed.'

  if [[ -e "$OPS_ROOT/current" || -L "$OPS_ROOT/current" ]]; then
    current_pointer_present=true
    current_directory="$(readlink -f "$OPS_ROOT/current" 2>/dev/null || true)"
    [[ -n "$current_directory" ]] ||
      fail 'current operations bundle pointer is dangling or unreadable.'
  fi
  if [[ -e "$OPS_ROOT/candidate" || -L "$OPS_ROOT/candidate" ]]; then
    candidate_directory="$(readlink -f "$OPS_ROOT/candidate" 2>/dev/null || true)"
  fi

  if [[ "$release_directory" == "$current_directory" ]]; then
    OPS_BUNDLE_ORIGIN=current
    return
  fi

  [[ "$release_directory" == "$candidate_directory" ]] ||
    fail 'restore payload is neither the active current nor candidate operations bundle.'
  if [[ "$current_pointer_present" == true ]]; then
    fail 'candidate recovery is forbidden while a hardened current operations bundle exists.'
  fi
  [[ "$DEPLOYMENT_ADMISSION" != verified ]] ||
    fail 'candidate recovery requires an unresolved deployment state.'
  unresolved_sha="$({
    python3 - "$UNRESOLVED_RELEASE_JSON" <<'PY'
import json
import re
import sys

value = json.loads(sys.argv[1])
source_sha = value.get('sourceSha') if isinstance(value, dict) else None
if not isinstance(source_sha, str) or re.fullmatch(r'[0-9a-f]{40}', source_sha) is None:
    raise SystemExit('unresolved source SHA is invalid')
print(source_sha)
PY
  } 2>&1)" || fail "candidate operations bundle cannot bind unresolved deployment identity: $unresolved_sha"
  [[ "$release_marker" == "$unresolved_sha" ]] ||
    fail 'candidate operations bundle source SHA does not match the unresolved deployment identity.'
  OPS_BUNDLE_ORIGIN=candidate
}

if [[ "$PROOF_MODE" != true || "$PROOF_BUNDLE_MODE" == true ]]; then
  validate_ops_bundle_origin
fi

[[ "$PRESSLY_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
  fail 'PRESSLY_RELEASE_SHA must be a full lowercase source SHA.'
CHECKOUT_SHA="$(git -C "$REPO_DIR" rev-parse HEAD)"
[[ "$CHECKOUT_SHA" == "$PRESSLY_RELEASE_SHA" ]] ||
  fail "repository checkout is $CHECKOUT_SHA; release is $PRESSLY_RELEASE_SHA."

MIGRATION_DIR="$(dirname "$MIGRATION_JOURNAL")"
for tracked_path in "$COMPOSE_FILE" "$ROLE_SQL" "$MIGRATION_JOURNAL"; do
  git -C "$REPO_DIR" ls-files --error-unmatch "$tracked_path" >/dev/null 2>&1 ||
    fail "recovery input is not tracked by the approved release: $tracked_path"
done
RECOVERY_INPUT_CHANGES="$({
  git -C "$REPO_DIR" status --porcelain --untracked-files=all -- \
    "$COMPOSE_FILE" \
    "$ROLE_SQL" \
    "$MIGRATION_DIR"
})"
[[ -z "$RECOVERY_INPUT_CHANGES" ]] || {
  echo "$RECOVERY_INPUT_CHANGES" >&2
  fail 'compose, role, and migration recovery inputs must match the approved release exactly.'
}

if [[ "$PROOF_MODE" == true ]]; then
  [[ "$RESUME_SERVICES" == false ]] ||
    fail 'proof mode requires PRESSLY_RESTORE_RESUME_SERVICES=false.'
  [[ "${COMPOSE_PROJECT_NAME:-}" =~ ^pressly-restore-proof-[a-z0-9-]+$ ]] ||
    fail 'proof mode requires an isolated pressly-restore-proof-* Compose project.'
  case "$TEST_KILL_PHASE" in
    ''|after_preparing|after_candidate_ready|after_abort_journal|after_abort_candidate_drop|before_public_verification|after_public_verified|after_target_rename|after_candidate_rename) ;;
    *) fail 'the restore proof kill phase is invalid.' ;;
  esac
else
  [[ -z "$TEST_KILL_PHASE" ]] ||
    fail 'restore kill hooks are available only in isolated proof mode.'
  [[ "$TEST_FAIL_ABORT_VALIDATION" == false ]] ||
    fail 'restore failure hooks are available only in isolated proof mode.'
  [[ "$TEST_FAIL_BEFORE_JOURNAL" == false ]] ||
    fail 'restore failure hooks are available only in isolated proof mode.'
  if [[ "$ABORT_PRE_CUTOVER" == true && "$RESUME_SERVICES" != true ]]; then
    fail 'production pre-cutover abort must resume and health-check services.'
  fi
  declare -A seen_images=()
  declare -A seen_digests=()
  for binding in \
    PRESSLY_API_IMAGE \
    PRESSLY_WEB_IMAGE \
    PRESSLY_WORKER_IMAGE \
    PRESSLY_PROCESSOR_IMAGE \
    PRESSLY_CONTROL_IMAGE; do
    image="${!binding}"
    [[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] ||
      fail "$binding must be an immutable digest reference."
    application="${binding#PRESSLY_}"
    application="${application%_IMAGE}"
    application="${application,,}"
    repository="${image%@sha256:*}"
    repository_name="${repository##*/}"
    digest="${image##*@}"
    if [[ "$repository_name" != "$application" && "$repository_name" != "pressly-$application" ]]; then
      fail "$binding points at $repository_name; expected the $application repository."
    fi
    [[ -z "${seen_images[$image]:-}" ]] ||
      fail "application image is reused across release bindings: $image"
    [[ -z "${seen_digests[$digest]:-}" ]] ||
      fail "application image digest is reused across release bindings: $digest"
    seen_images[$image]=true
    seen_digests[$digest]=true
    docker image inspect "$image" >/dev/null || fail "release image is not local: $image"
    revision="$(
      docker image inspect \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
        "$image"
    )"
    [[ "$revision" == "$PRESSLY_RELEASE_SHA" ]] ||
      fail "$binding was built from $revision; expected $PRESSLY_RELEASE_SHA."
  done
fi

[[ "$POSTGRES_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]] ||
  fail 'POSTGRES_DB must be a valid PostgreSQL identifier.'
case "$POSTGRES_DB" in
  postgres|template0|template1)
    fail "refusing to replace system database: $POSTGRES_DB"
    ;;
esac

BACKUP_BASENAME="$(basename "$BACKUP_FILE")"
[[ "$BACKUP_BASENAME" =~ ^pressly-[0-9]{8}T[0-9]{6}Z\.dump\.gpg$ ]] ||
  fail 'backup name must match pressly-YYYYMMDDTHHMMSSZ.dump.gpg.'
if [[ "$ABORT_PRE_CUTOVER" == true ]]; then
  EXPECTED_CONFIRM="ABORT:$POSTGRES_DB:$BACKUP_BASENAME"
else
  EXPECTED_CONFIRM="$POSTGRES_DB:$BACKUP_BASENAME"
fi
if [[ "$RESTORE_CONFIRM" != "$EXPECTED_CONFIRM" ]]; then
  echo 'Restore confirmation is absent or incorrect.' >&2
  echo "Re-run with: PRESSLY_RESTORE_CONFIRM='$EXPECTED_CONFIRM'" >&2
  exit 2
fi

(cd "$(dirname "$BACKUP_FILE")" && sha256sum --check "$(basename "$CHECKSUM_FILE")")
CHECKSUM_BASENAME="$(sed -n '1s/^[0-9a-f]\{64\}[[:space:]]\+//p' "$CHECKSUM_FILE")"
[[ "$CHECKSUM_BASENAME" == "$BACKUP_BASENAME" ]] ||
  fail 'backup checksum evidence names a different object.'
BACKUP_CHECKSUM="$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)"
BACKUP_SIZE="$(stat -c '%s' "$BACKUP_FILE")"
METADATA_CHECKSUM="$(sed -n 's/.*"sha256":"\([0-9a-f]\{64\}\)".*/\1/p' "$METADATA_FILE")"
METADATA_SIZE="$(sed -n 's/.*"sizeBytes":\([0-9][0-9]*\).*/\1/p' "$METADATA_FILE")"
[[ "$METADATA_CHECKSUM" == "$BACKUP_CHECKSUM" ]] ||
  fail 'backup metadata checksum does not match the encrypted object.'
[[ "$METADATA_SIZE" == "$BACKUP_SIZE" ]] ||
  fail 'backup metadata size does not match the encrypted object.'

EXPECTED_MIGRATION_COUNT="$(grep -c '"tag":' "$MIGRATION_JOURNAL")"
EXPECTED_MIGRATION_TIMESTAMP="$(
  grep '"when":' "$MIGRATION_JOURNAL" | tail -n 1 | sed 's/[^0-9]//g'
)"
[[ "$EXPECTED_MIGRATION_COUNT" =~ ^[1-9][0-9]*$ ]] ||
  fail 'could not derive the expected migration count.'
[[ "$EXPECTED_MIGRATION_TIMESTAMP" =~ ^[1-9][0-9]*$ ]] ||
  fail 'could not derive the latest migration timestamp.'

case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) fail 'DATABASE_URL must be a PostgreSQL URI for recovery.' ;;
esac

if [[ "$PREFLIGHT_ONLY" == true ]]; then
  echo "Postgres restore preflight passed for $BACKUP_BASENAME."
  echo "Release admission: $DEPLOYMENT_ADMISSION"
  exit 0
fi

database_url_for() {
  local database="$1"
  local url_without_query="$DATABASE_URL"
  local query=''
  if [[ "$DATABASE_URL" == *\?* ]]; then
    url_without_query="${DATABASE_URL%%\?*}"
    query="?${DATABASE_URL#*\?}"
  fi
  printf '%s/%s%s' "${url_without_query%/*}" "$database" "$query"
}

restore_journal_operation() {
  local action="$1"
  local phase="$2"
  local candidate_database="$3"
  local quarantine_database="$4"

  python3 - \
    "$RESTORE_JOURNAL_FILE" \
    "$RESTORE_EVIDENCE_FILE" \
    "$action" \
    "$BACKUP_BASENAME" \
    "$BACKUP_CHECKSUM" \
    "$PRESSLY_RELEASE_SHA" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$PRESSLY_WORKER_IMAGE" \
    "$PRESSLY_PROCESSOR_IMAGE" \
    "$PRESSLY_CONTROL_IMAGE" \
    "$PUBLIC_HEALTH_TARGET_JSON" \
    "$OPS_BUNDLE_ORIGIN" \
    "$DEPLOYMENT_ADMISSION" \
    "$UNRESOLVED_RELEASE_JSON" \
    "$UNRESOLVED_DEPLOYMENT_STATE_JSON" \
    "$POSTGRES_DB" \
    "$candidate_database" \
    "$quarantine_database" \
    "$RESUME_SERVICES" \
    "$ABORT_PRE_CUTOVER" \
    "$phase" <<'PY'
import datetime
import ipaddress
import json
import os
import re
import sys
import tempfile
import urllib.parse

(
    path,
    evidence_path,
    action,
    backup_basename,
    backup_checksum,
    source_sha,
    api_image,
    web_image,
    worker_image,
    processor_image,
    control_image,
    raw_public_health_target,
    ops_bundle_origin,
    deployment_admission,
    raw_unresolved_identity,
    raw_unresolved_state,
    target_database,
    proposed_candidate,
    proposed_quarantine,
    raw_resume_services,
    raw_abort_mode,
    requested_phase,
) = sys.argv[1:]

phases = (
    'preparing',
    'candidate_ready',
    'target_quarantined',
    'candidate_promoted',
    'validated',
    'deployment_reconciling',
    'deployment_reconciled',
    'public_verified',
    'aborting',
)
allowed_transitions = {
    'preparing': {'preparing', 'candidate_ready', 'aborting'},
    'candidate_ready': {'candidate_ready', 'target_quarantined', 'aborting'},
    'target_quarantined': {'target_quarantined', 'candidate_promoted'},
    'candidate_promoted': {'candidate_promoted', 'validated'},
    'validated': {'validated', 'deployment_reconciling', 'public_verified'},
    'deployment_reconciling': {
        'deployment_reconciling',
        'deployment_reconciled',
    },
    'deployment_reconciled': {'deployment_reconciled', 'public_verified'},
    'public_verified': {'public_verified'},
    'aborting': {'aborting'},
}
expected_fields = {
    'schemaVersion',
    'backupBasename',
    'backupSha256',
    'releaseIdentity',
    'publicHealthTarget',
    'opsBundleOrigin',
    'deploymentAdmission',
    'unresolvedReleaseIdentity',
    'unresolvedDeploymentState',
    'targetDatabase',
    'candidateDatabase',
    'quarantineDatabase',
    'resumeServices',
    'phase',
    'updatedAt',
}
identity = {
    'releaseFormat': 'five-image-v1',
    'sourceSha': source_sha,
    'apiImage': api_image,
    'webImage': web_image,
    'workerImage': worker_image,
    'processorImage': processor_image,
    'controlImage': control_image,
}
identity_fields = set(identity)
identifier_pattern = re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,62}')
endpoint_names = ('api', 'web', 'processor', 'control')

def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


def validate_public_health_target(value):
    if not isinstance(value, dict) or set(value) != {
        'hostIdentity',
        'expectedPublicIpv4',
        *endpoint_names,
    }:
        raise ValueError('publicHealthTarget fields are invalid')
    try:
        address = ipaddress.ip_address(value.get('expectedPublicIpv4', ''))
    except ValueError as error:
        raise ValueError('publicHealthTarget IPv4 address is invalid') from error
    if address.version != 4 or str(address) != value['expectedPublicIpv4']:
        raise ValueError('publicHealthTarget IPv4 address is not canonical')
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,63}', value.get('hostIdentity', '')):
        raise ValueError('publicHealthTarget host identity is invalid')
    hosts = set()
    for name in endpoint_names:
        endpoint = value.get(name)
        if not isinstance(endpoint, dict) or set(endpoint) != {'url', 'host'}:
            raise ValueError(f'publicHealthTarget {name} is invalid')
        url = endpoint.get('url')
        host = endpoint.get('host')
        if not isinstance(url, str) or not isinstance(host, str):
            raise ValueError(f'publicHealthTarget {name} values are invalid')
        try:
            parsed = urllib.parse.urlsplit(url)
        except ValueError as error:
            raise ValueError(f'publicHealthTarget {name} URL is invalid') from error
        if (
            parsed.scheme != 'https'
            or parsed.netloc != host
            or parsed.hostname != host
            or not parsed.path.startswith('/')
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(f'publicHealthTarget {name} authority is invalid')
        if host in hosts:
            raise ValueError('publicHealthTarget hosts are not distinct')
        hosts.add(host)
    return value


try:
    public_health_target = validate_public_health_target(
        json.loads(raw_public_health_target, object_pairs_hook=unique_object)
    )
except (TypeError, ValueError) as error:
    raise SystemExit('Restore journal public health target is invalid.') from error


if deployment_admission not in {
    'verified',
    'running_unverified',
    'recovering_unverified',
}:
    raise SystemExit('Restore journal deployment admission is invalid.')
if ops_bundle_origin not in {'current', 'candidate', 'repository-proof'}:
    raise SystemExit('Restore journal operations bundle origin is invalid.')
if raw_unresolved_identity == '-':
    unresolved_identity = None
else:
    try:
        unresolved_identity = json.loads(
            raw_unresolved_identity, object_pairs_hook=unique_object
        )
    except (TypeError, ValueError) as error:
        raise SystemExit('Restore journal unresolved identity is invalid.') from error
    if not isinstance(unresolved_identity, dict) or set(unresolved_identity) != identity_fields:
        raise SystemExit('Restore journal unresolved identity fields are invalid.')
if (deployment_admission == 'verified') != (unresolved_identity is None):
    raise SystemExit('Restore journal admission and unresolved identity disagree.')
if raw_unresolved_state == '-':
    unresolved_state = None
else:
    try:
        unresolved_state = json.loads(
            raw_unresolved_state, object_pairs_hook=unique_object
        )
    except (TypeError, ValueError) as error:
        raise SystemExit('Restore journal unresolved state is invalid.') from error
    if not isinstance(unresolved_state, dict):
        raise SystemExit('Restore journal unresolved state must be an object.')
if (deployment_admission == 'verified') != (unresolved_state is None):
    raise SystemExit('Restore journal admission and unresolved state disagree.')


def load():
    try:
        with open(path, encoding='utf-8') as handle:
            value = json.load(handle, object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise ValueError(f'cannot read restore journal: {error}') from error
    if not isinstance(value, dict) or set(value) != expected_fields:
        raise ValueError('restore journal fields are incomplete or unknown')
    if value.get('schemaVersion') != 1:
        raise ValueError('restore journal schemaVersion is invalid')
    stored_identity = value.get('releaseIdentity')
    if not isinstance(stored_identity, dict) or set(stored_identity) != identity_fields:
        raise ValueError('restore journal release identity is invalid')
    validate_public_health_target(value.get('publicHealthTarget'))
    stored_unresolved = value.get('unresolvedReleaseIdentity')
    if stored_unresolved is not None and (
        not isinstance(stored_unresolved, dict)
        or set(stored_unresolved) != identity_fields
    ):
        raise ValueError('restore journal unresolved release identity is invalid')
    stored_unresolved_state = value.get('unresolvedDeploymentState')
    if stored_unresolved_state is not None and not isinstance(
        stored_unresolved_state, dict
    ):
        raise ValueError('restore journal unresolved deployment state is invalid')
    if value.get('deploymentAdmission') not in {
        'verified',
        'running_unverified',
        'recovering_unverified',
    }:
        raise ValueError('restore journal deployment admission is invalid')
    if value.get('opsBundleOrigin') not in {
        'current',
        'candidate',
        'repository-proof',
    }:
        raise ValueError('restore journal operations bundle origin is invalid')
    if (value['deploymentAdmission'] == 'verified') != (stored_unresolved is None):
        raise ValueError('restore journal admission and unresolved identity disagree')
    if (value['deploymentAdmission'] == 'verified') != (stored_unresolved_state is None):
        raise ValueError('restore journal admission and unresolved state disagree')
    if value.get('phase') not in phases:
        raise ValueError('restore journal phase is invalid')
    if not isinstance(value.get('resumeServices'), bool):
        raise ValueError('restore journal resumeServices is invalid')
    for field in ('targetDatabase', 'candidateDatabase', 'quarantineDatabase'):
        if not identifier_pattern.fullmatch(value.get(field, '')):
            raise ValueError(f'restore journal {field} is invalid')
    if len({
        value['targetDatabase'],
        value['candidateDatabase'],
        value['quarantineDatabase'],
    }) != 3:
        raise ValueError('restore journal database names must be distinct')
    recovery_prefix = value['targetDatabase'][:24]
    if not re.fullmatch(
        rf'{re.escape(recovery_prefix)}_restore_[0-9]{{14}}_[0-9]+',
        value['candidateDatabase'],
    ):
        raise ValueError('restore journal candidateDatabase is not recovery-owned')
    if not re.fullmatch(
        rf'{re.escape(recovery_prefix)}_damaged_[0-9]{{14}}_[0-9]+',
        value['quarantineDatabase'],
    ):
        raise ValueError('restore journal quarantineDatabase is not recovery-owned')
    try:
        timestamp = datetime.datetime.strptime(
            value.get('updatedAt', ''), '%Y-%m-%dT%H:%M:%SZ'
        )
    except (TypeError, ValueError) as error:
        raise ValueError('restore journal updatedAt is invalid') from error
    if timestamp.strftime('%Y-%m-%dT%H:%M:%SZ') != value['updatedAt']:
        raise ValueError('restore journal updatedAt is not canonical')
    return value


def validate_invocation(value):
    expected = {
        'backupBasename': backup_basename,
        'backupSha256': backup_checksum,
        'releaseIdentity': identity,
        'publicHealthTarget': public_health_target,
        'opsBundleOrigin': ops_bundle_origin,
        'deploymentAdmission': deployment_admission,
        'unresolvedReleaseIdentity': unresolved_identity,
        'unresolvedDeploymentState': unresolved_state,
        'targetDatabase': target_database,
        'resumeServices': raw_resume_services == 'true',
    }
    for field, expected_value in expected.items():
        if value.get(field) != expected_value:
            if (
                field == 'resumeServices'
                and raw_abort_mode == 'true'
                and expected_value is True
                and value.get(field) is False
            ):
                continue
            raise ValueError(
                f'restore journal {field} does not match this invocation'
            )


def install(value, destination=path):
    directory = os.path.dirname(os.path.abspath(destination))
    os.makedirs(directory, mode=0o700, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(
        dir=directory, prefix=f'.{os.path.basename(destination)}.tmp.'
    )
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, destination)
        directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise


def current_timestamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime(
        '%Y-%m-%dT%H:%M:%SZ'
    )


try:
    if action == 'start':
        if os.path.exists(path):
            journal = load()
            validate_invocation(journal)
        else:
            for name in (target_database, proposed_candidate, proposed_quarantine):
                if not identifier_pattern.fullmatch(name):
                    raise ValueError('proposed restore database name is invalid')
            if len({target_database, proposed_candidate, proposed_quarantine}) != 3:
                raise ValueError('proposed restore database names must be distinct')
            journal = {
                'schemaVersion': 1,
                'backupBasename': backup_basename,
                'backupSha256': backup_checksum,
                'releaseIdentity': identity,
                'publicHealthTarget': public_health_target,
                'opsBundleOrigin': ops_bundle_origin,
                'deploymentAdmission': deployment_admission,
                'unresolvedReleaseIdentity': unresolved_identity,
                'unresolvedDeploymentState': unresolved_state,
                'targetDatabase': target_database,
                'candidateDatabase': proposed_candidate,
                'quarantineDatabase': proposed_quarantine,
                'resumeServices': raw_resume_services == 'true',
                'phase': 'preparing',
                'updatedAt': current_timestamp(),
            }
            install(journal)
    elif action == 'write':
        if requested_phase not in phases:
            raise ValueError('requested restore journal phase is invalid')
        journal = load()
        validate_invocation(journal)
        if journal['candidateDatabase'] != proposed_candidate or journal['quarantineDatabase'] != proposed_quarantine:
            raise ValueError('restore journal database identity changed')
        if requested_phase not in allowed_transitions[journal['phase']]:
            raise ValueError('restore journal phase transition is invalid')
        if (
            requested_phase == 'aborting'
            and raw_abort_mode == 'true'
            and raw_resume_services == 'true'
        ):
            journal['resumeServices'] = True
        journal['phase'] = requested_phase
        journal['updatedAt'] = current_timestamp()
        install(journal)
    elif action == 'abort':
        journal = load()
        validate_invocation(journal)
        if journal['candidateDatabase'] != proposed_candidate or journal['quarantineDatabase'] != proposed_quarantine:
            raise ValueError('restore journal database identity changed')
        if journal['phase'] != 'aborting':
            raise ValueError('cannot retire an abort before target validation')
        install(journal, evidence_path)
        directory = os.path.dirname(os.path.abspath(path))
        os.unlink(path)
        directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
        raise SystemExit(0)
    elif action == 'remove':
        journal = load()
        validate_invocation(journal)
        if journal['candidateDatabase'] != proposed_candidate or journal['quarantineDatabase'] != proposed_quarantine:
            raise ValueError('restore journal database identity changed')
        expected_final_phase = (
            'public_verified'
            if journal['resumeServices']
            else 'validated'
        )
        if journal['phase'] != expected_final_phase:
            raise ValueError(
                f'cannot remove restore journal from {journal["phase"]}'
            )
        install(journal, evidence_path)
        directory = os.path.dirname(os.path.abspath(path))
        os.unlink(path)
        directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
        raise SystemExit(0)
    else:
        raise ValueError('restore journal operation is invalid')

    print(journal['phase'])
    print(journal['candidateDatabase'])
    print(journal['quarantineDatabase'])
except ValueError as error:
    raise SystemExit(f'Restore journal rejected: {error}.') from error
PY
}

write_restore_phase() {
  local phase="$1"
  restore_journal_operation \
    write \
    "$phase" \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE" \
    >/dev/null
  RESTORE_PHASE="$phase"
}

proof_kill_after() {
  local phase="$1"
  if [[ "$PROOF_MODE" == true && "$TEST_KILL_PHASE" == "$phase" ]]; then
    echo "[restore-proof] simulating power loss at $phase." >&2
    kill -KILL "$$"
  fi
}

wait_for_public_health() {
  local application="$1"
  local url="$2"
  local attempt
  local hostname
  local http_status

  hostname="$(health_hostname "$url")" ||
    fail "$application health URL is invalid: $url"

  for ((attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt += 1)); do
    http_status=""
    if http_status="$(
      curl \
        --silent \
        --show-error \
        --max-time "$HEALTH_REQUEST_TIMEOUT_SECONDS" \
        --output /dev/null \
        --write-out '%{http_code}' \
        --resolve "$hostname:443:$EXPECTED_PUBLIC_IP" \
        "$url"
    )" && [[ "$http_status" =~ ^2[0-9]{2}$ ]]; then
      echo "$application public health passed after $attempt attempt(s)."
      return 0
    fi
    if ((attempt < HEALTH_MAX_ATTEMPTS)); then
      sleep "$HEALTH_RETRY_DELAY_SECONDS"
    fi
  done
  fail "$application public health failed after $HEALTH_MAX_ATTEMPTS attempts."
}

reconcile_schema1_deployment_state() {
  python3 - \
    "$CURRENT_RELEASE_METADATA_FILE" \
    "$DEPLOYMENT_STATE_FILE" \
    "$UNRESOLVED_DEPLOYMENT_STATE_JSON" <<'PY'
import datetime
import json
import os
import sys
import tempfile

metadata_path, state_path, raw_unresolved_state = sys.argv[1:]
identity_fields = {
    'releaseFormat',
    'sourceSha',
    'apiImage',
    'webImage',
    'workerImage',
    'processorImage',
    'controlImage',
}
state_fields = identity_fields | {
    'schemaVersion',
    'phase',
    'outcome',
    'exitCode',
    'updatedAt',
}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


def load(path):
    with open(path, encoding='utf-8') as handle:
        value = json.load(handle, object_pairs_hook=unique_object)
    if not isinstance(value, dict):
        raise ValueError(f'{path} must contain a JSON object')
    return value


def identity(value):
    return {field: value[field] for field in identity_fields}


try:
    metadata = load(metadata_path)
    state = load(state_path)
    unresolved_state = json.loads(
        raw_unresolved_state, object_pairs_hook=unique_object
    )
    if not isinstance(unresolved_state, dict) or set(unresolved_state) != state_fields:
        raise ValueError('journaled unresolved deployment state is malformed')
    if set(metadata) != identity_fields | {'deployedAt'}:
        raise ValueError('current release metadata is malformed')

    already_verified = (
        set(state) == state_fields
        and state.get('schemaVersion') == 1
        and state.get('phase') == 'verified'
        and state.get('outcome') == 'succeeded'
        and state.get('exitCode') == 0
        and identity(state) == identity(metadata)
    )
    if already_verified:
        raise SystemExit(0)
    if state != unresolved_state:
        raise ValueError(
            'deployment state changed after restore admission; refusing reconciliation'
        )

    reconciled = {
        'schemaVersion': 1,
        **identity(metadata),
        'phase': 'verified',
        'outcome': 'succeeded',
        'exitCode': 0,
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).strftime(
            '%Y-%m-%dT%H:%M:%SZ'
        ),
    }
    directory = os.path.dirname(os.path.abspath(state_path))
    descriptor, temporary_path = tempfile.mkstemp(
        dir=directory, prefix=f'.{os.path.basename(state_path)}.tmp.'
    )
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(reconciled, handle, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, state_path)
        directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
except (OSError, ValueError) as error:
    raise SystemExit(f'Deployment-state reconciliation failed: {error}.') from error
PY
}

export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"
export PRESSLY_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE"

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

fenced_compose() {
  docker compose \
    --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    -f "$SERVICE_FENCE_FILE" \
    "$@"
}

ensure_service_fence() {
  python3 - "$SERVICE_FENCE_FILE" <<'PY'
import os
import stat
import sys
import tempfile

path = sys.argv[1]
content = b'''services:
  api:
    restart: "no"
  worker:
    restart: "no"
  caddy:
    restart: "no"
'''
directory = os.path.dirname(os.path.abspath(path))
os.makedirs(directory, mode=0o700, exist_ok=True)

if os.path.lexists(path):
    mode = os.lstat(path).st_mode
    if not stat.S_ISREG(mode) or stat.S_IMODE(mode) != 0o600:
        raise SystemExit('existing recovery service fence is not a mode-600 regular file')
    with open(path, 'rb') as handle:
        if handle.read() != content:
            raise SystemExit('existing recovery service fence has unexpected content')
else:
    descriptor, temporary_path = tempfile.mkstemp(
        dir=directory, prefix=f'.{os.path.basename(path)}.tmp.'
    )
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
PY
}

fence_existing_service_restart_policies() {
  local service
  local container_id

  for service in api worker caddy; do
    container_id="$(compose ps -aq "$service")"
    if [[ -n "$container_id" ]]; then
      docker update --restart=no "$container_id" >/dev/null
    fi
  done
}

lift_service_fence() {
  local service
  local container_id
  local policy

  for service in api worker caddy; do
    container_id="$(compose ps -q "$service")"
    [[ -n "$container_id" ]] ||
      fail "cannot lift the recovery fence without a running $service container."
    docker update --restart=unless-stopped "$container_id" >/dev/null
    policy="$(
      docker inspect \
        --format '{{.HostConfig.RestartPolicy.Name}}' \
        "$container_id"
    )"
    [[ "$policy" == unless-stopped ]] ||
      fail "$service restart policy remains $policy after recovery."
  done
}

remove_service_fence() {
  python3 - "$SERVICE_FENCE_FILE" <<'PY'
import os
import sys

path = sys.argv[1]
try:
    os.unlink(path)
except FileNotFoundError:
    raise SystemExit('recovery service fence disappeared before retirement')
directory = os.path.dirname(os.path.abspath(path))
descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
}

postgres_exec() {
  compose exec -T postgres "$@"
}

postgres_scalar() {
  local database="$1"
  local sql="$2"
  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database" -Atc "$sql"
}

configure_roles() {
  local database="$1"
  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$database" \
    -v database_name="$database" \
    -v migration_password="$PRESSLY_MIGRATION_PASSWORD" \
    -v runtime_password="$PRESSLY_RUNTIME_PASSWORD" \
    -v backup_password="$PRESSLY_BACKUP_PASSWORD" \
    -f - < "$ROLE_SQL"
}

tool_psql() {
  local database="$1"
  local user="$2"
  local password="$3"
  shift 3
  compose --profile tools run --rm -T \
    -e PGHOST=postgres \
    -e PGPORT=5432 \
    -e PGDATABASE="$database" \
    -e PGUSER="$user" \
    -e PGPASSWORD="$password" \
    restore psql -v ON_ERROR_STOP=1 "$@"
}

validate_database() {
  local database="$1"
  local summary
  local current_database
  local public_tables
  local identity_present
  local drizzle_present
  local migration_count
  local latest_migration
  local wrong_schema_owners
  local wrong_relation_owners
  local wrong_function_owners
  local wrong_extension_owners
  local runtime_can_create

  summary="$(postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$database" \
    -AtF '|' <<'SQL'
SELECT
  current_database(),
  (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'),
  to_regclass('public.auth_identities') IS NOT NULL,
  to_regclass('drizzle.__drizzle_migrations') IS NOT NULL,
  (SELECT count(*) FROM drizzle.__drizzle_migrations),
  (SELECT max(created_at) FROM drizzle.__drizzle_migrations),
  (
    SELECT count(*)
    FROM pg_namespace
    WHERE nspname IN ('public', 'drizzle')
      AND pg_get_userbyid(nspowner) <> 'pressly_migration'
  ),
  (
    SELECT count(*)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname IN ('public', 'drizzle')
      AND relation.relkind IN ('r', 'p', 'S', 'v', 'm')
      AND pg_get_userbyid(relation.relowner) <> 'pressly_migration'
  ),
  (
    SELECT count(*)
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'drizzle')
      AND pg_get_userbyid(procedure.proowner) <> 'pressly_migration'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = procedure.oid
          AND dependency.deptype = 'e'
      )
  ),
  (
    SELECT count(*)
    FROM pg_extension
    WHERE extname = 'btree_gist'
      AND pg_get_userbyid(extowner) <> 'pressly_migration'
  ),
  has_schema_privilege('pressly_runtime', 'public', 'CREATE');
SQL
)"

  IFS='|' read -r \
    current_database \
    public_tables \
    identity_present \
    drizzle_present \
    migration_count \
    latest_migration \
    wrong_schema_owners \
    wrong_relation_owners \
    wrong_function_owners \
    wrong_extension_owners \
    runtime_can_create <<< "$summary"

  [[ "$current_database" == "$database" ]] ||
    fail "validated $current_database instead of $database."
  [[ "$public_tables" =~ ^[1-9][0-9]*$ ]] ||
    fail 'the restored public schema has no tables.'
  [[ "$identity_present" == 't' ]] || fail 'auth_identities is missing.'
  [[ "$drizzle_present" == 't' ]] || fail 'the Drizzle ledger is missing.'
  [[ "$migration_count" == "$EXPECTED_MIGRATION_COUNT" ]] ||
    fail "migration count is $migration_count; expected $EXPECTED_MIGRATION_COUNT."
  [[ "$latest_migration" == "$EXPECTED_MIGRATION_TIMESTAMP" ]] ||
    fail "latest migration is $latest_migration; expected $EXPECTED_MIGRATION_TIMESTAMP."
  [[ "$wrong_schema_owners" == '0' ]] || fail 'a restored schema has the wrong owner.'
  [[ "$wrong_relation_owners" == '0' ]] || fail 'a restored relation has the wrong owner.'
  [[ "$wrong_function_owners" == '0' ]] || fail 'a restored function has the wrong owner.'
  [[ "$wrong_extension_owners" == '0' ]] || fail 'a restored extension has the wrong owner.'
  [[ "$runtime_can_create" == 'f' ]] || fail 'the runtime role can create schema objects.'

  [[ "$(tool_psql "$database" pressly_runtime "$PRESSLY_RUNTIME_PASSWORD" -Atc \
    'select count(*) >= 0 from public.auth_identities;')" == 't' ]] ||
    fail 'the runtime role cannot read the restored application schema.'
  tool_psql "$database" pressly_runtime "$PRESSLY_RUNTIME_PASSWORD" -c \
    'begin; update public.auth_identities set id = id where false; rollback;' \
    >/dev/null || fail 'the runtime role cannot execute application DML.'
  [[ "$(tool_psql "$database" pressly_backup "$PRESSLY_BACKUP_PASSWORD" -Atc \
    "select current_setting('default_transaction_read_only') = 'on' and (select count(*) >= 0 from drizzle.__drizzle_migrations) and (select count(*) >= 0 from public.auth_identities);")" == 't' ]] ||
    fail 'the backup role cannot read public data and the migration ledger in read-only mode.'

  if tool_psql "$database" pressly_runtime "$PRESSLY_RUNTIME_PASSWORD" -c \
    'begin; create table public.pressly_restore_runtime_ddl_probe (id integer); rollback;' \
    >/dev/null 2>&1; then
    fail 'the runtime role unexpectedly created a schema object.'
  fi
  if tool_psql "$database" pressly_backup "$PRESSLY_BACKUP_PASSWORD" -c \
    'begin; delete from public.auth_identities where false; rollback;' \
    >/dev/null 2>&1; then
    fail 'the backup role unexpectedly executed a write statement.'
  fi
}

RESTORE_WORKDIR=''
RESTORE_DUMP=''
RESTORE_LIST_RAW=''
RESTORE_LIST=''
RESTORE_STAMP="$(date -u +%Y%m%d%H%M%S)"
RECOVERY_PREFIX="${POSTGRES_DB:0:24}"
CANDIDATE_DATABASE="${RECOVERY_PREFIX}_restore_${RESTORE_STAMP}_$$"
QUARANTINE_DATABASE="${RECOVERY_PREFIX}_damaged_${RESTORE_STAMP}_$$"
STARTED_AT="$(date +%s)"

SUCCESS=false
JOURNAL_ACTIVE=false
FENCE_STARTED=false
RESTORE_PHASE=''

cleanup() {
  local exit_code="$?"
  trap - EXIT INT TERM
  set +e
  if [[ -n "$RESTORE_WORKDIR" ]]; then
    rm -rf "$RESTORE_WORKDIR"
  fi

  if [[ "$SUCCESS" != true ]]; then
    if [[ "$JOURNAL_ACTIVE" == true && "$FENCE_STARTED" == true ]]; then
      compose stop caddy api worker >/dev/null 2>&1 || true
      echo 'Restore did not complete. Caddy, API, and Worker remain stopped.' >&2
    elif [[ "$JOURNAL_ACTIVE" == true ]]; then
      echo 'Restore stopped after journaling but before recovery mutation was authorized.' >&2
    else
      echo 'Restore failed before the durable recovery journal; services and databases were not changed.' >&2
    fi
    if [[ "$JOURNAL_ACTIVE" == true ]]; then
      echo "The durable restore journal remains at $RESTORE_JOURNAL_FILE." >&2
      echo 'Re-run the exact same confirmed backup and release identity to resume.' >&2
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

DOCKER_CONTEXT="$(docker context show)"
DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] ||
  fail 'refusing a non-local DOCKER_HOST override.'
[[ "$DOCKER_ENDPOINT" == unix://* ]] ||
  fail "refusing a non-local Docker endpoint: $DOCKER_ENDPOINT"

compose config --quiet

if [[ "$PROOF_MODE" != true ]]; then
  preflight_public_health_hostnames
fi

RUNNING_TOOLS="$(
  compose --profile tools ps --status running --services |
    grep -E '^(backup|migrate|restore)$' || true
)"
[[ -z "$RUNNING_TOOLS" ]] ||
  fail "a database tool container is already running: $RUNNING_TOOLS"

if [[ "$TEST_FAIL_BEFORE_JOURNAL" == true ]]; then
  fail 'simulated pre-journal failure.'
fi

if [[ "$ABORT_PRE_CUTOVER" == true && ! -f "$RESTORE_JOURNAL_FILE" ]]; then
  fail 'no durable restore journal exists to abort.'
fi

JOURNAL_ADMISSION_PHASE=preparing
if [[ "$ABORT_PRE_CUTOVER" == true ]]; then
  JOURNAL_ADMISSION_PHASE=abort-admission
fi
JOURNAL_RESULT="$({
  restore_journal_operation \
    start \
    "$JOURNAL_ADMISSION_PHASE" \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE"
} 2>&1)" || fail "$JOURNAL_RESULT"
mapfile -t JOURNAL_FIELDS <<< "$JOURNAL_RESULT"
[[ "${#JOURNAL_FIELDS[@]}" == 3 ]] ||
  fail 'restore journal returned an invalid field count.'
RESTORE_PHASE="${JOURNAL_FIELDS[0]}"
CANDIDATE_DATABASE="${JOURNAL_FIELDS[1]}"
QUARANTINE_DATABASE="${JOURNAL_FIELDS[2]}"
JOURNAL_ACTIVE=true
if [[ "$RESTORE_PHASE" == aborting && "$ABORT_PRE_CUTOVER" != true ]]; then
  fail 'restore journal is aborting; resume with --abort-pre-cutover and the exact confirmation.'
fi

RESTORE_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/pressly-postgres-restore.XXXXXX")"
RESTORE_DUMP="$RESTORE_WORKDIR/restore.dump"
RESTORE_LIST_RAW="$RESTORE_WORKDIR/restore.list.raw"
RESTORE_LIST="$RESTORE_WORKDIR/restore.list"

ensure_service_fence
fenced_compose config --quiet
FENCE_STARTED=true
fence_existing_service_restart_policies
echo 'Stopping public ingress and every current database writer.'
compose stop caddy api worker
for service in caddy api worker; do
  if compose ps --status running --services | grep -Fx "$service" >/dev/null; then
    fail "$service is still running after the recovery fence."
  fi
done

compose up -d --wait postgres

database_topology() {
  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d postgres \
    -AtF '|' \
    -v target_database="$POSTGRES_DB" \
    -v candidate_database="$CANDIDATE_DATABASE" \
    -v quarantine_database="$QUARANTINE_DATABASE" <<'SQL'
SELECT
  (SELECT count(*) FROM pg_database WHERE datname = :'target_database'),
  (SELECT count(*) FROM pg_database WHERE datname = :'candidate_database'),
  (SELECT count(*) FROM pg_database WHERE datname = :'quarantine_database');
SQL
}

classify_database_topology() {
  local topology="$1"
  case "$topology" in
    '1|0|0') echo target_only ;;
    '1|1|0') echo candidate_ready ;;
    '0|1|1') echo target_quarantined ;;
    '1|0|1') echo candidate_promoted ;;
    *) fail "restore database topology is unsafe: $topology" ;;
  esac
}

assert_phase_not_ahead_of_topology() {
  local topology="$1"
  case "$RESTORE_PHASE:$topology" in
    preparing:target_only|preparing:candidate_ready|candidate_ready:candidate_ready|candidate_ready:target_quarantined|target_quarantined:target_quarantined|target_quarantined:candidate_promoted|candidate_promoted:candidate_promoted|validated:candidate_promoted|deployment_reconciling:candidate_promoted|deployment_reconciled:candidate_promoted|public_verified:candidate_promoted|aborting:target_only|aborting:candidate_ready) ;;
    *) fail "restore journal phase $RESTORE_PHASE conflicts with database topology $topology." ;;
  esac
}

complete_cutover() {
  local topology
  topology="$(classify_database_topology "$(database_topology)")"
  assert_phase_not_ahead_of_topology "$topology"

  if [[ "$topology" == candidate_ready ]]; then
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v target_database="$POSTGRES_DB" \
      -v candidate_database="$CANDIDATE_DATABASE" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN (:'target_database', :'candidate_database')
  AND pid <> pg_backend_pid();
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'target_database') \gexec
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'candidate_database') \gexec
SQL

    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v target_database="$POSTGRES_DB" \
      -v quarantine_database="$QUARANTINE_DATABASE" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'target_database',
  :'quarantine_database'
) \gexec
SQL
    proof_kill_after after_target_rename
    write_restore_phase target_quarantined
    topology=target_quarantined
  fi

  if [[ "$topology" == target_quarantined ]]; then
    if [[ "$RESTORE_PHASE" != target_quarantined ]]; then
      write_restore_phase target_quarantined
    fi
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v candidate_database="$CANDIDATE_DATABASE" \
      -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'candidate_database',
  :'target_database'
) \gexec
SQL
    proof_kill_after after_candidate_rename
    write_restore_phase candidate_promoted
    topology=candidate_promoted
  fi

  if [[ "$topology" == candidate_promoted ]]; then
    if [[
      "$RESTORE_PHASE" != candidate_promoted &&
      "$RESTORE_PHASE" != validated &&
      "$RESTORE_PHASE" != deployment_reconciling &&
      "$RESTORE_PHASE" != deployment_reconciled &&
      "$RESTORE_PHASE" != public_verified
    ]]; then
      write_restore_phase candidate_promoted
    fi
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'target_database') \gexec
SQL
    validate_database "$POSTGRES_DB"
    if [[ "$RESTORE_PHASE" == candidate_promoted ]]; then
      write_restore_phase validated
    fi
  fi
}

finish_restore() {
  [[
    "$RESTORE_PHASE" == validated ||
    "$RESTORE_PHASE" == deployment_reconciling ||
    "$RESTORE_PHASE" == deployment_reconciled ||
    "$RESTORE_PHASE" == public_verified
  ]] ||
    fail "cannot finish restore from journal phase $RESTORE_PHASE."

  if [[ "$RESUME_SERVICES" == true ]]; then
    preflight_public_health_hostnames
    echo 'Starting database writers only after the promoted database passed validation.'
    fenced_compose up -d --wait api worker
    echo 'Restoring public ingress only after API and Worker became healthy.'
    fenced_compose up -d --wait caddy
    proof_kill_after before_public_verification
    preflight_public_health_hostnames
    wait_for_public_health API "$API_HEALTH_URL"
    wait_for_public_health Web "$WEB_HEALTH_URL"
    wait_for_public_health Processor "$PROCESSOR_HEALTH_URL"
    wait_for_public_health Control "$CONTROL_HEALTH_URL"
    preflight_public_health_hostnames
  else
    echo 'Controlled drill requested; Caddy, API, and Worker remain stopped.'
  fi

  if [[
    "$DEPLOYMENT_ADMISSION" == running_unverified &&
    "$RESUME_SERVICES" == true &&
    "$OPS_BUNDLE_ORIGIN" == current
  ]]; then
    if [[ "$RESTORE_PHASE" == validated ]]; then
      write_restore_phase deployment_reconciling
    fi
    reconcile_schema1_deployment_state
    if [[ "$RESTORE_PHASE" == deployment_reconciling ]]; then
      write_restore_phase deployment_reconciled
    fi
    echo 'Schema-1 deployment state reconciled only after database and public health validation.'
  elif [[ "$DEPLOYMENT_ADMISSION" == running_unverified ]]; then
    echo 'Deployment state remains unresolved; retry the exact recorded deployment or rollback recovery.'
  elif [[ "$DEPLOYMENT_ADMISSION" == recovering_unverified ]]; then
    echo 'Rollback recovery state remains unresolved; retry the exact recorded rollback target.'
  fi

  if [[ "$RESUME_SERVICES" == true ]]; then
    if [[ "$RESTORE_PHASE" != public_verified ]]; then
      write_restore_phase public_verified
    fi
    proof_kill_after after_public_verified
    lift_service_fence
    remove_service_fence
  fi

  FINISHED_AT="$(date +%s)"
  restore_journal_operation \
    remove \
    "$RESTORE_PHASE" \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE"
  JOURNAL_ACTIVE=false
  SUCCESS=true

  echo 'Production-shaped Postgres restore passed.'
  echo "Backup: $BACKUP_BASENAME"
  echo "SHA-256: $BACKUP_CHECKSUM"
  echo "Release SHA: $PRESSLY_RELEASE_SHA"
  echo "Restored database: $POSTGRES_DB"
  echo "Quarantined previous database: $QUARANTINE_DATABASE"
  echo "Recovery time seconds: $((FINISHED_AT - STARTED_AT))"
  echo 'Remove the quarantined database only after explicit retention approval.'
}

TOPOLOGY="$(classify_database_topology "$(database_topology)")"
assert_phase_not_ahead_of_topology "$TOPOLOGY"

if [[ "$ABORT_PRE_CUTOVER" == true ]]; then
  [[
    "$RESTORE_PHASE" == preparing ||
    "$RESTORE_PHASE" == candidate_ready ||
    "$RESTORE_PHASE" == aborting
  ]] ||
    fail "cannot abort restore from journal phase $RESTORE_PHASE."
  [[ "$TOPOLOGY" == target_only || "$TOPOLOGY" == candidate_ready ]] ||
    fail "cannot abort restore after cutover topology $TOPOLOGY."

  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format('GRANT CONNECT ON DATABASE %I TO pressly_runtime', :'target_database') \gexec
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'target_database') \gexec
SQL
  if [[ "$TEST_FAIL_ABORT_VALIDATION" == true ]]; then
    fail 'simulated abort validation failure.'
  fi
  validate_database "$POSTGRES_DB"

  if [[ "$RESTORE_PHASE" != aborting ]]; then
    write_restore_phase aborting
  fi
  proof_kill_after after_abort_journal

  if [[ "$RESUME_SERVICES" == true ]]; then
    preflight_public_health_hostnames
    echo 'Starting the unchanged database writers after abort validation.'
    fenced_compose up -d --wait api worker
    echo 'Restoring public ingress only after API and Worker became healthy.'
    fenced_compose up -d --wait caddy
    preflight_public_health_hostnames
    wait_for_public_health API "$API_HEALTH_URL"
    wait_for_public_health Web "$WEB_HEALTH_URL"
    wait_for_public_health Processor "$PROCESSOR_HEALTH_URL"
    wait_for_public_health Control "$CONTROL_HEALTH_URL"
    preflight_public_health_hostnames
  else
    echo 'Disposable abort proof requested; services remain stopped.'
  fi

  if [[ "$TOPOLOGY" == candidate_ready ]]; then
    postgres_exec dropdb -U "$POSTGRES_USER" --if-exists --force "$CANDIDATE_DATABASE"
    TOPOLOGY=target_only
    proof_kill_after after_abort_candidate_drop
  fi

  if [[ "$RESUME_SERVICES" == true ]]; then
    lift_service_fence
    remove_service_fence
  fi

  restore_journal_operation \
    abort \
    aborting \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE"
  JOURNAL_ACTIVE=false
  SUCCESS=true
  echo 'Pre-cutover Postgres restore abort passed.'
  echo "Unchanged database: $POSTGRES_DB"
  exit 0
fi

if [[
  "$TOPOLOGY" == target_quarantined ||
  "$TOPOLOGY" == candidate_promoted ||
  "$TOPOLOGY:$RESTORE_PHASE" == candidate_ready:candidate_ready
]]; then
  echo "Resuming durable restore cutover from $RESTORE_PHASE ($TOPOLOGY)."
  complete_cutover
  finish_restore
  exit 0
else
  # A killed pre-cutover attempt may have fenced the unchanged target. Writers
  # remain stopped, so temporarily restore owner/tool access for deterministic
  # validation and candidate reconstruction.
  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'target_database') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO pressly_runtime', :'target_database') \gexec
SQL

  MIGRATION_DATABASE="$(
    compose --profile tools run --rm -T restore \
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc 'select current_database();'
  )"
  [[ "$MIGRATION_DATABASE" == "$POSTGRES_DB" ]] ||
    fail "migration configuration targets $MIGRATION_DATABASE instead of $POSTGRES_DB."

  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM pressly_runtime', :'target_database') \gexec
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'target_database'
  AND pid <> pg_backend_pid();
SQL
  proof_kill_after after_preparing

  if [[ "$TOPOLOGY" == target_only ]]; then
    :
  elif [[ "$TOPOLOGY" == candidate_ready && "$RESTORE_PHASE" == preparing ]]; then
    postgres_exec dropdb -U "$POSTGRES_USER" --if-exists --force "$CANDIDATE_DATABASE"
    TOPOLOGY=target_only
  elif [[ "$TOPOLOGY" != candidate_ready ]]; then
    fail "cannot prepare a candidate from topology $TOPOLOGY."
  fi
fi

echo "Decrypting and inspecting $BACKUP_BASENAME."
gpg --decrypt --batch --passphrase-file "$PASSPHRASE_FILE" "$BACKUP_FILE" > "$RESTORE_DUMP"
chmod 600 "$RESTORE_DUMP"

compose --profile tools run --rm -T \
  --user "$(id -u):$(id -g)" \
  --volume "$RESTORE_WORKDIR:/restore:ro" \
  restore pg_restore --list /restore/restore.dump > "$RESTORE_LIST_RAW"
grep -v 'SEQUENCE SET drizzle __drizzle_migrations_id_seq' \
  "$RESTORE_LIST_RAW" > "$RESTORE_LIST"
[[ -s "$RESTORE_LIST" ]] || fail 'the backup archive restore list is empty.'

postgres_exec createdb -U "$POSTGRES_USER" --template=template0 "$CANDIDATE_DATABASE"
configure_roles "$CANDIDATE_DATABASE"
postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$CANDIDATE_DATABASE" \
  -c 'drop schema if exists drizzle cascade'

echo "Restoring into clean candidate database $CANDIDATE_DATABASE."
compose --profile tools run --rm -T \
  --user "$(id -u):$(id -g)" \
  --volume "$RESTORE_WORKDIR:/restore:ro" \
  -e PGHOST=postgres \
  -e PGPORT=5432 \
  -e PGDATABASE="$CANDIDATE_DATABASE" \
  -e PGUSER=pressly_migration \
  -e PGPASSWORD="$PRESSLY_MIGRATION_PASSWORD" \
  restore pg_restore \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    --use-list=/restore/restore.list \
    --dbname="$CANDIDATE_DATABASE" \
    /restore/restore.dump

tool_psql "$CANDIDATE_DATABASE" pressly_migration "$PRESSLY_MIGRATION_PASSWORD" <<'SQL'
DO $$
DECLARE
  max_migration_id integer;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
     AND to_regclass('drizzle.__drizzle_migrations_id_seq') IS NOT NULL THEN
    SELECT max(id) INTO max_migration_id
    FROM drizzle.__drizzle_migrations;

    PERFORM setval(
      'drizzle.__drizzle_migrations_id_seq'::regclass,
      greatest(coalesce(max_migration_id, 1), 1),
      max_migration_id IS NOT NULL
    );
  END IF;
END $$;
SQL

configure_roles "$CANDIDATE_DATABASE"

echo 'Applying every compatible migration from the checked-out release.'
CANDIDATE_DATABASE_URL="$(database_url_for "$CANDIDATE_DATABASE")"
compose --profile tools run --rm -T \
  --workdir /repo/packages/db \
  -e DATABASE_URL="$CANDIDATE_DATABASE_URL" \
  migrate node node_modules/drizzle-kit/bin.cjs migrate --config drizzle.config.ts
configure_roles "$CANDIDATE_DATABASE"
validate_database "$CANDIDATE_DATABASE"
write_restore_phase candidate_ready
proof_kill_after after_candidate_ready

echo 'Promoting the validated candidate and quarantining the damaged database.'
complete_cutover
finish_restore
