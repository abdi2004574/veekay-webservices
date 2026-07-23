import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface RawHandlerResult<T> {
  data: T;
  meta?: Record<string, unknown>;
}

function hasMeta<T>(value: unknown): value is RawHandlerResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    return next.handle().pipe(
      map((result: T) => {
        if (hasMeta<T>(result)) {
          return { success: true, data: result.data, meta: result.meta };
        }
        return { success: true, data: result };
      }),
    );
  }
}
