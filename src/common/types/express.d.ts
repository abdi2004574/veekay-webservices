import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

declare global {
  namespace Express {
    // Passport's own types declare `Request.user?: User` with this empty
    // interface as the merge target � extend it instead of redeclaring
    // `Request.user` directly, which would conflict with Passport's types.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- standard Passport declaration-merging target
    interface User extends AuthenticatedUser {}
  }

  namespace Express {
    interface Request {
      idempotencyKey?: string;
    }
  }
}

export {};
