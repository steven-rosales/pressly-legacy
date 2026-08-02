export {
  errorKinds,
  httpStatusCodes,
  isAppError,
  isErrorKind,
  isHttpStatusCode,
  mapUnknownError,
  makeAppError,
  normalizeUnknownError,
} from './app-error.js';

export {
  authError,
  configError,
  conflictError,
  databaseError,
  externalServiceError,
  invariantViolationError,
  notFoundError,
  permissionError,
  rateLimitError,
  unexpectedError,
  validationError,
} from './factories.js';

export { presentAppError } from './presentation.js';

export type {
  AppError,
  ErrorCode,
  ErrorKind,
  HttpStatusCode,
  MakeAppErrorInput,
} from './app-error.js';

export type {
  AppErrorFactoryInput,
  DatabaseErrorStatus,
  ExternalServiceErrorStatus,
  ValidationErrorStatus,
} from './factories.js';

export type { PresentAppErrorOptions } from './presentation.js';
