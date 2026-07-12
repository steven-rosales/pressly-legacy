import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import {
  PILOT_MEMORY_FLOOR_BYTES,
  parseDockerMemUsage,
  parseDockerStatsJsonl,
  parseMemoryBytes,
  summarizeDockerStats,
} from '../scripts/docker-stats-report.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(
  new URL('../scripts/docker-stats-report.mjs', import.meta.url),
);

test.each([
  ['12B', 12],
  ['1.5kB', 1_500],
  ['1.5KB', 1_500],
  ['1.5KiB', 1_536],
  ['2MB', 2_000_000],
  ['1.25MiB', 1_310_720],
  ['1GB', 1_000_000_000],
  ['1.5GiB', 1_610_612_736],
  [' 512 MiB ', 512 * 1024 ** 2],
])('parses Docker memory value %s', (value, expectedBytes) => {
  expect(parseMemoryBytes(value)).toBe(expectedBytes);
});

test('parses current usage from Docker MemUsage and validates its limit', () => {
  expect(parseDockerMemUsage('256MiB / 4GiB')).toBe(256 * 1024 ** 2);
  expect(() => parseDockerMemUsage('256MiB / unknown')).toThrow(
    /Invalid Docker memory value/,
  );
});

test('parses JSONL records while tolerating blank lines and CRLF', () => {
  const records = parseDockerStatsJsonl(
    '  {"Name":"api","MemUsage":"1GiB / 4GiB"}\r\n\r\n' +
      '{"Name":"worker","MemUsage":"512MiB / 4GiB"}\r\n',
  );

  expect(records).toEqual([
    { memoryUsageBytes: 1024 ** 3 },
    { memoryUsageBytes: 512 * 1024 ** 2 },
  ]);
});

test('summarizes all containers against the 4 GiB pilot floor', () => {
  expect(
    summarizeDockerStats([
      { memoryUsageBytes: 1024 ** 3 },
      { memoryUsageBytes: 512 * 1024 ** 2 },
    ]),
  ).toEqual({
    snapshotType: 'steady_state',
    sizingGuarantee: false,
    containerCount: 2,
    pilotFloorBytes: 4 * 1024 ** 3,
    requiredReservePercent: 30,
    maximumSafeMeasuredPercent: 70,
    measuredBytes: 1_610_612_736,
    measuredPercent: 37.5,
    headroomBytes: 2_684_354_560,
    headroomPercent: 62.5,
    safeHeadroomObserved: true,
  });
});

test('CLI reads a JSONL path and prints the deterministic report as JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pressly-docker-stats-'));
  const statsPath = join(directory, 'stats.jsonl');

  try {
    await writeFile(
      statsPath,
      '{"Name":"api","MemUsage":"1GiB / 4GiB"}\n' +
        '{"Name":"worker","MemUsage":"512MiB / 4GiB"}\n',
      'utf8',
    );

    const { stdout, stderr } = await execFileAsync(process.execPath, [
      scriptPath,
      statsPath,
    ]);

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toMatchObject({
      snapshotType: 'steady_state',
      sizingGuarantee: false,
      containerCount: 2,
      measuredBytes: 1_610_612_736,
      headroomBytes: 2_684_354_560,
      safeHeadroomObserved: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('applies the 70% threshold to bytes rather than rounded percentages', () => {
  const greatestSafeIntegerUsage = Math.floor(
    (PILOT_MEMORY_FLOOR_BYTES * 7) / 10,
  );

  expect(
    summarizeDockerStats([{ memoryUsageBytes: greatestSafeIntegerUsage }])
      .safeHeadroomObserved,
  ).toBe(true);
  expect(
    summarizeDockerStats([{ memoryUsageBytes: greatestSafeIntegerUsage + 1 }]),
  ).toMatchObject({
    measuredPercent: 70,
    safeHeadroomObserved: false,
  });
});

test('preserves negative headroom when measured usage exceeds the floor', () => {
  expect(
    summarizeDockerStats([{ memoryUsageBytes: 5 * 1024 ** 3 }]),
  ).toMatchObject({
    measuredPercent: 125,
    headroomBytes: -(1024 ** 3),
    headroomPercent: -25,
    safeHeadroomObserved: false,
  });
});

test.each([
  [undefined, /Invalid Docker memory value/],
  ['', /Invalid Docker memory value/],
  ['1', /Invalid Docker memory value/],
  ['-1MiB', /Invalid Docker memory value/],
  ['1Gb', /Invalid Docker memory value/],
  ['1.2.3MiB', /Invalid Docker memory value/],
  ['999999999999999999GiB', /Invalid Docker memory value/],
])('rejects invalid memory value %j', (value, expectedError) => {
  expect(() => parseMemoryBytes(value)).toThrow(expectedError);
});

test.each([
  ['', /contains no records/],
  ['not-json', /JSON on line 1/],
  ['[]', /line 1 must be an object/],
  ['null', /line 1 must be an object/],
  ['{}', /line 1 is missing MemUsage/],
  ['{"MemUsage":42}', /MemUsage must be a string/],
  ['{"MemUsage":"1MiB"}', /Invalid Docker MemUsage/],
  ['{"MemUsage":"1MiB / 4GiB / 8GiB"}', /Invalid Docker MemUsage/],
])('rejects invalid Docker stats JSONL %#', (jsonl, expectedError) => {
  expect(() => parseDockerStatsJsonl(jsonl)).toThrow(expectedError);
});

test.each([
  [[], /At least one/],
  [[{}], /record 1 is invalid/],
  [[{ memoryUsageBytes: -1 }], /record 1 is invalid/],
  [[{ memoryUsageBytes: 1.5 }], /record 1 is invalid/],
])('rejects invalid normalized records %#', (records, expectedError) => {
  expect(() => summarizeDockerStats(records)).toThrow(expectedError);
});
