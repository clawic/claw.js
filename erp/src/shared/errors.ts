export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  correlationId: string;
}

export class ErpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: Record<string, unknown>,
    public readonly fieldErrors?: Record<string, string>,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function errorEnvelope(error: unknown, correlationId: string): ErrorEnvelope {
  if (error instanceof ErpError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable,
      correlationId,
    };
  }
  return {
    code: "internal_error",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    correlationId,
  };
}
