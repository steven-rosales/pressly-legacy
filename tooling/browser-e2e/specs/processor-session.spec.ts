import {
  expectAccessiblePage,
  expectNoHorizontalOverflow,
  expect,
  test,
} from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test.use({ storageState: browserEnvironment.processorStorageState });

test('@smoke Processor restores its own authenticated workspace', async ({
  page,
}) => {
  await page.goto(browserEnvironment.processorOrigin);
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible();
  await expectAccessiblePage(page);
  await expectNoHorizontalOverflow(page);
});
