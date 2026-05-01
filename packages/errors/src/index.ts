export {
  isAppError,
  makeAppError,
  normalizeUnknownError,
  AppException,
} from './app-error.js';

export { andThen, err, mapError, mapResult, ok } from './result.js';

export {
  conflictError,
  notFoundError,
  permissionError,
  validationError,
} from './factories.js';

export type {
  AppError,
  ErrorCode,
  ErrorKind,
  HttpStatusCode,
  MakeAppErrorInput,
} from './app-error.js';

export type { Err, Ok, Result } from './result.js';
