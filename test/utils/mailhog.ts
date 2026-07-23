const MAILHOG_API = 'http://localhost:58025/api/v2';

interface MailhogMessage {
  Content: { Body: string; Headers: { Subject: string[] } };
}

export async function fetchLatestOtp(email: string): Promise<string> {
  const response = await fetch(
    `${MAILHOG_API}/search?kind=to&query=${encodeURIComponent(email)}`,
  );
  const data = (await response.json()) as { items: MailhogMessage[] };

  if (!data.items.length) {
    throw new Error(`No email found for ${email}`);
  }

  const latest = data.items[0];
  const match = latest.Content.Body.match(/<h2>(\d{6})<\/h2>/);
  if (!match) {
    throw new Error(`No OTP found in email body for ${email}`);
  }

  return match[1];
}

export async function clearMailhog(): Promise<void> {
  await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
}
