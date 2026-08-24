import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test as base,
  type Page,
  type Response,
} from '@playwright/test';
import { toolingError } from '@pressly/errors/tooling-error';
import { allowedBrowserHostnames } from './environment';

export type BrowserDiagnostics = Readonly<{
  problems: readonly string[];
  allowResponse: (predicate: (response: Response) => boolean) => void;
}>;

export const monitorBrowserPage = (page: Page): BrowserDiagnostics => {
  const problems: string[] = [];
  const allowedResponses: Array<(response: Response) => boolean> = [];
  page.on('pageerror', (error) =>
    problems.push(`page error: ${error.message}`),
  );
  page.on('console', (message) => {
    const isBrowserHttpDiagnostic = message
      .text()
      .startsWith(
        'Failed to load resource: the server responded with a status of',
      );
    if (
      !isBrowserHttpDiagnostic &&
      (message.type() === 'error' || message.type() === 'warning')
    ) {
      problems.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !allowedBrowserHostnames.has(url.hostname)
    ) {
      problems.push(`unexpected external request: ${url.origin}`);
    }
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown failure';
    if (!reason.includes('ERR_ABORTED')) {
      problems.push(
        `request failed: ${request.method()} ${request.url()} (${reason})`,
      );
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    const isFirstParty = allowedBrowserHostnames.has(url.hostname);
    const isAllowed = allowedResponses.some((predicate) => predicate(response));
    if (
      response.status() >= 500 ||
      (isFirstParty && response.status() >= 400 && !isAllowed)
    ) {
      problems.push(`server response: ${response.status()} ${response.url()}`);
    }
  });

  return {
    problems,
    allowResponse: (predicate) => allowedResponses.push(predicate),
  };
};

export const test = base.extend<{ browserDiagnostics: BrowserDiagnostics }>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const diagnostics = monitorBrowserPage(page);
      await use(diagnostics);
      expect(
        diagnostics.problems,
        'browser diagnostics must remain clean',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export type BrowserJsonResponse = Readonly<{
  status: number;
  body: unknown;
}>;

export const successfulResponseData = (response: BrowserJsonResponse) => {
  if (
    typeof response.body !== 'object' ||
    response.body === null ||
    !('ok' in response.body) ||
    response.body.ok !== true ||
    !('data' in response.body)
  ) {
    throw toolingError({
      code: 'invalid_success_response_envelope',
      message: 'Expected a successful Pressly API response envelope.',
    });
  }
  return response.body.data;
};

export const fetchSameOriginJson = async (
  page: Page,
  path: `/${string}`,
  init?: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: unknown;
  }>,
): Promise<BrowserJsonResponse> =>
  page.evaluate(
    async ({ requestPath, requestInit }) => {
      const encodedBody =
        requestInit?.body === undefined
          ? undefined
          : JSON.stringify(requestInit.body);
      const response = await fetch(requestPath, {
        ...(requestInit?.method === undefined
          ? {}
          : { method: requestInit.method }),
        headers: {
          Accept: 'application/json',
          ...(encodedBody === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...requestInit?.headers,
        },
        ...(encodedBody === undefined ? {} : { body: encodedBody }),
        credentials: 'same-origin',
      });
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    { requestPath: path, requestInit: init },
  );

export const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const boundedSurfaceSelector = [
      'main',
      '[role="dialog"]',
      '[data-slot="sheet-content"]',
      '[data-slot="dialog-content"]',
      '[data-slot="table-container"]',
    ].join(',');
    const clippedSurfaces = [
      ...document.querySelectorAll<HTMLElement>(boundedSurfaceSelector),
    ]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden')
          return false;
        const bounds = element.getBoundingClientRect();
        return (
          bounds.width > 0 && (bounds.left < -1 || bounds.right > viewport + 1)
        );
      })
      .map((element) => ({
        element:
          element.getAttribute('data-slot') ??
          element.getAttribute('role') ??
          element.tagName.toLowerCase(),
        bounds: element.getBoundingClientRect().toJSON(),
      }));

    return {
      viewport,
      content: document.documentElement.scrollWidth,
      clippedSurfaces,
    };
  });
  expect(
    overflow.content,
    'page content must fit the viewport',
  ).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(
    overflow.clippedSurfaces,
    'visible workspace surfaces must remain inside the viewport',
  ).toEqual([]);
};

export const expectAccessiblePage = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations, 'WCAG A/AA violations').toEqual([]);
};
