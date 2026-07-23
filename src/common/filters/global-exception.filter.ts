import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-code.enum';

interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);

    if (normalized.status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${normalized.status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(normalized.status).json({
      success: false,
      error: { code: normalized.code, message: normalized.message },
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests, please try again later.',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null && 'code' in body) {
        const typedBody = body as { code: ErrorCode; message: string };
        return { status, code: typedBody.code, message: typedBody.message };
      }

      const message = this.extractMessage(body, exception.message);
      return {
        status,
        code: this.codeForStatus(status),
        message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    };
  }

  private extractMessage(body: unknown, fallback: string): string {
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const raw = (body as { message: string | string[] }).message;
      return Array.isArray(raw) ? raw.join(', ') : raw;
    }
    return fallback;
  }

  private codeForStatus(status: HttpStatus): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.BUSINESS_RULE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
