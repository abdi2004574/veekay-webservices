import { AppException } from '../errors/app.exception';

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export interface CursorPage<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

export function encodeCursor(
  position: CursorPosition | { createdAt: Date | string; id: string },
): string {
  return Buffer.from(
    JSON.stringify({
      createdAt:
        position.createdAt instanceof Date
          ? position.createdAt.toISOString()
          : new Date(position.createdAt).toISOString(),
      id: position.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(cursor?: string): CursorPosition | undefined {
  if (!cursor) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw AppException.badRequest('Invalid cursor.');
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as CursorPosition).id !== 'string' ||
    typeof (value as CursorPosition).createdAt !== 'string'
  ) {
    throw AppException.badRequest('Invalid cursor.');
  }

  const createdAt = new Date((value as CursorPosition).createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw AppException.badRequest('Invalid cursor.');
  }

  return { createdAt, id: (value as CursorPosition).id };
}

export function toCursorPage<
  T extends { id: string; createdAt: Date | string },
>(items: T[], limit: number): CursorPage<T> {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page,
    cursor: page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
    hasMore,
  };
}
