import { Injectable, Logger } from '@nestjs/common';

export interface CreateCallSessionPayload {
  conversationId: string;
  initiatedBy: string;
  agencyId: string;
  travelerId: string;
  type: 'audio' | 'video';
}

export interface CallSession {
  id: string;
  conversationId: string;
  agencyId: string;
  travelerId: string;
  initiatedBy: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed';
  providerSessionId?: string;
  joinUrl?: string;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

@Injectable()
export class NoopCallProvider {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopCallProvider.name);

  createSession(payload: CreateCallSessionPayload): Promise<CallSession> {
    this.logger.warn(
      `NoopCallProvider: no vendor configured, returning stub session for conversation ${payload.conversationId}`,
    );
    const now = new Date();
    return Promise.resolve({
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
    });
  }

  endSession(sessionId: string): Promise<void> {
    this.logger.warn(
      `NoopCallProvider: endSession called for ${sessionId} with no vendor configured.`,
    );
    return Promise.resolve();
  }
}
