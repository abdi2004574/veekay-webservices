import { User } from '@prisma/client';
import { TokenPair } from './token.service';

export function toAuthResponse(user: User, tokens: TokenPair) {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      onboardingComplete: user.onboardingComplete,
    },
    ...tokens,
  };
}
