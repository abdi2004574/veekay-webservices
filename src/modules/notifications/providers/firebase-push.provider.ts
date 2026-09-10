import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import { AppConfig } from '../../../config/configuration';
import {
  FIREBASE_PUSH_PROVIDER,
  IFirebasePushProvider,
  PushNotificationPayload,
  PushResult,
  SendTokensResult,
} from '../interfaces/firebase-push.interface';

function fixPrivateKey(key: string): string {
  if (key.includes('\n')) {
    return key;
  }
  return key.replace(/\\n/g, '\n');
}

@Injectable()
export class FirebasePushProvider implements IFirebasePushProvider {
  readonly name = 'firebase';
  private readonly logger = new Logger(FirebasePushProvider.name);
  private readonly isConfigured: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    if (getApps().length > 0) {
      this.isConfigured = true;
      return;
    }

    const firebase = config.get('firebase', { infer: true });
    if (firebase.projectId && firebase.clientEmail && firebase.privateKey) {
      try {
        initializeApp({
          credential: cert({
            projectId: firebase.projectId,
            clientEmail: firebase.clientEmail,
            privateKey: fixPrivateKey(firebase.privateKey),
          }),
        });
        this.isConfigured = true;
      } catch (error) {
        this.logger.warn(
          'Firebase initialization failed, push notifications disabled',
          error,
        );
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
    }
  }

  async send(payload: PushNotificationPayload): Promise<PushResult> {
    if (!this.isConfigured) {
      return { ok: false, error: 'Firebase not configured' };
    }
    try {
      const messaging = getMessaging();
      const messageId = await messaging.send({
        token: payload.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
      return { ok: true, messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to token ${payload.token}`,
        error,
      );
      return { ok: false, error: (error as Error).message };
    }
  }

  async sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<PushResult> {
    if (!this.isConfigured) {
      return { ok: false, error: 'Firebase not configured' };
    }
    try {
      const messaging = getMessaging();
      const response = await messaging.sendEach([
        { topic, notification: { title, body }, data },
      ]);
      const first = response.responses[0];
      return {
        ok: first.success,
        messageId: first.messageId,
        error: first.error?.message,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to topic ${topic}`,
        error,
      );
      return { ok: false, error: (error as Error).message };
    }
  }

  async sendTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<SendTokensResult> {
    if (!this.isConfigured) {
      return {
        successCount: 0,
        failureCount: tokens.length,
        failedTokens: tokens,
      };
    }
    try {
      const messaging = getMessaging();
      const batchResponse = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
      });

      const failedTokens: string[] = [];
      batchResponse.responses.forEach((response, index) => {
        if (!response.success) {
          failedTokens.push(tokens[index]);
        }
      });

      return {
        successCount: batchResponse.successCount,
        failureCount: batchResponse.failureCount,
        failedTokens,
      };
    } catch (error) {
      this.logger.error('Failed to send multicast push notification', error);
      return {
        successCount: 0,
        failureCount: tokens.length,
        failedTokens: tokens,
      };
    }
  }
}
