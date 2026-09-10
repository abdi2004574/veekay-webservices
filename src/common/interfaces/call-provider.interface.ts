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

export interface ICallProvider {
  readonly name: string;
  createSession(payload: CreateCallSessionPayload): Promise<CallSession>;
  endSession(sessionId: string): Promise<void>;
}

export const CALL_PROVIDER = Symbol('CALL_PROVIDER');
