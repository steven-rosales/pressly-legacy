import { getOrCreateBrowserId } from '@/composition/browser-ids';

const storageKey = 'pressly:test-browser-id';

describe('getOrCreateBrowserId', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps an existing browser ID without generating another value', () => {
    window.localStorage.setItem(storageKey, 'existing-id');
    const randomUUID = vi.fn(() => 'unused-id');
    vi.stubGlobal('crypto', { randomUUID });

    expect(getOrCreateBrowserId(storageKey)).toBe('existing-id');
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('generates and persists a secure browser ID with randomUUID', () => {
    const randomUUID = vi.fn(() => 'secure-random-id');
    vi.stubGlobal('crypto', { randomUUID });

    expect(getOrCreateBrowserId(storageKey)).toBe('secure-random-id');
    expect(window.localStorage.getItem(storageKey)).toBe('secure-random-id');
  });

  it('uses cryptographically secure bytes when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
        0x0c, 0x0d, 0x0e, 0x0f,
      ]);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    expect(getOrCreateBrowserId(storageKey)).toBe(
      '000102030405060708090a0b0c0d0e0f',
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it('returns the explicit fallback when secure randomness fails', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new DOMException('Randomness unavailable', 'OperationError');
      },
    });

    expect(getOrCreateBrowserId(storageKey)).toBe('unavailable');
    expect(window.localStorage.getItem(storageKey)).toBe('unavailable');
  });
});
