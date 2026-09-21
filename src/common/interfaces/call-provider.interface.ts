export interface CallSession {
  id: string;
  agencyId: string;
  travelerId: string;
  status: 'active' | 'ended' | 'missed';
  providerSessionId?: string;
  joinUrl?: string;
  createdAt: Date;
  endedAt?: Date;
}

export const ICallProvider = Symbol('ICallProvider');

export interface ICallProvider {
  createSession(agencyId: string, travelerId: string): Promise<CallSession>;
  endSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<CallSession | null>;
}
