import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../../config/configuration';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const mail = config.get('mail', { infer: true });
    this.from = mail.from;
    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
    });
  }

  async send({ to, subject, html }: SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (error) {
      this.logger.error(`Failed to send mail to ${to}: ${subject}`, error);
      throw error;
    }
  }

  async sendOtpEmail(to: string, otp: string, purpose: 'verify' | 'reset') {
    const subject =
      purpose === 'verify'
        ? 'Verify your Veakay email'
        : 'Reset your Veakay password';
    const intro =
      purpose === 'verify'
        ? 'Use this code to verify your email address:'
        : 'Use this code to reset your password:';

    await this.send({
      to,
      subject,
      html: `<p>${intro}</p><h2>${otp}</h2><p>This code expires in a few minutes and can only be used a limited number of times.</p>`,
    });
  }

  async sendPasswordChangedEmail(to: string) {
    await this.send({
      to,
      subject: 'Your Veakay password was changed',
      html: '<p>Your password was just changed. If this was not you, contact support immediately and reset your password.</p>',
    });
  }

  async sendAgencyApprovedEmail(to: string, agencyName: string) {
    await this.send({
      to,
      subject: 'Your agency has been verified',
      html: `<p>Congratulations, ${agencyName} has been approved and verified on Veakay.</p>`,
    });
  }

  async sendAgencyRejectedEmail(to: string, reason?: string) {
    await this.send({
      to,
      subject: 'Your agency registration was not approved',
      html: `<p>Your agency registration was not approved.${reason ? ` Reason: ${reason}` : ''}</p>`,
    });
  }
}
