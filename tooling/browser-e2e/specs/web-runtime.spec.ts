import { expect, test } from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test('@smoke Web server-renders and hydrates one client navigation lifecycle', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  let documentRequests = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (
      request.resourceType() === 'document' &&
      new URL(request.url()).hostname === 'web.pressly.test'
    ) {
      documentRequests += 1;
    }
  });

  const serverResponse = await page.goto(`${browserEnvironment.webOrigin}/`, {
    waitUntil: 'domcontentloaded',
  });
  expect(
    serverResponse,
    'Web navigation must return an HTTP response.',
  ).not.toBeNull();
  if (serverResponse === null) return;
  expect(serverResponse.status()).toBe(200);
  expect(serverResponse.headers()['content-type']).toContain('text/html');

  const serverHtml = await serverResponse.text();
  expect(serverHtml).toMatch(/<html[^>]*\blang="en"/);
  expect(serverHtml).toContain('<main');
  expect(serverHtml).toContain('href="/services-pricing/wash-fold"');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');

  const pricingCatalogs = await page.evaluate(async (apiOrigin) => {
    const read = async (serviceSlug: 'wash-fold' | 'dry-cleaning') => {
      const response = await fetch(
        `${apiOrigin}/pricing/services/${serviceSlug}/pricing`,
      );
      return { status: response.status, body: await response.json() };
    };

    return Promise.all([read('wash-fold'), read('dry-cleaning')]);
  }, browserEnvironment.apiOrigin);
  expect(pricingCatalogs[0]).toMatchObject({
    status: 200,
    body: {
      ok: true,
      data: {
        serviceSlug: 'wash-fold',
        currency: 'USD',
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Wash & Fold', priceCents: 167 }),
          expect.objectContaining({ name: 'Delivery Fee', priceCents: 0 }),
          expect.objectContaining({ name: 'Hang Dry', priceCents: 295 }),
        ]),
      },
    },
  });
  expect(pricingCatalogs[1]).toMatchObject({
    status: 200,
    body: {
      ok: true,
      data: {
        serviceSlug: 'dry-cleaning',
        currency: 'USD',
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Delivery Fee', priceCents: 0 }),
          expect.objectContaining({ name: 'Launder & Press', priceCents: 395 }),
        ]),
      },
    },
  });

  const hydrationTrigger = page
    .getByRole('banner')
    .locator('[data-slot="dropdown-menu-trigger"]');
  const hydrationContent = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(hydrationTrigger).toBeVisible();
  await hydrationTrigger.click();
  await expect(hydrationContent).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hydrationContent).toBeHidden();

  const clientNavigation = page
    .locator('a[href="/services-pricing/wash-fold"]')
    .first();
  await expect(clientNavigation).toBeVisible();
  const documentMarker = await page.evaluate(() => {
    const marker = crypto.randomUUID();
    Reflect.set(window, '__presslyBrowserE2eDocument', marker);
    return marker;
  });

  await clientNavigation.click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname))
    .toBe('/services-pricing/wash-fold');
  const pricingPage = page.locator('main');
  await expect(pricingPage).toBeVisible();
  await expect(pricingPage).toContainText('$1.67');
  await expect(pricingPage).toContainText('$2.95');
  await expect(pricingPage).toContainText('Free');
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__presslyBrowserE2eDocument')),
    )
    .toBe(documentMarker);

  expect(documentRequests).toBe(1);
  expect(pageErrors).toEqual([]);
});
