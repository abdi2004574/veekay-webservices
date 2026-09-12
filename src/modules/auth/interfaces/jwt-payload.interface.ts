export interface AccessTokenPayload {
  sub: string;
  jti: string;
  twoFactorConfirmed?: boolean;
  agencyId?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}
