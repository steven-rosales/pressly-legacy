import type { Browser, Page, Response } from '@playwright/test';
import { toolingError } from '@pressly/errors/tooling-error';
import { controlAuthenticatedSessionSchema } from '@pressly/experience-control/contracts/authentication-v1';
import { userMutationResultSchema } from '@pressly/experience-control/contracts/customers-v1';
import { orderMutationResultSchema } from '@pressly/experience-control/contracts/orders-v1';
import { processorAuthenticatedSessionSchema } from '@pressly/experience-processor/contracts/authentication-v1';
import { processorProductionWorkspaceSchema } from '@pressly/experience-processor/contracts/production-workspace';
import {
  controlCreateCustomerV1,
  controlCreateOrderV1,
  controlLoadAuthSessionV1,
} from '../../../topology/browser-operations.ts';
import {
  processorLoadAuthSessionV1,
  processorLoadProductionWorkspaceV1,
  productionAcceptScheduleV1,
  productionAdvanceStageV1,
  productionChangeAdmissionV1,
  productionCreateScheduleV1,
  productionCreateShiftV1,
  productionListLocationsV1,
  productionRecordOrderIntakeV1,
  productionReplaceShiftSelectionV1,
  productionStartScheduleV1,
  productionSubscribeChangesV1,
} from '../../../topology/browser-operations.ts';
import {
  expect,
  fetchSameOriginJson,
  monitorBrowserPage,
  successfulResponseData,
  test,
} from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

type HttpSurface = Readonly<{ method: string; path: string }>;

const locationId = 'offline-smoke-location';

const journeyFailure = (message: string) =>
  toolingError({ code: 'browser_production_journey_failure', message });

const required = <Value>(
  value: Value | null | undefined,
  message: string,
): Value => {
  if (value === null || value === undefined) throw journeyFailure(message);
  return value;
};

const record = (value: unknown, message: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw journeyFailure(message);
  return value as Record<string, unknown>;
};

const stringField = (
  value: Record<string, unknown>,
  key: string,
  message: string,
): string => {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0)
    throw journeyFailure(message);
  return field;
};

const numberField = (
  value: Record<string, unknown>,
  key: string,
  message: string,
): number => {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isSafeInteger(field))
    throw journeyFailure(message);
  return field;
};

const arrayField = (
  value: Record<string, unknown>,
  key: string,
  message: string,
): readonly unknown[] => {
  const field = value[key];
  if (!Array.isArray(field)) throw journeyFailure(message);
  return field;
};

const generatedApiPath = (
  path: string,
  parameters: Readonly<Record<string, string>> = {},
): `/${string}` => {
  const resolved = path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) =>
    encodeURIComponent(
      required(parameters[key], `Generated path parameter ${key} is missing.`),
    ),
  );
  if (resolved.includes('/:'))
    throw journeyFailure(`Generated API path is unresolved: ${resolved}`);
  return `/api${resolved}`;
};

const requestGenerated = async (
  page: Page,
  surface: HttpSurface,
  input: Readonly<{
    parameters?: Readonly<Record<string, string>>;
    query?: string;
    body?: unknown;
    csrfToken?: string;
    expectedStatus: number;
  }>,
) => {
  const basePath = generatedApiPath(surface.path, input.parameters);
  const response = await fetchSameOriginJson(
    page,
    `${basePath}${input.query ?? ''}`,
    {
      method: surface.method,
      ...(input.csrfToken === undefined
        ? {}
        : { headers: { 'X-CSRF-Token': input.csrfToken } }),
      ...(input.body === undefined ? {} : { body: input.body }),
    },
  );
  expect(response.status).toBe(input.expectedStatus);
  return successfulResponseData(response);
};

