import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { AppException } from '../../common/errors/app.exception';
import { AppConfig } from '../../config/configuration';

export interface VerifiedSocialProfile {
  providerUserId: string;
  email: string;
}

@Injectable()
export class SocialAuthService {
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId: string;
  private readonly appleClientId: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const social = config.get('social', { infer: true });
    this.googleClientId = social.googleClientId;
    this.appleClientId = social.appleClientId;
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  async verifyGoogleIdToken(idToken: string): Promise<VerifiedSocialProfile> {
    if (!this.googleClientId) {
      throw AppException.businessRule(
        'Google sign-in is not configured on this environment.',
      );
    }

    const ticket = await this.googleClient
      .verifyIdToken({ idToken, audience: this.googleClientId })
      .catch(() => {
        throw AppException.unauthorized('Invalid Google token.');
      });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw AppException.unauthorized('Invalid Google token.');
    }

    return { providerUserId: payload.sub, email: payload.email };
  }

  async verifyAppleIdToken(idToken: string): Promise<VerifiedSocialProfile> {
    if (!this.appleClientId) {
      throw AppException.businessRule(
        'Apple sign-in is not configured on this environment.',
      );
    }

    const payload = await appleSignin
      .verifyIdToken(idToken, {
        audience: this.appleClientId,
        ignoreExpiration: false,
      })
      .catch(() => {
        throw AppException.unauthorized('Invalid Apple token.');
      });

    if (!payload?.sub || !payload.email) {
      throw AppException.unauthorized('Invalid Apple token.');
    }

    return { providerUserId: payload.sub, email: payload.email };
  }
}
