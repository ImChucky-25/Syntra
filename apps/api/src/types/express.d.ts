import type { UserInfo } from '../modules/auth/auth-user.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserInfo;
    }
  }
}

export {};
