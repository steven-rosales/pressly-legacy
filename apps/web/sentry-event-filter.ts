type HeaderMap = Record<string, unknown>;

type WebSentryEvent = {
  tags?: Record<string, unknown>;
  request?: {
    cookies?: unknown;
    headers?: HeaderMap;
  };
};

const removeHeader = (headers: HeaderMap, key: string): void => {
  for (const header of Object.keys(headers)) {
    if (header.toLowerCase() === key) delete headers[header];
  }
};

const scrubRequest = (event: WebSentryEvent): void => {
  if (event.request === undefined) return;

  delete event.request.cookies;

  if (event.request.headers === undefined) return;

  removeHeader(event.request.headers, 'authorization');
  removeHeader(event.request.headers, 'cookie');
};

const isPolicyReported = (event: WebSentryEvent): boolean =>
  event.tags?.['source'] === 'web' && typeof event.tags['reason'] === 'string';

export const filterPolicyReportedSentryEvent = <T extends WebSentryEvent>(
  event: T,
): T | null => {
  scrubRequest(event);
  return isPolicyReported(event) ? event : null;
};
