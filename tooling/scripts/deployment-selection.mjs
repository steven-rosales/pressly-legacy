const commitShaPattern = /^[0-9a-f]{40}$/i;

const normalizeCommitSha = (value, source) => {
  const sha = value.trim().toLowerCase();

  if (!commitShaPattern.test(sha))
    throw new Error(`${source} must be a full 40-character commit SHA.`);

  return sha;
};

export const selectDeploySha = ({
  eventName,
  workflowRunSha = '',
  manualSha = '',
}) => {
  if (eventName === 'workflow_run')
    return normalizeCommitSha(workflowRunSha, 'workflow_run.head_sha');

  if (eventName === 'workflow_dispatch')
    return normalizeCommitSha(manualSha, 'Manual deployment input');

  throw new Error(`Unsupported deployment event: ${eventName}`);
};

const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const sha = selectDeploySha({
    eventName: process.env['EVENT_NAME'] ?? '',
    workflowRunSha: process.env['WORKFLOW_RUN_SHA'] ?? '',
    manualSha: process.env['MANUAL_SHA'] ?? '',
  });

  process.stdout.write(`${sha}\n`);
}
