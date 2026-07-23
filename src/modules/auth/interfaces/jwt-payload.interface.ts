export interface AccessTokenPayload {
  sub: string;
  jti: string;
  twoFactorConfirmed?: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}
