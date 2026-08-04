import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { toolingError } from '../../packages/errors/src/tooling-error.mjs';

export const PILOT_MEMORY_FLOOR_BYTES = 4 * 1024 ** 3;
export const REQUIRED_RESERVE_PERCENT = 30;
export const MAXIMUM_SAFE_MEASURED_PERCENT = 100 - REQUIRED_RESERVE_PERCENT;

const bytesByUnit = Object.freeze({
  B: 1,
  kB: 1_000,
  KB: 1_000,
  KiB: 1024,
  MB: 1_000_000,
  MiB: 1024 ** 2,
  GB: 1_000_000_000,
  GiB: 1024 ** 3,
});

const memoryValuePattern =
  /^([0-9]+(?:\.[0-9]+)?)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)$/;
const maximumSafeMeasuredBytes = Math.floor(
  (PILOT_MEMORY_FLOOR_BYTES * MAXIMUM_SAFE_MEASURED_PERCENT) / 100,
);

const invalidMemoryValue = (value) =>
  toolingError({
    code: 'invalid_docker_memory_value',
    message: `Invalid Docker memory value: ${JSON.stringify(value)}.`,
  });

export const parseMemoryBytes = (value) => {
  if (typeof value !== 'string') throw invalidMemoryValue(value);

  const match = memoryValuePattern.exec(value.trim());
  if (match === null) throw invalidMemoryValue(value);

  const bytes = Number(match[1]) * bytesByUnit[match[2]];
  if (!Number.isFinite(bytes) || bytes > Number.MAX_SAFE_INTEGER)
    throw invalidMemoryValue(value);

  return Math.round(bytes);
};

export const parseDockerMemUsage = (value) => {
  if (typeof value !== 'string')
    throw toolingError({
      code: 'invalid_docker_memory_usage_type',
      message: 'Docker MemUsage must be a string.',
    });

  const parts = value.split('/');
  if (parts.length !== 2)
    throw toolingError({
      code: 'invalid_docker_memory_usage',
      message: `Invalid Docker MemUsage: ${JSON.stringify(value)}.`,
    });

  const measuredBytes = parseMemoryBytes(parts[0]);
  parseMemoryBytes(parts[1]);

  return measuredBytes;
};

export const parseDockerStatsJsonl = (jsonl) => {
  if (typeof jsonl !== 'string')
    throw toolingError({
      code: 'invalid_docker_stats_jsonl_type',
      message: 'Docker stats JSONL must be a string.',
    });

  const records = [];

  for (const [index, rawLine] of jsonl.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw toolingError({
        code: 'invalid_docker_stats_json',
        message: `Invalid Docker stats JSON on line ${index + 1}.`,
      });
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw toolingError({
        code: 'invalid_docker_stats_record_type',
        message: `Docker stats line ${index + 1} must be an object.`,
      });

    if (!Object.hasOwn(value, 'MemUsage'))
      throw toolingError({
        code: 'missing_docker_memory_usage',
        message: `Docker stats line ${index + 1} is missing MemUsage.`,
      });

    try {
      records.push({
        memoryUsageBytes: parseDockerMemUsage(value.MemUsage),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw toolingError({
        code: 'invalid_docker_stats_memory_usage',
        message: `Docker stats line ${index + 1}: ${message}`,
        cause: error,
      });
    }
  }

  if (records.length === 0)
    throw toolingError({
      code: 'empty_docker_stats_jsonl',
      message: 'Docker stats JSONL contains no records.',
    });

  return records;
};

const roundPercent = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export const summarizeDockerStats = (records) => {
  if (!Array.isArray(records) || records.length === 0)
    throw toolingError({
      code: 'missing_docker_stats_records',
      message: 'At least one Docker stats record is required.',
    });

  let measuredBytes = 0;

  for (const [index, record] of records.entries()) {
    if (
      typeof record !== 'object' ||
      record === null ||
      !Number.isSafeInteger(record.memoryUsageBytes) ||
      record.memoryUsageBytes < 0
    ) {
      throw toolingError({
        code: 'invalid_docker_stats_record',
        message: `Docker stats record ${index + 1} is invalid.`,
      });
    }

    measuredBytes += record.memoryUsageBytes;
    if (!Number.isSafeInteger(measuredBytes))
      throw toolingError({
        code: 'unsafe_docker_memory_total',
        message: 'Total Docker memory usage exceeds the safe range.',
      });
  }

  const headroomBytes = PILOT_MEMORY_FLOOR_BYTES - measuredBytes;

  // This is one steady-state observation, not proof that the topology is
  // correctly sized for production peaks. The pilot reserve is observed only
  // when measured usage is at most 70% of the 4 GiB comparison floor.
  return {
    snapshotType: 'steady_state',
    sizingGuarantee: false,
    containerCount: records.length,
    pilotFloorBytes: PILOT_MEMORY_FLOOR_BYTES,
    requiredReservePercent: REQUIRED_RESERVE_PERCENT,
    maximumSafeMeasuredPercent: MAXIMUM_SAFE_MEASURED_PERCENT,
    measuredBytes,
    measuredPercent: roundPercent(
      (measuredBytes / PILOT_MEMORY_FLOOR_BYTES) * 100,
    ),
    headroomBytes,
    headroomPercent: roundPercent(
      (headroomBytes / PILOT_MEMORY_FLOOR_BYTES) * 100,
    ),
    safeHeadroomObserved: measuredBytes <= maximumSafeMeasuredBytes,
  };
};

const main = async () => {
  const [path, ...unexpectedArguments] = process.argv.slice(2);
  if (path === undefined || unexpectedArguments.length > 0)
    throw toolingError({
      code: 'invalid_docker_stats_report_arguments',
      message: 'Usage: docker-stats-report.mjs <docker-stats.jsonl>',
    });

  const records = parseDockerStatsJsonl(await readFile(path, 'utf8'));
  process.stdout.write(
    `${JSON.stringify(summarizeDockerStats(records), null, 2)}\n`,
  );
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
