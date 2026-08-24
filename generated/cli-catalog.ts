/* This file is generated from the checked deployment topology. */
import { defineCliCatalog, type ExecutableCliCatalog } from '@pressly/cells';
import { makeAccessBootstrapCliSystem as assemble1 } from '@pressly/access-system';
import { makeAdminCliExperience as assemble0 } from '@pressly/experience-control';

export type CliCatalogOwners = Readonly<{
  'experience:control': Awaited<ReturnType<typeof assemble0>>;
  'system:access': Awaited<ReturnType<typeof assemble1>>;
}>;

export type CliCatalogDependencies = Readonly<{
  'experience:control': Parameters<typeof assemble0>;
  'system:access': Parameters<typeof assemble1>;
}>;

export const makeCliCatalogFromOwners = (
  owners: CliCatalogOwners,
): ExecutableCliCatalog =>
  defineCliCatalog(
    [
      owners['system:access'].cells['bootstrapOwner'],
      owners['experience:control'].cells['login'],
      owners['experience:control'].cells['logout'],
      owners['experience:control'].cells['mfaConfirm'],
      owners['experience:control'].cells['mfaEnroll'],
      owners['experience:control'].cells['mfaRecoveryCodes'],
      owners['experience:control'].cells['mfaRemove'],
      owners['experience:control'].cells['session'],
      owners['experience:control'].cells['productionBootstrap'],
      owners['experience:control'].cells['plan'],
      owners['experience:control'].cells['publish'],
      owners['experience:control'].cells['show'],
    ] as const,
    {
      id: 'control.pressly-admin-cli.v1',
      helpOptions: ['--help', '-h'],
      help: {
        stdout:
          'Pressly auth CLI\n\nUsage:\n  credential-source | pressly-admin auth login --email user@example.com --secret-stdin\n  pressly-admin auth session\n  pressly-admin auth logout\n  pressly-admin auth mfa-enroll\n  code-source | pressly-admin auth mfa-confirm --secret-stdin\n  pressly-admin auth mfa-recovery-codes\n  pressly-admin auth mfa-remove\n\nOptions:\n  --email         Email for login\n  --secret-stdin  Read secrets from bounded redirected stdin\n  --json          Print JSON output\n  --help          Show help\n\nSecure stdin:\n  login reads JSON with password and, when needed, either mfaCode or recoveryCode\n  mfa-confirm reads the enrollment confirmation code as plain UTF-8\n  stdin must be redirected; secrets are never accepted as arguments\n\nPressly pricing CLI\n\nUsage:\n  pressly-admin pricing show --service wash-fold\n  pressly-admin pricing plan --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee"\n  pressly-admin pricing publish --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee" --yes\n\nOptions:\n  --service   Pricing service: wash-fold or dry-cleaning\n  --set       Item change as code=money. Repeat for multiple items\n  --reason    Required for plan/publish\n  --yes       Required to commit publish\n  --json      Print JSON output\n  --help      Show help\n',
        exitCode: 0,
      },
      unknown: {
        stream: 'stderr',
        exitCode: 1,
        prefix: 'Unknown command namespace: ',
        suffix: '.\n\n',
        token: 'first',
        appendHelp: true,
      },
      groups: [
        {
          name: ['auth'],
          help: {
            stdout:
              'Pressly auth CLI\n\nUsage:\n  credential-source | pressly-admin auth login --email user@example.com --secret-stdin\n  pressly-admin auth session\n  pressly-admin auth logout\n  pressly-admin auth mfa-enroll\n  code-source | pressly-admin auth mfa-confirm --secret-stdin\n  pressly-admin auth mfa-recovery-codes\n  pressly-admin auth mfa-remove\n\nOptions:\n  --email         Email for login\n  --secret-stdin  Read secrets from bounded redirected stdin\n  --json          Print JSON output\n  --help          Show help\n\nSecure stdin:\n  login reads JSON with password and, when needed, either mfaCode or recoveryCode\n  mfa-confirm reads the enrollment confirmation code as plain UTF-8\n  stdin must be redirected; secrets are never accepted as arguments\n',
            exitCode: 0,
          },
          unknown: {
            stream: 'stderr',
            exitCode: 1,
            prefix: 'Expected a supported auth action.\n\n',
            suffix: '',
            token: 'none',
            appendHelp: true,
          },
        },
        {
          name: ['pricing'],
          help: {
            stdout:
              'Pressly pricing CLI\n\nUsage:\n  pressly-admin pricing show --service wash-fold\n  pressly-admin pricing plan --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee"\n  pressly-admin pricing publish --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee" --yes\n\nOptions:\n  --service   Pricing service: wash-fold or dry-cleaning\n  --set       Item change as code=money. Repeat for multiple items\n  --reason    Required for plan/publish\n  --yes       Required to commit publish\n  --json      Print JSON output\n  --help      Show help\n',
            exitCode: 0,
          },
          unknown: {
            stream: 'stderr',
            exitCode: 1,
            prefix: 'Expected pricing action: show, plan, or publish.\n\n',
            suffix: '',
            token: 'none',
            appendHelp: true,
          },
        },
      ],
    } as const,
  );

export const makeCliCatalog = async (
  dependencies: CliCatalogDependencies,
): Promise<ExecutableCliCatalog> => {
  const owner0 = await assemble0(...dependencies['experience:control']);
  const owner1 = await assemble1(...dependencies['system:access']);

  return makeCliCatalogFromOwners({
    'experience:control': owner0,
    'system:access': owner1,
  });
};
