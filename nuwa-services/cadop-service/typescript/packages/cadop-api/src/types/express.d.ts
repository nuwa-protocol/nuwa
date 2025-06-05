import { UserRecord } from '../repositories/users.js';
import { SessionRecord } from '../repositories/sessions.js';

declare module 'express' {
  interface Request {
    user?: UserRecord;
    session?: SessionRecord;
  }
} 