const seedCanonicalOrder = async (browser: Browser, suffix: string) => {
  const context = await browser.newContext({
    storageState: browserEnvironment.controlStorageState,
    ignoreHTTPSErrors: true,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const diagnostics = monitorBrowserPage(page);

  try {
    await page.goto(browserEnvironment.controlOrigin);
    const session = controlAuthenticatedSessionSchema.parse(
      await requestGenerated(page, controlLoadAuthSessionV1.http.session, {
        expectedStatus: 200,
      }),
    );
    const customer = userMutationResultSchema.parse(
      await requestGenerated(page, controlCreateCustomerV1.http.customers, {
        body: {
          idempotencyKey: `browser-production-customer-${suffix}`,
          profile: {
            firstName: 'Browser',
            lastName: `Production ${suffix}`,
            businessName: null,
            phone: '+12015550198',
            email: `production-${suffix}@example.invalid`,
          },
        },
        csrfToken: session.csrfToken,
        expectedStatus: 201,
      }),
    );
    const displayNumber = `PRODUCTION-E2E-${suffix}`;
    const order = orderMutationResultSchema.parse(
      await requestGenerated(page, controlCreateOrderV1.http.orders, {
        body: {
          idempotencyKey: `browser-production-order-${suffix}`,
          reasonCode: 'new_customer_order',
          reasonNote: null,
          customer: { resolution: 'resolved', userId: customer.userId },
          displayNumber,
          dueAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
          currency: 'USD',
          totalAmountCents: 2_000,
          balanceDueCents: 2_000,
          items: [
            {
              lineKey: 'wash-fold',
              itemType: 'service',
              code: 'wash-fold',
              description: 'Synthetic wash and fold',
              quantity: 10,
              unit: 'lb',
              unitPriceCents: 200,
              totalAmountCents: 2_000,
              sourceMetadata: {},
            },
          ],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId,
            estimatedWeightLbs: 10,
            estimatedWeightSource: 'browser_e2e',
          },
        },
        csrfToken: session.csrfToken,
        expectedStatus: 201,
      }),
    );

    expect(diagnostics.problems).toEqual([]);
    return { displayNumber, order };
  } finally {
    await context.close();
  }
};

const loadProjectedOrder = async (page: Page, displayNumber: string) => {
  const workspace = processorProductionWorkspaceSchema.parse(
    await requestGenerated(
      page,
      processorLoadProductionWorkspaceV1.http.workspace,
      {
        parameters: { locationId },
        expectedStatus: 200,
      },
    ),
  );
  return (
    workspace.orders.find((order) => order.externalOrderId === displayNumber) ??
    null
  );
};

const prepareProductionRun = async (
  page: Page,
  input: Readonly<{
    csrfToken: string;
    displayNumber: string;
    suffix: string;
  }>,
) => {
  await expect
    .poll(
      async () => (await loadProjectedOrder(page, input.displayNumber))?.status,
      { timeout: 30_000 },
    )
    .toBe('release_pending');
  const projectedOrder = required(
    await loadProjectedOrder(page, input.displayNumber),
    'The Worker did not project the synthetic Control order.',
  );

  const intake = record(
    await requestGenerated(page, productionRecordOrderIntakeV1.http.intake, {
      parameters: {
        locationId,
        productionOrderId: projectedOrder.id,
      },
      body: {
        bagCount: 1,
        expectedVersion: projectedOrder.version,
        idempotencyKey: `browser-production-intake-${input.suffix}`,
      },
      csrfToken: input.csrfToken,
      expectedStatus: 200,
    }),
    'The intake response is not an object.',
  );
  const admission = record(
    await requestGenerated(page, productionChangeAdmissionV1.http.admission, {
      parameters: {
        locationId,
        productionOrderId: projectedOrder.id,
      },
      body: {
        target: 'released',
        expectedVersion: numberField(
          intake,
          'version',
          'The intake response has no version.',
        ),
        idempotencyKey: `browser-production-admission-${input.suffix}`,
      },
      csrfToken: input.csrfToken,
      expectedStatus: 200,
    }),
    'The admission response is not an object.',
  );
  expect(admission['status']).toBe('eligible');

  const workspace = processorProductionWorkspaceSchema.parse(
    await requestGenerated(
      page,
      processorLoadProductionWorkspaceV1.http.workspace,
      {
        parameters: { locationId },
        expectedStatus: 200,
      },
    ),
  );
  const schedulerConfig = required(
    workspace.currentSchedulerConfig,
    'The disposable production bootstrap has no scheduler configuration.',
  );
  const now = Date.now();
  const shift = record(
    await requestGenerated(page, productionCreateShiftV1.http.shifts, {
      parameters: { locationId },
      body: {
        startsAt: new Date(now - 10 * 60_000).toISOString(),
        endsAt: new Date(now + 6 * 60 * 60_000).toISOString(),
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        idempotencyKey: `browser-production-shift-${input.suffix}`,
      },
      csrfToken: input.csrfToken,
      expectedStatus: 201,
    }),
    'The shift response is not an object.',
  );
  const shiftId = stringField(shift, 'id', 'The shift response has no ID.');
  const selection = record(
    await requestGenerated(
      page,
      productionReplaceShiftSelectionV1.http.selection,
      {
        parameters: { locationId, productionShiftId: shiftId },
        body: {
          selectedOrderIds: [projectedOrder.id],
          expectedVersion: 0,
          idempotencyKey: `browser-production-selection-${input.suffix}`,
        },
        csrfToken: input.csrfToken,
        expectedStatus: 200,
      },
    ),
    'The shift-selection response is not an object.',
  );
  const selected = record(
    selection['selection'],
    'The shift-selection response has no selection.',
  );
  expect(selected['selectedOrderIds']).toEqual([projectedOrder.id]);

  const schedule = record(
    await requestGenerated(page, productionCreateScheduleV1.http.schedules, {
      parameters: { locationId },
      body: {
        productionShiftId: shiftId,
        schedulerConfigId: schedulerConfig.id,
        idempotencyKey: `browser-production-schedule-${input.suffix}`,
      },
      csrfToken: input.csrfToken,
      expectedStatus: 201,
    }),
    'The schedule response is not an object.',
  );
  expect(
    arrayField(schedule, 'batches', 'The schedule has no batches.'),
  ).toHaveLength(1);
  expect(
    arrayField(
      schedule,
      'unplacedOrderIds',
      'The schedule has no unplaced list.',
    ),
  ).toEqual([]);
  expect(
    arrayField(schedule, 'warnings', 'The schedule has no warnings.'),
  ).toEqual([]);
  const scheduleRunId = stringField(
    schedule,
    'scheduleRunId',
    'The schedule response has no run ID.',
  );
  const outputPlanHash = stringField(
    schedule,
    'outputPlanHash',
    'The schedule response has no output-plan hash.',
  );
  record(
    await requestGenerated(page, productionAcceptScheduleV1.http.accept, {
      parameters: { locationId, scheduleRunId },
      body: {
        expectedOutputPlanHash: outputPlanHash,
        acknowledgedWarningCodes: [],
        idempotencyKey: `browser-production-accept-${input.suffix}`,
      },
      csrfToken: input.csrfToken,
      expectedStatus: 201,
    }),
    'The schedule-acceptance response is not an object.',
  );
  const started = record(
    await requestGenerated(page, productionStartScheduleV1.http.start, {
      parameters: { locationId, scheduleRunId },
      body: {
        expectedOutputPlanHash: outputPlanHash,
        idempotencyKey: `browser-production-start-${input.suffix}`,
      },
      csrfToken: input.csrfToken,
      expectedStatus: 201,
    }),
    'The schedule-start response is not an object.',
  );
  return {
    productionRunId: stringField(
      started,
      'productionRunId',
      'The schedule-start response has no production run ID.',
    ),
  };
};

const isWorkspaceResponse = (response: Response): boolean =>
  new URL(response.url()).pathname ===
  generatedApiPath(processorLoadProductionWorkspaceV1.http.workspace.path, {
    locationId,
  });

test.use({ storageState: browserEnvironment.processorStorageState });
test.setTimeout(180_000);

test('Processor runs production commands and resynchronizes after conflicts', async ({
  page,
  browser,
  context,
  browserDiagnostics,
}) => {
  const suffix = `${Date.now()}-${test.info().retry}`;
  const seeded = await seedCanonicalOrder(browser, suffix);

  await page.goto(browserEnvironment.processorOrigin);
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible();
  const processorSession = processorAuthenticatedSessionSchema.parse(
    await requestGenerated(page, processorLoadAuthSessionV1.http.session, {
      expectedStatus: 200,
    }),
  );
  const locations = record(
    await requestGenerated(page, productionListLocationsV1.http.locations, {
      expectedStatus: 200,
    }),
    'The production-location response is not an object.',
  );
  expect(processorSession.access.locations).toHaveLength(1);
  expect(
    arrayField(
      locations,
      'items',
      'The production-location response has no items.',
    ).map((location) =>
      stringField(
        record(location, 'A production location is not an object.'),
        'id',
        'A production location has no ID.',
      ),
    ),
  ).toEqual([locationId]);
  await expect(
    page.getByRole('heading', { name: 'Choose a production location' }),
  ).toHaveCount(0);

  const started = await prepareProductionRun(page, {
    csrfToken: processorSession.csrfToken,
    displayNumber: seeded.displayNumber,
    suffix,
  });
  await page.goto(
    `${browserEnvironment.processorOrigin}/production/${started.productionRunId}`,
  );
  await expect(
    page.getByRole('heading', { name: 'Production', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Live production run', exact: true }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Start Sorting', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Complete Sorting', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Complete Sorting', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Complete this stage early?',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Complete early', exact: true })
    .click();
  await expect(
    page.getByLabel('Batch 1, Sorting, completed', { exact: true }),
  ).toBeVisible();
  const staleWashingAction = page.getByRole('button', {
    name: 'Start Washing now',
    exact: true,
  });
  await expect(staleWashingAction).toBeVisible();

  const workspacePath = generatedApiPath(
    processorLoadProductionWorkspaceV1.http.workspace.path,
    { locationId },
  );
  const workspacePattern = `**${workspacePath}*`;
  let blockWorkspaceRefresh = false;
  let workspaceRefreshBlocked = false;
  let releaseWorkspaceRefresh: () => void = () => undefined;
  const workspaceRefreshGate = new Promise<void>((resolve) => {
    releaseWorkspaceRefresh = resolve;
  });
  await page.route(workspacePattern, async (route) => {
    if (!blockWorkspaceRefresh) {
      await route.fallback();
      return;
    }
    workspaceRefreshBlocked = true;
    await workspaceRefreshGate;
    await route.fallback();
  });

  try {
    const currentWorkspace = processorProductionWorkspaceSchema.parse(
      await requestGenerated(
        page,
        processorLoadProductionWorkspaceV1.http.workspace,
        {
          parameters: { locationId },
          expectedStatus: 200,
        },
      ),
    );
    const washing = required(
      currentWorkspace.board?.batches[0]?.stages.find(
        (stage) => stage.stage === 'washing',
      ),
      'The started production board has no washing stage.',
    );
    const washingPath = generatedApiPath(
      productionAdvanceStageV1.http.start.path,
      { locationId, stageRunId: washing.id },
    );
    const confirmation = record(
      await requestGenerated(page, productionAdvanceStageV1.http.start, {
        parameters: { locationId, stageRunId: washing.id },
        body: {
          expectedVersion: washing.version,
          idempotencyKey: `browser-production-washing-preview-${suffix}`,
        },
        csrfToken: processorSession.csrfToken,
        expectedStatus: 200,
      }),
      'The stage confirmation response is not an object.',
    );
    if (confirmation['status'] !== 'confirmation_required')
      throw journeyFailure(
        'Washing did not require its early-start confirmation.',
      );

    blockWorkspaceRefresh = true;
    record(
      await requestGenerated(page, productionAdvanceStageV1.http.start, {
        parameters: { locationId, stageRunId: washing.id },
        body: {
          expectedVersion: numberField(
            confirmation,
            'stageVersion',
            'The stage confirmation has no version.',
          ),
          confirmation: record(
            confirmation['confirmation'],
            'The stage confirmation has no identity.',
          ),
          idempotencyKey: `browser-production-washing-confirm-${suffix}`,
        },
        csrfToken: processorSession.csrfToken,
        expectedStatus: 200,
      }),
      'The confirmed stage-start response is not an object.',
    );
    await expect.poll(() => workspaceRefreshBlocked).toBe(true);

    browserDiagnostics.allowResponse(
      (response) =>
        response.status() === 409 &&
        new URL(response.url()).pathname === washingPath,
    );
    const conflictResponse = page.waitForResponse(
      (response) =>
        response.status() === 409 &&
        new URL(response.url()).pathname === washingPath,
    );
    await staleWashingAction.click();
    await conflictResponse;
    releaseWorkspaceRefresh();
    await expect(page.getByRole('alert')).toContainText(
      'Production changed while this action was open.',
    );
    await expect(
      page.getByRole('button', { name: 'Complete Washing', exact: true }),
    ).toBeVisible();
  } finally {
    releaseWorkspaceRefresh();
    await page.unroute(workspacePattern);
  }

  const eventPath = generatedApiPath(
    productionSubscribeChangesV1.eventStream.path,
    { locationId },
  );
  let eventAttempts = 0;
  let workspaceResponses = 0;
  page.on('response', (response) => {
    if (isWorkspaceResponse(response)) workspaceResponses += 1;
  });
  await page.route(`**${eventPath}`, async (route) => {
    eventAttempts += 1;
    if (eventAttempts === 1) {
      // Chromium treats ERR_ABORTED as a terminal client cancellation. End a
      // valid stream instead so native EventSource reconnection is exercised.
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: ': browser-e2e forced stream end\n\n',
      });
      return;
    }
    await route.fallback();
  });

  await page.reload();
  const reconnecting = page
    .getByRole('alert')
    .filter({ hasText: 'Live updates are reconnecting' });
  await expect(reconnecting).toBeVisible();
  const workspaceResponsesAfterReload = workspaceResponses;
  await expect.poll(() => eventAttempts).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => workspaceResponses)
    .toBeGreaterThan(workspaceResponsesAfterReload);
  await expect(reconnecting).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Complete Washing', exact: true }),
  ).toBeEnabled();
  await page.unroute(`**${eventPath}`);

  expect(context.pages()).toEqual([page]);
});
