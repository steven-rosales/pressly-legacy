import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const collectionPath = resolve(
  root,
  'tooling/cents-webhook.postman_collection.json',
);
const environmentPath = resolve(
  root,
  'tooling/cents-webhook.postman_environment.example.json',
);
const runbookPath = resolve(root, 'docs/runbooks/cents-webhook.md');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const collection = readJson(collectionPath);
const environment = readJson(environmentPath);
const runbook = readFileSync(runbookPath, 'utf8');

const expectedCaseIds = [
  'valid_signature',
  'wrong_key',
  'modified_body',
  'stale_timestamp',
  'order_event',
  'duplicate_delivery',
  'customer_event',
  'marketing_event',
];

const descriptionMetadata = (description) => {
  const lines = description.split('\n');
  const caseLine = lines.find((line) => line.startsWith('Proof case: '));
  const mappings = lines
    .filter((line) => line.startsWith('Automated equivalent: '))
    .map((line) => line.slice('Automated equivalent: '.length))
    .map((mapping) => {
      const separator = mapping.indexOf(' :: ');
      if (separator === -1)
        throw new Error(`Invalid proof mapping: ${mapping}`);
      return {
        file: mapping.slice(0, separator),
        assertion: mapping.slice(separator + 4),
      };
    });

  if (caseLine === undefined)
    throw new Error(`Missing proof case metadata in: ${description}`);

  return {
    caseId: caseLine.slice('Proof case: '.length),
    mappings,
  };
};

const itemsByCase = new Map(
  collection.item.map((item) => [
    descriptionMetadata(item.request.description).caseId,
    item,
  ]),
);

const resolveBodyVariables = (rawBody) =>
  rawBody.replaceAll('{{cents_test_store_id}}', 'tooling-store-001');

const preRequestScript = collection.event
  .find((event) => event.listen === 'prerequest')
  .script.exec.join('\n');

const makeCryptoJs = () => ({
  enc: {
    Hex: 'hex',
    Utf8: {
      parse: (value) => ({ sigBytes: Buffer.byteLength(value, 'utf8') }),
    },
  },
  HmacSHA256: (message, key) => ({
    toString: (encoding) => {
      if (encoding !== 'hex') throw new Error('Expected hexadecimal output.');
      return createHmac('sha256', key).update(message, 'utf8').digest('hex');
    },
  }),
});

const executePreRequest = ({ mode, rawBody, key, nowMilliseconds }) => {
  const headers = new Map([['x-pressly-proof-mode', mode]]);
  const normalizeHeader = (name) => name.toLowerCase();
  const pm = {
    expect: {
      fail: (message) => {
        throw new Error(message);
      },
    },
    require: (specifier) => {
      if (specifier !== 'npm:crypto-js@4.2.0')
        throw new Error(`Unexpected package: ${specifier}`);
      return makeCryptoJs();
    },
    environment: {
      get: (name) => (name === 'cents_hmac_key' ? key : undefined),
    },
    variables: {
      replaceIn: resolveBodyVariables,
    },
    request: {
      body: { mode: 'raw', raw: rawBody },
      headers: {
        get: (name) => headers.get(normalizeHeader(name)),
        remove: (name) => headers.delete(normalizeHeader(name)),
        upsert: ({ key: headerName, value }) =>
          headers.set(normalizeHeader(headerName), value),
      },
    },
  };
  class FixedDate extends Date {
    static now() {
      return nowMilliseconds;
    }
  }

  runInNewContext(preRequestScript, { Date: FixedDate, pm });
  return headers;
};

