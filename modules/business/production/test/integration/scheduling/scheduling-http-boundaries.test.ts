import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { result } from '@pressly/kernel';
import express, { type RequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcceptSchedule } from '../../../src/features/scheduling/accept-schedule/accept-schedule.port.ts';
import { makeAcceptScheduleRoute } from '../../../src/features/scheduling/accept-schedule/accept-schedule.route.ts';
import type { CreateSchedule } from '../../../src/features/scheduling/create-schedule/create-schedule.port.ts';
import { makeCreateScheduleRoute } from '../../../src/features/scheduling/create-schedule/create-schedule.route.ts';
import type { LoadSchedule } from '../../../src/features/scheduling/load-schedule/load-schedule.port.ts';
import { makeLoadScheduleRoute } from '../../../src/features/scheduling/load-schedule/load-schedule.route.ts';
import type { StartSchedule } from '../../../src/features/scheduling/start-schedule/start-schedule.port.ts';
import { makeStartScheduleRoute } from '../../../src/features/scheduling/start-schedule/start-schedule.route.ts';
import { scheduleProposalFixture } from '../../support/schedule.fixture.ts';

const locationId = 'location-1';
const actorId = '00000000-0000-4000-8000-000000000010';
const schedule = scheduleProposalFixture();
const servers: Server[] = [];

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe('schedule HTTP boundaries', () => {
  it('preserves lifecycle URLs, statuses, commands, and serialized results', async () => {
    const createSchedule = vi
      .fn<CreateSchedule>()
      .mockResolvedValue(result.ok(schedule));
    const loadSchedule = vi
      .fn<LoadSchedule>()
      .mockResolvedValue(result.ok(schedule));
    const acceptSchedule = vi.fn<AcceptSchedule>().mockResolvedValue(
      result.ok({
        scheduleRunId: schedule.scheduleRunId,
        productionShiftId: schedule.productionShiftId,
        acceptedAt: '2026-08-02T15:30:00.000Z',
        replayed: false,
      }),
    );
    const startSchedule = vi.fn<StartSchedule>().mockResolvedValue(
      result.ok({
        scheduleRunId: schedule.scheduleRunId,
        productionRunId: '00000000-0000-4000-8000-000000000011',
        productionBatchIds: ['00000000-0000-4000-8000-000000000012'],
        queueVersion: 1,
        startedAt: '2026-08-02T16:00:00.000Z',
        replayed: false,
      }),
    );
    const authenticate: RequestHandler = (_request, _response, next) => next();
    const authorize: RequestHandler = (_request, _response, next) => next();
    const security = { authenticate, authorize };
    const app = express();
    app.use(express.json());
    app.use(
      makeCreateScheduleRoute({
        ...security,
        createSchedule,
        readActorId: () => actorId,
      }),
      makeLoadScheduleRoute({ ...security, loadSchedule }),
      makeAcceptScheduleRoute({
        ...security,
        acceptSchedule,
        readActorId: () => actorId,
      }),
      makeStartScheduleRoute({
        ...security,
        startSchedule,
        readActorId: () => actorId,
      }),
    );
    const baseUrl = await start(app);
    const scheduleUrl = `${baseUrl}/production/locations/${locationId}/schedules/${schedule.scheduleRunId}`;

    const created = await fetch(
      `${baseUrl}/production/locations/${locationId}/schedules`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionShiftId: schedule.productionShiftId,
          schedulerConfigId: schedule.schedulerConfigId,
          idempotencyKey: 'schedule-create-1',
        }),
      },
    );
    const loaded = await fetch(scheduleUrl);
    const accepted = await fetch(`${scheduleUrl}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedOutputPlanHash: schedule.outputPlanHash,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
        idempotencyKey: 'schedule-accept-1',
      }),
    });
    const started = await fetch(`${scheduleUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedOutputPlanHash: schedule.outputPlanHash,
        idempotencyKey: 'schedule-start-1',
      }),
    });

    expect([
      created.status,
      loaded.status,
      accepted.status,
      started.status,
    ]).toEqual([201, 200, 201, 201]);
    await expect(created.json()).resolves.toMatchObject({
      ok: true,
      data: { scheduleRunId: schedule.scheduleRunId },
    });
    await expect(loaded.json()).resolves.toMatchObject({
      ok: true,
      data: { scheduleRunId: schedule.scheduleRunId },
    });
    await expect(accepted.json()).resolves.toMatchObject({
      ok: true,
      data: { acceptedAt: '2026-08-02T15:30:00.000Z' },
    });
    await expect(started.json()).resolves.toMatchObject({
      ok: true,
      data: { startedAt: '2026-08-02T16:00:00.000Z' },
    });
    expect(createSchedule).toHaveBeenCalledWith({
      locationId,
      productionShiftId: schedule.productionShiftId,
      schedulerConfigId: schedule.schedulerConfigId,
      idempotencyKey: 'schedule-create-1',
      actorId,
    });
    expect(loadSchedule).toHaveBeenCalledWith({
      locationId,
      scheduleRunId: schedule.scheduleRunId,
    });
    expect(acceptSchedule).toHaveBeenCalledWith({
      locationId,
      scheduleRunId: schedule.scheduleRunId,
      expectedOutputPlanHash: schedule.outputPlanHash,
      acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
      idempotencyKey: 'schedule-accept-1',
      actorId,
    });
    expect(startSchedule).toHaveBeenCalledWith({
      locationId,
      scheduleRunId: schedule.scheduleRunId,
      expectedOutputPlanHash: schedule.outputPlanHash,
      idempotencyKey: 'schedule-start-1',
      actorId,
    });
  });
});
