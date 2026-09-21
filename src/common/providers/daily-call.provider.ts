import { Injectable, Logger } from '@nestjs/common';
import { ICallProvider, CallSession } from '../interfaces/call-provider.interface';

@Injectable()
export class DailyCallProvider implements ICallProvider {
  readonly name = 'daily';
  private readonly logger = new Logger(DailyCallProvider.name);
  private static readonly BASE_URL = 'https://api.daily.co/v1';

  constructor(private readonly dailyApiKey: string) {}

  async createSession(agencyId: string, travelerId: string): Promise<CallSession> {
    this.logger.log('DailyCallProvider: creating session');
    const roomName = 'agency-' + agencyId + '-traveler-' + travelerId;
    const response = await fetch(DailyCallProvider.BASE_URL + '/rooms', {
      method: 'POST',
      headers: {
        'Authorization': 'Apikey ' + this.dailyApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: roomName }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error('DailyCallProvider: createSession failed ' + response.status + ': ' + errorBody);
      throw new Error('Daily.co createSession failed: ' + response.status);
    }
    const room = await response.json();
    return {
      id: room.id || 'call-' + Date.now(),
      agencyId,
      travelerId,
      status: 'active',
      providerSessionId: room.id,
      joinUrl: 'https://' + room.name + '.daily.co',
      createdAt: new Date(),
    };
  }

  async endSession(sessionId: string): Promise<void> {
    this.logger.log('DailyCallProvider: ending session ' + sessionId);
    const response = await fetch(DailyCallProvider.BASE_URL + '/rooms/' + sessionId, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Apikey ' + this.dailyApiKey,
      },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error('DailyCallProvider: endSession failed ' + response.status + ': ' + errorBody);
      throw new Error('Daily.co endSession failed: ' + response.status);
    }
    this.logger.log('DailyCallProvider: session ended ' + sessionId);
  }

  async getSession(sessionId: string): Promise<CallSession | null> {
    this.logger.log('DailyCallProvider: getting session ' + sessionId);
    const response = await fetch(DailyCallProvider.BASE_URL + '/rooms/' + sessionId, {
      method: 'GET',
      headers: {
        'Authorization': 'Apikey ' + this.dailyApiKey,
      },
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error('DailyCallProvider: getSession failed ' + response.status + ': ' + errorBody);
      throw new Error('Daily.co getSession failed: ' + response.status);
    }
    const room = await response.json();
    return {
      id: room.id || sessionId,
      agencyId: room.metadata?.agencyId || '',
      travelerId: room.metadata?.travelerId || '',
      status: room.metadata?.status || 'active',
      providerSessionId: room.id,
      joinUrl: 'https://' + room.name + '.daily.co',
      createdAt: new Date(room.createdAt || Date.now()),
      endedAt: room.endedAt ? new Date(room.endedAt) : undefined,
    };
  }
}