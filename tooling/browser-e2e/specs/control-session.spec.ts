import {
  expectAccessiblePage,
  expectNoHorizontalOverflow,
  expect,
  fetchSameOriginJson,
  test,
} from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test.use({ storageState: browserEnvironment.controlStorageState });

test('@smoke Control keeps its authenticated session host-only', async ({
  page,
  context,
  browserDiagnostics,
}) => {
  await page.goto(browserEnvironment.controlOrigin);
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible();

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pressly-workspace-main')).toBeFocused();

  const sessionCookies = (
    await context.cookies(browserEnvironment.controlOrigin)
  ).filter((cookie) => cookie.httpOnly);
  expect(sessionCookies.length).toBeGreaterThan(0);
  for (const cookie of sessionCookies) {
    expect(cookie.secure).toBe(true);
    expect(cookie.domain).toBe('control.pressly.test');
    expect(['Lax', 'Strict']).toContain(cookie.sameSite);
  }

  await expectAccessiblePage(page);
  await expectNoHorizontalOverflow(page);

  browserDiagnostics.allowResponse(
    (response) =>
      response.status() === 401 &&
      new URL(response.url()).pathname === '/api/processor/auth/session',
  );
  await page.goto(browserEnvironment.processorOrigin);
  await expect(
    page.getByRole('heading', { name: 'Sign in to Processor' }),
  ).toBeVisible();
});

test('@smoke Control rejects a state-changing request without CSRF and keeps the session', async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: browserEnvironment.controlStorageState,
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(browserEnvironment.controlOrigin);
    const rejected = await fetchSameOriginJson(
      page,
      '/api/control/auth/logout',
      { method: 'POST' },
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({
      ok: false,
      error: { code: 'control_csrf_rejected' },
    });

    const session = await fetchSameOriginJson(
      page,
      '/api/control/auth/session',
    );
    expect(session.status).toBe(200);
  } finally {
    await context.close();
  }
});

test('@smoke Control rejects a state-changing request from the wrong origin', async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: browserEnvironment.controlStorageState,
    ignoreHTTPSErrors: true,
  });
  try {
    const controlUrl = new URL(browserEnvironment.controlOrigin);
    const loopbackOrigin = `https://127.0.0.1:${controlUrl.port}`;
    const cookieHeader = (
      await context.cookies(browserEnvironment.controlOrigin)
    )
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    const rejected = await context.request.post(
      `${loopbackOrigin}/api/control/auth/logout`,
      {
        headers: {
          Cookie: cookieHeader,
          Host: controlUrl.host,
          Origin: 'https://attacker.invalid',
          'X-CSRF-Token': 'a'.repeat(43),
        },
      },
    );
    expect(rejected.status()).toBe(403);
    await expect(rejected.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'control_origin_rejected' },
    });
  } finally {
    await context.close();
  }
});
