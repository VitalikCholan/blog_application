import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  constructor(
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  async sendPasswordResetEmail(email: string, resetToken: string, username: string) {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    
    await this.mailerService.sendMail({
      to: email,
      subject: 'Password Reset Request',
      template: 'password-reset',
      context: {
        username,
        resetUrl,
        resetToken,
        expiresIn: '1 hour',
      },
    });
  }

  async sendPasswordChangedEmail(email: string, username: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Password Changed Successfully',
      template: 'password-changed',
      context: {
        username,
        changedAt: new Date().toLocaleString(),
      },
    });
  }
}
