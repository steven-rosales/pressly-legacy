import { vi } from 'vitest';

export type TestHttpResponse = Readonly<{
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}>;

export const waitForController = async (): Promise<void> => {
  await Promise.resolve();
};

export const makeHttpResponse = (): TestHttpResponse => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response;
};
