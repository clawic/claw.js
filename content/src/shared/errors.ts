export class ContentError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = "content_error",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorEnvelope(error: unknown, correlationId: string) {
  if (error instanceof ContentError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        correlationId,
        details: error.details ?? null,
      },
    };
  }

  return {
    error: {
      code: "internal_error",
      message: error instanceof Error ? error.message : String(error),
      correlationId,
      details: null,
    },
  };
}
