import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';

@Injectable()
export class TwoFactorService {
  generateSecret(): string {
    return generateSecret();
  }

  generateOtpAuthUri(email: string, secret: string): string {
    return generateURI({ issuer: 'Veakay', label: email, secret });
  }

  async verify(token: string, secret: string): Promise<boolean> {
    const result = await verify({ secret, token, epochTolerance: 1 });
    return result.valid;
  }
}
