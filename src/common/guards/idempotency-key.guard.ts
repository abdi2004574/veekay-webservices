import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_MIN_LENGTH = 8;
export const IDEMPOTENCY_MAX_LENGTH = 128;

/**
 * Enforces an Idempotency-Key header on money-mutating wallet endpoints so a
 * retried request (network blip, mobile offline replay, double-tap) cannot
 * double-credit/debit a wallet. The header value is stashed on the request as
 * `request.idempotencyKey` and consumed by the service layer to short-circuit
 * the second write.
 */
@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers[IDEMPOTENCY_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (!value || typeof value !== 'string') {
      throw AppException.badRequest('Idempotency-Key header is required.');
    }

    const trimmed = value.trim();
    if (
      trimmed.length < IDEMPOTENCY_MIN_LENGTH ||
      trimmed.length > IDEMPOTENCY_MAX_LENGTH
    ) {
      throw AppException.badRequest('Invalid Idempotency-Key.');
    }

    request.idempotencyKey = trimmed;
    return true;
  }
}
