import type { Browser, Page } from '@playwright/test';
import {
  controlAuthenticatedSessionSchema,
  processorAuthenticatedSessionSchema,
} from '@pressly/contracts/auth';
import { enableMfa, signIn } from '../support/authentication';
import {
  expect,
  fetchSameOriginJson,
  monitorBrowserPage,
  successfulResponseData,
  test,
  type BrowserDiagnostics,
} from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

type WorkforceRole = 'manager' | 'operator';

type IsolatedPage = Readonly<{
  page: Page;
  diagnostics: BrowserDiagnostics;
}>;

const withIsolatedPage = async (
  browser: Browser,
  work: (input: IsolatedPage) => Promise<void>,
) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: true,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const diagnostics = monitorBrowserPage(page);
  let failure: unknown;
  try {
    await work({ page, diagnostics });
  } catch (error) {
    failure = error;
  } finally {
    if (diagnostics.problems.length > 0) {
      await test.info().attach('isolated-browser-diagnostics', {
        body: Buffer.from(`${diagnostics.problems.join('\n')}\n`, 'utf8'),
        contentType: 'text/plain',
      });
    }
    await context.close();
  }
  if (failure !== undefined) throw failure;
  expect(
    diagnostics.problems,
    'isolated identity browser diagnostics must remain clean',
  ).toEqual([]);
};

const issueInvitation = async (
  page: Page,
  input: {
    displayName: string;
    email: string;
    role: WorkforceRole;
  },
): Promise<string> => {
  await page.goto(`${browserEnvironment.controlOrigin}/team`);
  await expect(
    page.getByRole('heading', { name: 'Team', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Invite teammate' }).click();
  await page.getByLabel('Employee name').fill(input.displayName);
  await page.getByLabel('Email').fill(input.email);
  if (input.role === 'manager') {
    await page
      .getByRole('combobox', { name: 'Access level', exact: true })
      .click();
    await page.getByRole('option', { name: 'Manager', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  const invitationLink = await page
    .getByRole('textbox', { name: 'Invitation link', exact: true })
    .inputValue();
  expect(new URL(invitationLink).origin).toBe(browserEnvironment.controlOrigin);
  await page.getByRole('button', { name: 'I saved the link' }).click();
  return invitationLink;
};

const acceptInvitation = async (
  browser: Browser,
  input: {
    invitationLink: string;
    displayName: string;
    password: string;
  },
) =>
  withIsolatedPage(browser, async ({ page }) => {
    await page.goto(input.invitationLink);
    await expect(
      page.getByRole('heading', {
        name: `Welcome, ${input.displayName}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(input.password);
    await page.getByLabel('Confirm password').fill(input.password);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Your Pressly account is ready',
        exact: true,
      }),
    ).toBeVisible();
  });

test.use({ storageState: browserEnvironment.controlStorageState });

test('@smoke owner, manager, and operator retain distinct application authority', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${test.info().retry}`;
  const manager = {
    displayName: `Browser Manager ${suffix}`,
    email: `manager-${suffix}@example.invalid`,
    password: `Pressly!Manager9-${suffix}`,
  };
  const operator = {
    displayName: `Browser Operator ${suffix}`,
    email: `operator-${suffix}@example.invalid`,
    password: `Pressly!Operator9-${suffix}`,
  };

  await page.goto(browserEnvironment.controlOrigin);
  const ownerResponse = await fetchSameOriginJson(
    page,
    '/api/control/auth/session',
  );
  expect(ownerResponse.status).toBe(200);
  const ownerSession = controlAuthenticatedSessionSchema.parse(
    successfulResponseData(ownerResponse),
  );
  expect(ownerSession.access.capabilities).toContain('security:write');

  const managerInvitation = await issueInvitation(page, {
    ...manager,
    role: 'manager',
  });
  const operatorInvitation = await issueInvitation(page, {
    ...operator,
    role: 'operator',
  });
  await acceptInvitation(browser, {
    invitationLink: managerInvitation,
    ...manager,
  });
  await acceptInvitation(browser, {
    invitationLink: operatorInvitation,
    ...operator,
  });

  await withIsolatedPage(
    browser,
    async ({ page: managerPage, diagnostics }) => {
      diagnostics.allowResponse(
        (response) =>
          response.status() === 401 &&
          new URL(response.url()).pathname === '/api/control/auth/session',
      );
      await signIn(managerPage, {
        origin: browserEnvironment.controlOrigin,
        title: 'Sign in to Control',
        credential: manager,
      });
      await enableMfa(managerPage);

      const response = await fetchSameOriginJson(
        managerPage,
        '/api/control/auth/session',
      );
      expect(response.status).toBe(200);
      const session = controlAuthenticatedSessionSchema.parse(
        successfulResponseData(response),
      );
      expect(session.access.capabilities).toEqual(
        expect.arrayContaining([
          'control:view',
          'team:write',
          'customers:write',
          'orders:write',
          'security:read',
        ]),
      );
      expect(session.access.capabilities).not.toContain('security:write');

      await managerPage.goto(`${browserEnvironment.controlOrigin}/team`);
      await expect(
        managerPage.getByRole('button', { name: 'Invite teammate' }),
      ).toBeVisible();
    },
  );

  await withIsolatedPage(
    browser,
    async ({ page: operatorPage, diagnostics }) => {
      diagnostics.allowResponse(
        (response) =>
          response.status() === 401 &&
          new URL(response.url()).pathname === '/api/processor/auth/session',
      );
      await signIn(operatorPage, {
        origin: browserEnvironment.processorOrigin,
        title: 'Sign in to Processor',
        credential: operator,
      });
      await expect(
        operatorPage.getByRole('heading', { name: 'Home', exact: true }),
      ).toBeVisible();
      const response = await fetchSameOriginJson(
        operatorPage,
        '/api/processor/auth/session',
      );
      expect(response.status).toBe(200);
      const session = processorAuthenticatedSessionSchema.parse(
        successfulResponseData(response),
      );
      expect(session.access.locations).toHaveLength(1);
      expect(session.access.locations[0]?.capabilities).toEqual(
        expect.arrayContaining(['processor:view', 'production:read']),
      );
    },
  );

  await withIsolatedPage(browser, async ({ page: deniedPage, diagnostics }) => {
    diagnostics.allowResponse((response) => {
      const path = new URL(response.url()).pathname;
      return (
        (response.status() === 401 && path === '/api/control/auth/session') ||
        (response.status() === 403 && path === '/api/control/auth/login')
      );
    });
    await signIn(deniedPage, {
      origin: browserEnvironment.controlOrigin,
      title: 'Sign in to Control',
      credential: operator,
    });
    await expect(deniedPage.getByRole('alert')).toContainText(
      'do not have access',
    );
  });
});
