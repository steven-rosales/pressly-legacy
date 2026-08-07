import {
  productionBoardSchema,
  productionRunBoardParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  toLoadProductionBoardCommand,
  toProductionBoardResult,
} from './load-production-board.contract.mapper.ts';
import type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoardController = (
  loadBoard: LoadProductionBoard,
) =>
  defineValidatedController({
    request: { params: productionRunBoardParamsSchema },
    handle: async ({ params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await loadBoard(toLoadProductionBoardCommand(params)),
        {
          schema: productionBoardSchema,
          present: toProductionBoardResult,
        },
      );
    },
  });
