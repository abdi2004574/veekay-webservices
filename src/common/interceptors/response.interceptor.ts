import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Response } from 'express';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface RawHandlerResult<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string | null;
  cursor?: string | null;
  hasMore?: boolean;
}

function hasMeta<T>(value: unknown): value is RawHandlerResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value
  );
}

function isPaginatedResult<T>(value: unknown): value is PaginatedResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray((value as PaginatedResult<T>).items)
  );
}

function extractPaginationMeta(
  result: unknown,
): { nextCursor: string | null; hasMore: boolean } | null {
  if (!result || typeof result !== 'object') return null;

  const obj = result as Record<string, unknown>;

  let nextCursor: string | null = null;
  let hasMore: boolean | undefined;

  if (isPaginatedResult(obj)) {
    nextCursor = obj.nextCursor ?? obj.cursor ?? null;
    hasMore = obj.hasMore;
  } else if (hasMeta(obj)) {
    const meta = obj.meta;
    if (meta) {
      nextCursor = (meta.nextCursor ?? meta.cursor ?? null) as string | null;
      hasMore = meta.hasMore as boolean | undefined;
    }
  } else {
    nextCursor = (obj.nextCursor ?? obj.cursor ?? null) as string | null;
    hasMore = obj.hasMore as boolean | undefined;
  }

  if (nextCursor === null && hasMore === undefined) return null;

  return {
    nextCursor,
    hasMore: hasMore ?? nextCursor !== null,
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((result: T) => {
        const paginationMeta = extractPaginationMeta(result);

        if (paginationMeta) {
          if (paginationMeta.nextCursor) {
            response.setHeader('X-Next-Cursor', paginationMeta.nextCursor);
          }
          response.setHeader('X-Has-More', paginationMeta.hasMore.toString());
        }

        if (hasMeta<T>(result)) {
          return { success: true, data: result.data, meta: result.meta };
        }
        return { success: true, data: result };
      }),
    );
  }
}
