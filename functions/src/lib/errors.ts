// エラーハンドリング

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('INVALID_ARGUMENT', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: any) {
    super('NOT_FOUND', message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string, details?: any) {
    super('PERMISSION_DENIED', message, 403, details);
    this.name = 'PermissionDeniedError';
  }
}

export class AlreadyExistsError extends AppError {
  constructor(message: string, details?: any) {
    super('ALREADY_EXISTS', message, 409, details);
    this.name = 'AlreadyExistsError';
  }
}

export class FailedPreconditionError extends AppError {
  constructor(message: string, details?: any) {
    super('FAILED_PRECONDITION', message, 412, details);
    this.name = 'FailedPreconditionError';
  }
}

