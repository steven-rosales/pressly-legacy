import {
  expectAccessiblePage,
  expectNoHorizontalOverflow,
  expect,
  test,
} from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test.use({ storageState: browserEnvironment.controlStorageState });

test('@smoke @mobile Control remains operable without horizontal clipping', async ({
  page,
}) => {
  await page.goto(`${browserEnvironment.controlOrigin}/customers`);
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessiblePage(page);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = page.locator('[data-slot="sheet-content"]');
  await expect(navigation).toBeVisible();
  await expect
    .poll(async () => (await navigation.boundingBox())?.x ?? -Infinity)
    .toBeGreaterThanOrEqual(-1);
  await expectNoHorizontalOverflow(page);
});
