import { Injectable, Logger } from '@nestjs/common';
import { ICallProvider, CallSession } from '../interfaces/call-provider.interface';

@Injectable()
export class NoopCallProvider implements ICallProvider {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopCallProvider.name);

  createSession(agencyId: string, travelerId: string): Promise<CallSession> {
    this.logger.warn('NoopCallProvider: no vendor configured, returning stub session for agency ' + agencyId + ', traveler ' + travelerId);
    const now = new Date();
    return Promise.resolve({
      id: 'call-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      agencyId,
      travelerId,
      status: 'active',
      providerSessionId: undefined,
      joinUrl: undefined,
      createdAt: now,
      endedAt: undefined,
    });
  }

  endSession(sessionId: string): Promise<void> {
    this.logger.warn('NoopCallProvider: endSession called for ' + sessionId + ' with no vendor configured.');
    return Promise.resolve();
  }

  getSession(sessionId: string): Promise<CallSession | null> {
    this.logger.warn('NoopCallProvider: getSession called for ' + sessionId + ' with no vendor configured.');
    return Promise.resolve(null);
  }
}