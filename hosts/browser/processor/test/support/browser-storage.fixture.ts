export const browserStorageFixture = (storage: Storage) =>
  Object.freeze({
    read: (key: string) => storage.getItem(key),
    write: (key: string, value: string) => storage.setItem(key, value),
    remove: (key: string) => storage.removeItem(key),
  });