describe('Cents webhook Postman proof assets', () => {
  it('parses one local-only request for every required GUI case', () => {
    expect(collection.info.schema).toBe(
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    );
    expect([...itemsByCase.keys()].sort()).toEqual([...expectedCaseIds].sort());
    expect(collection.item).toHaveLength(expectedCaseIds.length);

    for (const item of collection.item) {
      expect(item.request.method).toBe('POST');
      expect(item.request.url.raw).toBe('{{base_url}}/webhooks/cents');
      expect(item.request.body.mode).toBe('raw');
      expect(() =>
        JSON.parse(resolveBodyVariables(item.request.body.raw)),
      ).not.toThrow();
      expect(
        item.request.header.some(
          (header) =>
            header.key === 'Content-Type' &&
            header.value === 'application/json',
        ),
      ).toBe(true);
      expect(
        item.request.header.some(
          (header) => header.key === 'X-Pressly-Proof-Mode',
        ),
      ).toBe(true);
      expect(item.event.some((event) => event.listen === 'test')).toBe(true);
    }
  });

  it('computes the exact timestamp-dot-raw-body HMAC for each security mode', () => {
    const rawBody = itemsByCase.get('valid_signature').request.body.raw;
    const resolvedBody = resolveBodyVariables(rawBody);
    const key = 'deterministic-tooling-hmac-key-000000000001';
    const nowMilliseconds = Date.parse('2026-07-12T16:00:00.000Z');
    const nowSeconds = Math.floor(nowMilliseconds / 1_000);

    const validHeaders = executePreRequest({
      mode: 'valid',
      rawBody,
      key,
      nowMilliseconds,
    });
    const validTimestamp = String(nowSeconds);
    const validSignature = createHmac('sha256', key)
      .update(`${validTimestamp}.${resolvedBody}`, 'utf8')
      .digest('hex');
    expect(validHeaders.get('x-cents-timestamp')).toBe(validTimestamp);
    expect(validHeaders.get('x-cents-signature')).toBe(`v1=${validSignature}`);
    expect(validHeaders.has('x-pressly-proof-mode')).toBe(false);

    const wrongHeaders = executePreRequest({
      mode: 'wrong_key',
      rawBody,
      key,
      nowMilliseconds,
    });
    const wrongSignature = createHmac(
      'sha256',
      'postman-negative-fixture-key-not-a-secret-0001',
    )
      .update(`${validTimestamp}.${resolvedBody}`, 'utf8')
      .digest('hex');
    expect(wrongHeaders.get('x-cents-signature')).toBe(`v1=${wrongSignature}`);
    expect(wrongHeaders.get('x-cents-signature')).not.toBe(
      validHeaders.get('x-cents-signature'),
    );

    const modifiedHeaders = executePreRequest({
      mode: 'modified_body',
      rawBody,
      key,
      nowMilliseconds,
    });
    const modifiedSignature = createHmac('sha256', key)
      .update(`${validTimestamp}.${resolvedBody} `, 'utf8')
      .digest('hex');
    expect(modifiedHeaders.get('x-cents-signature')).toBe(
      `v1=${modifiedSignature}`,
    );
    expect(modifiedHeaders.get('x-cents-signature')).not.toBe(
      validHeaders.get('x-cents-signature'),
    );

    const staleHeaders = executePreRequest({
      mode: 'stale',
      rawBody,
      key,
      nowMilliseconds,
    });
    const staleTimestamp = String(nowSeconds - 301);
    const staleSignature = createHmac('sha256', key)
      .update(`${staleTimestamp}.${resolvedBody}`, 'utf8')
      .digest('hex');
    expect(staleHeaders.get('x-cents-timestamp')).toBe(staleTimestamp);
    expect(staleHeaders.get('x-cents-signature')).toBe(`v1=${staleSignature}`);
  });

  it('fails unsupported proof modes and unusable keys through the Postman assertion boundary', () => {
    const input = {
      rawBody: itemsByCase.get('valid_signature').request.body.raw,
      key: 'deterministic-tooling-hmac-key-000000000001',
      nowMilliseconds: Date.parse('2026-07-12T16:00:00.000Z'),
    };

    expect(() => executePreRequest({ ...input, mode: 'unsupported' })).toThrow(
      /Unsupported Pressly proof mode/,
    );
    expect(() =>
      executePreRequest({ ...input, mode: 'valid', key: 'too-short' }),
    ).toThrow(/at least 32 UTF-8 bytes/);
  });

  it('uses an unusable key placeholder, localhost URL, and synthetic non-PII defaults', () => {
    const environmentValues = new Map(
      environment.values.map((entry) => [entry.key, entry]),
    );
    expect(environmentValues.get('base_url')).toMatchObject({
      value: 'http://localhost:4000',
      type: 'default',
    });
    expect(environmentValues.get('cents_hmac_key')).toMatchObject({
      value: '<set-local-only>',
      type: 'secret',
    });
    expect(
      Buffer.byteLength(environmentValues.get('cents_hmac_key').value, 'utf8'),
    ).toBeLessThan(32);
    expect(environmentValues.get('cents_test_store_id')).toMatchObject({
      value: 'tooling-store-001',
      type: 'default',
    });

    const serializedEnvironment = JSON.stringify(environment);
    const serializedCollection = JSON.stringify(collection);
    for (const serialized of [serializedEnvironment, serializedCollection]) {
      expect(serialized).not.toMatch(/AKIA[0-9A-Z]{16}/);
      expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._~-]+/i);
      expect(serialized).not.toMatch(/https?:\/\/[^"}]*trypressly\.com/i);
      expect(serialized).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
    }

    for (const item of collection.item) {
      const payload = JSON.parse(resolveBodyVariables(item.request.body.raw));
      const serializedPayload = JSON.stringify(payload);
      expect(serializedPayload).not.toMatch(
        /"(?:email|phoneNumber|firstName|lastName|address)"/,
      );
      expect(serializedPayload).not.toMatch(/@[A-Za-z0-9.-]+/);
      expect(serializedPayload).toContain('synthetic');
    }
  });

  it('keeps the duplicate delivery byte-identical to its original order', () => {
    expect(itemsByCase.get('duplicate_delivery').request.body.raw).toBe(
      itemsByCase.get('order_event').request.body.raw,
    );
  });

  it('uses exact submitted candidates for positive order cases and ignored receipts for non-order cases', () => {
    for (const caseId of [
      'valid_signature',
      'order_event',
      'duplicate_delivery',
    ]) {
      const payload = JSON.parse(
        resolveBodyVariables(itemsByCase.get(caseId).request.body.raw),
      );
      expect(payload.order.status).toBe('SUBMITTED');
    }

    for (const caseId of ['customer_event', 'marketing_event']) {
      const script = itemsByCase
        .get(caseId)
        .event.find((event) => event.listen === 'test')
        .script.exec.join('\n');
      expect(script).toContain("response.data.status).to.eql('ignored')");
      expect(script).not.toContain("response.data.status).to.eql('pending')");
    }
  });

  it('maps every GUI case to an existing automated assertion', () => {
    for (const caseId of expectedCaseIds) {
      const item = itemsByCase.get(caseId);
      const metadata = descriptionMetadata(item.request.description);
      expect(metadata.mappings.length).toBeGreaterThan(0);

      for (const mapping of metadata.mappings) {
        const testPath = resolve(root, mapping.file);
        expect(existsSync(testPath), `${caseId}: ${mapping.file}`).toBe(true);
        expect(
          readFileSync(testPath, 'utf8'),
          `${caseId}: ${mapping.assertion}`,
        ).toContain(mapping.assertion);
      }

      expect(runbook).toContain(`\`${caseId}\``);
    }
  });

  it('documents the exact signing boundary and local-only handling', () => {
    expect(runbook).toContain('<timestamp>.<exact raw HTTP body>');
    expect(runbook).toContain('more than 300 seconds');
    expect(runbook).toContain('Never commit or export');
    expect(runbook).toContain('Do not point it at production');
    expect(runbook).toContain('exact `SUBMITTED`');
    expect(runbook).toContain(
      'An HTTP `202` therefore proves durable ingress, not canonical Order creation.',
    );
    expect(runbook).toContain('pnpm exec vitest run tooling/test/');
  });
});
