import 'express-session';

declare module 'express-session' {
  interface Session {
    passport?: {
      user?: number;
    };
    userDebug?: {
      id: number;
      username: string;
      timestamp: string;
    };
  }
}