import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export class AppException extends HttpException {
  constructor(code: ErrorCode, message: string, status: number) {
    super({ code, message }, status);
  }

  static conflict(message: string) {
    return new AppException(ErrorCode.CONFLICT, message, HttpStatus.CONFLICT);
  }

  static unauthorized(message: string) {
    return new AppException(
      ErrorCode.UNAUTHORIZED,
      message,
      HttpStatus.UNAUTHORIZED,
    );
  }

  static forbidden(message: string) {
    return new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static notFound(message: string) {
    return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static badRequest(message: string) {
    return new AppException(
      ErrorCode.VALIDATION_ERROR,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  static businessRule(message: string) {
    return new AppException(
      ErrorCode.BUSINESS_RULE,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  static rateLimited(message: string) {
    return new AppException(
      ErrorCode.RATE_LIMITED,
      message,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
