import type { Handler, ApiContext, CommitResponse } from '../../types/api';
import type { InternalCommitRequest } from '../../types/internal';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';

/**
 * Handle commit endpoint requests
 * Requires DID authentication
 */
export const handleCommit: Handler<ApiContext, InternalCommitRequest, CommitResponse> = async (ctx, req) => {
  try {
    if (!req.subRav) {
      throw new PaymentKitError(
        ErrorCode.BAD_REQUEST,
        'subRav required',
        400
      );
    }

    try {
      await ctx.payeeClient.processSignedSubRAV(req.subRav);
      return createSuccessResponse({ success: true });
    } catch (e) {
      throw new PaymentKitError(
        ErrorCode.CONFLICT,
        (e as Error).message,
        409
      );
    }
  } catch (error) {
    if (error instanceof PaymentKitError) {
      throw error;
    }
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to commit SubRAV',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};