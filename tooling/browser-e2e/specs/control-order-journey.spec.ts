import { expect, test } from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test.use({ storageState: browserEnvironment.controlStorageState });

test('@smoke an owner creates a customer and its order through Control', async ({
  page,
}) => {
  const suffix = `${Date.now()}-${test.info().retry}`;
  const firstName = 'Browser';
  const lastName = `Operator ${suffix}`;
  const customerName = `${firstName} ${lastName}`;
  const orderNumber = `E2E-${suffix}`;

  await page.goto(`${browserEnvironment.controlOrigin}/customers`);
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New customer' }).first().click();
  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Last name').fill(lastName);
  await page.getByLabel('Phone').fill('+12015550199');
  await page.getByLabel('Email').fill(`browser-${suffix}@example.invalid`);
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(
    page.getByRole('table').getByText(customerName, { exact: true }),
  ).toBeVisible();

  await page.goto(`${browserEnvironment.controlOrigin}/orders`);
  await expect(
    page.getByRole('heading', { name: 'Orders', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New order' }).first().click();
  await page.getByLabel('Find customer').fill(customerName);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).click();
  await page
    .getByRole('option', { name: new RegExp(`^${firstName} ${lastName}`) })
    .click();
  await page.getByLabel('Order number').fill(orderNumber);
  await page.getByRole('combobox', { name: 'Location', exact: true }).click();
  await page.getByRole('option', { name: 'Offline Smoke Facility' }).click();
  await page.getByLabel('Order total').fill('42.00');
  await page.getByLabel('Balance due').fill('42.00');
  await page.getByLabel('Estimated weight').fill('18');
  await page.getByRole('button', { name: 'Create order' }).click();

  const createdOrderRow = page
    .getByRole('row')
    .filter({ hasText: `Order ${orderNumber}` });
  await expect(createdOrderRow).toBeVisible();
  await expect(createdOrderRow).toContainText(customerName);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Orders', exact: true }),
  ).toBeVisible();
  await expect(createdOrderRow).toBeVisible();
  await expect(createdOrderRow).toContainText(customerName);
});
