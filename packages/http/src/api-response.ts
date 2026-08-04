import type { AppError } from '@pressly/errors/app-error';
import type { JsonObject, JsonValue } from '@pressly/codec';

export type ApiSuccess<T> = Readonly<{
  ok: true;
  data: T;
  meta?: JsonObject | undefined;
}>;

export type ApiFailure = Readonly<{
  ok: false;
  error: Readonly<{
    code: string;
    message: string;
    traceId?: string | undefined;
    details?: JsonValue | undefined;
  }>;
}>;

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const apiSuccess = <T>(data: T, meta?: JsonObject): ApiSuccess<T> => ({
  ok: true,
  data,
  ...(meta === undefined ? {} : { meta }),
});

export const apiFailure = (error: AppError): ApiFailure => ({
  ok: false,
  error: {
    code: error.code,
    message: error.safeMessage,
    ...(error.traceId === undefined ? {} : { traceId: error.traceId }),
    ...(error.publicDetails === undefined
      ? {}
      : { details: error.publicDetails }),
  },
});
