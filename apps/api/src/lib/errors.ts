/** Base application error with an HTTP status and machine-readable code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 500, code = 'internal_error') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(message, 400, 'validation_error');
    this.name = 'ValidationError';
    (this as { details?: unknown }).details = details;
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'unauthorized');
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(message, 403, 'forbidden');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'not_found');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'rate_limited');
    this.name = 'RateLimitError';
  }
}

/** Normalized AI provider errors (spec §6.4). */
export class ProviderError extends AppError {
  readonly provider: string;
  readonly kind: 'auth' | 'rate_limit' | 'timeout' | 'availability' | 'invalid_request' | 'unknown';

  constructor(
    provider: string,
    kind: ProviderError['kind'],
    message: string,
    statusCode = 502,
  ) {
    super(message, statusCode, `provider_${kind}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
  }
}
