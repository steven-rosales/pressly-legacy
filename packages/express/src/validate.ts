import type { RequestHandler } from 'express';
import { catchAsync } from './catch-async.ts';
import { makeAppError } from '@pressly/errors';

type ParseIssue = {
  path: PropertyKey[];
  message: string;
};

type ParseResult =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: {
        issues: ParseIssue[];
      };
    };

type RequestSchema = {
  safeParseAsync(input: unknown): Promise<ParseResult>;
};

type SchemaConfig = {
  body?: RequestSchema;
  query?: RequestSchema;
  params?: RequestSchema;
};

type ValidationIssue = {
  path: string;
  message: string;
};

const mapParseIssues = (issues: ParseIssue[]): ValidationIssue[] =>
  issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));

export const validateRequest = (schema: SchemaConfig): RequestHandler => {
  return catchAsync(async (req, _, next) => {
    if (schema.body) {
      const bodyResult = await schema.body.safeParseAsync(req.body);

      if (!bodyResult.success) {
        const details = {
          location: 'body' as const,
          issues: mapParseIssues(bodyResult.error.issues),
        };

        throw makeAppError({
          kind: 'ValidationError',
          code: 'invalid_body_type',
          message: 'Validation body failed.',
          status: 400,
          details,
        });
      }

      req.body = bodyResult.data as typeof req.body;
    }

    if (schema.query) {
      const queryResult = await schema.query.safeParseAsync(req.query);

      if (!queryResult.success) {
        const details = {
          location: 'query' as const,
          issues: mapParseIssues(queryResult.error.issues),
        };

        throw makeAppError({
          kind: 'ValidationError',
          code: 'invalid_query_type',
          message: 'Validation query failed.',
          status: 400,
          details,
        });
      }

      Object.defineProperty(req, 'query', {
        value: queryResult.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (schema.params) {
      const paramsResult = await schema.params.safeParseAsync(req.params);

      if (!paramsResult.success) {
        const details = {
          location: 'params' as const,
          issues: mapParseIssues(paramsResult.error.issues),
        };

        throw makeAppError({
          kind: 'ValidationError',
          code: 'invalid_params_type',
          message: 'Validation params failed.',
          status: 400,
          details,
        });
      }

      req.params = paramsResult.data as typeof req.params;
    }

    next();
  });
};
