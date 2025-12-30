import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private provider = process.env.MAIL_PROVIDER ?? 'ethereal';

  constructor() {
    if (this.provider === 'sendgrid') {
      const key = process.env.SENDGRID_API_KEY;
      if (!key) throw new Error('SENDGRID_API_KEY is missing');
      sgMail.setApiKey(key);
    }
  }

  async sendVerifyEmail(to: string, token: string) {
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) throw new Error('FRONTEND_URL is missing');

    const verifyUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;

    if (this.provider === 'sendgrid') {
      const from = process.env.MAIL_FROM;
      if (!from) throw new Error('MAIL_FROM is missing');

      try {
        await sgMail.send({
          to,
          from,
          subject: 'Verify your email',
          text: `Click to verify your email: ${verifyUrl}`,
          html: `
            <p>Welcome!</p>
            <p><a href="${verifyUrl}">Verify email</a></p>
          `,
        });
      } catch (err: any) {
        console.error('SendGrid error:', err?.response?.body ?? err);
        throw err;
      }
    } else {
      // Ethereal dev mail
      const testAccount = await nodemailer.createTestAccount();
      const transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM ?? 'no-reply@example.com',
        to,
        subject: 'Verify your email (dev)',
        text: `Click to verify your email: ${verifyUrl}`,
        html: `<p>Click <a href="${verifyUrl}">here</a> to verify</p>`,
      });

      console.log('Ethereal preview URL:', nodemailer.getTestMessageUrl(info));
    }
  }
}
