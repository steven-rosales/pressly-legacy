import {
  productionBoardSchema,
  productionRunBoardParamsSchema,
} from './load-production-board.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toLoadProductionBoardCommand,
  toProductionBoardResult,
} from './load-production-board.contract.mapper.ts';
import type { LoadProductionBoard } from './load-production-board.port.ts';

export const loadProductionBoardBoundary = defineRequestBoundary({
  params: productionRunBoardParamsSchema,
});

export const makeLoadProductionBoardController = (
  loadBoard: LoadProductionBoard,
): RequestHandler =>
  loadProductionBoardBoundary.handler(async ({ params }, { response }) => {
    sendValidatedProductionResult(
      response,
      await loadBoard(toLoadProductionBoardCommand(params)),
      {
        schema: productionBoardSchema,
        present: toProductionBoardResult,
      },
    );
  });
