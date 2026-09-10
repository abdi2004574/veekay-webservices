import { Injectable, Logger } from '@nestjs/common';
import {
  CALL_PROVIDER,
  CreateCallSessionPayload,
  CallSession,
  ICallProvider,
} from '../../common/interfaces/call-provider.interface';

@Injectable()
export class NoopCallProvider implements ICallProvider {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopCallProvider.name);

  async createSession(payload: CreateCallSessionPayload): Promise<CallSession> {
    this.logger.warn(
      `NoopCallProvider: no vendor configured, returning stub session for conversation ${payload.conversationId}`,
    );
    const now = new Date();
    return {
      id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: payload.conversationId,
      agencyId: payload.agencyId,
      travelerId: payload.travelerId,
      initiatedBy: payload.initiatedBy,
      type: payload.type,
      status: 'active',
      providerSessionId: undefined,
      joinUrl: undefined,
      startedAt: now,
      createdAt: now,
    };
  }

  async endSession(sessionId: string): Promise<void> {
    this.logger.warn(
      `NoopCallProvider: endSession called for ${sessionId} with no vendor configured.`,
    );
  }
}
