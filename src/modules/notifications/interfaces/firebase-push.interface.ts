export const FIREBASE_PUSH_PROVIDER = Symbol('FIREBASE_PUSH_PROVIDER');

export interface PushNotificationPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface SendTokensResult {
  successCount: number;
  failureCount: number;
  failedTokens: string[];
}

export interface IFirebasePushProvider {
  readonly name: string;
  send(payload: PushNotificationPayload): Promise<PushResult>;
  sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<PushResult>;
  sendTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<SendTokensResult>;
}
