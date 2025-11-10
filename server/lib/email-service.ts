import { Resend } from 'resend';
import { db } from './db';
import { emailLogs } from '@shared/schema';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

async function getUncachableResendClient() {
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: connectionSettings.settings.from_email
  };
}

const FROM_NAME = '247 Print Network Team';

export type EmailType = 
  | 'welcome'
  | 'password_reset'
  | 'portfolio_approved'
  | 'portfolio_rejected'
  | 'artwork_approved'
  | 'artwork_rejected';

export interface EmailData {
  recipientEmail: string;
  recipientType: 'artist' | 'admin';
  recipientId?: string;
  emailType: EmailType;
  subject: string;
  htmlBody: string;
  textBody: string;
  metadata?: Record<string, any>;
}

export class EmailService {
  private async logEmail(data: EmailData, resendId?: string, status: string = 'pending', errorMessage?: string) {
    try {
      await db.insert(emailLogs).values({
        recipientEmail: data.recipientEmail,
        recipientType: data.recipientType,
        recipientId: data.recipientId,
        emailType: data.emailType,
        subject: data.subject,
        resendId,
        status,
        errorMessage,
        metadata: data.metadata,
        sentAt: status === 'sent' ? new Date() : undefined,
      });
    } catch (error) {
      console.error('Failed to log email:', error);
    }
  }

  async sendEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
    try {
      const { client, fromEmail } = await getUncachableResendClient();

      const result = await client.emails.send({
        from: `${FROM_NAME} <${fromEmail}>`,
        to: data.recipientEmail,
        subject: data.subject,
        html: data.htmlBody,
        text: data.textBody,
      });

      if ('id' in result.data!) {
        await this.logEmail(data, result.data.id, 'sent');
        return { success: true };
      } else {
        const errorMsg = 'error' in result ? result.error.message : 'Unknown error';
        await this.logEmail(data, undefined, 'failed', errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (error: any) {
      console.error('Failed to send email:', error);
      
      if (error.message.includes('Resend not connected')) {
        console.warn('Resend not configured. Email would have been sent:', {
          to: data.recipientEmail,
          subject: data.subject,
          type: data.emailType,
        });
        await this.logEmail(data, undefined, 'failed', 'Resend not configured');
        return { success: false, error: 'Email service not configured' };
      }

      await this.logEmail(data, undefined, 'failed', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(artistEmail: string, artistName: string, artistId: string) {
    const subject = 'Welcome to 247 Print Network!';
    const htmlBody = this.getWelcomeEmailHTML(artistName);
    const textBody = this.getWelcomeEmailText(artistName);

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'welcome',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName },
    });
  }

  async sendPasswordResetEmail(email: string, userType: 'artist' | 'admin', resetToken: string) {
    const resetUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}&type=${userType}`;
    const subject = 'Reset Your Password - 247 Print Network';
    const htmlBody = this.getPasswordResetEmailHTML(resetUrl);
    const textBody = this.getPasswordResetEmailText(resetUrl);

    return this.sendEmail({
      recipientEmail: email,
      recipientType: userType,
      emailType: 'password_reset',
      subject,
      htmlBody,
      textBody,
      metadata: { userType },
    });
  }

  async sendPortfolioDecisionEmail(
    artistEmail: string,
    artistName: string,
    artistId: string,
    approved: boolean,
    rejectionReason?: string
  ) {
    const subject = approved 
      ? 'Portfolio Approved - Start Uploading Artwork!'
      : 'Portfolio Submission Update';
    
    const htmlBody = approved
      ? this.getPortfolioApprovedEmailHTML(artistName)
      : this.getPortfolioRejectedEmailHTML(artistName, rejectionReason);
    
    const textBody = approved
      ? this.getPortfolioApprovedEmailText(artistName)
      : this.getPortfolioRejectedEmailText(artistName, rejectionReason);

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: approved ? 'portfolio_approved' : 'portfolio_rejected',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName, approved, rejectionReason },
    });
  }

  async sendArtworkDecisionEmail(
    artistEmail: string,
    artistName: string,
    artistId: string,
    artworkTitle: string,
    approved: boolean,
    rejectionReason?: string
  ) {
    const subject = approved
      ? `Your Artwork "${artworkTitle}" is Live!`
      : `Artwork Submission Update: ${artworkTitle}`;
    
    const htmlBody = approved
      ? this.getArtworkApprovedEmailHTML(artistName, artworkTitle)
      : this.getArtworkRejectedEmailHTML(artistName, artworkTitle, rejectionReason);
    
    const textBody = approved
      ? this.getArtworkApprovedEmailText(artistName, artworkTitle)
      : this.getArtworkRejectedEmailText(artistName, artworkTitle, rejectionReason);

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: approved ? 'artwork_approved' : 'artwork_rejected',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName, artworkTitle, approved, rejectionReason },
    });
  }

  private getWelcomeEmailHTML(artistName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to 247 Print Network!</h1>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <p>Welcome to the artist community! We're excited to have you join our platform.</p>
            
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Your portfolio is currently under review by our team</li>
              <li>Once approved, you'll be able to upload your artwork</li>
              <li>We'll automatically create print-on-demand products from your approved art</li>
              <li>Start earning royalties on every sale (30-45% based on performance!)</li>
            </ol>
            
            <p>We typically review portfolios within 24-48 hours. You'll receive an email notification once your portfolio has been reviewed.</p>
            
            <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard" class="button">View Your Dashboard</a>
            
            <p>If you have any questions, feel free to reply to this email.</p>
            
            <p>Best regards,<br>247 Print Network Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getWelcomeEmailText(artistName: string): string {
    return `
Welcome to 247 Print Network!

Hi ${artistName},

Welcome to the artist community! We're excited to have you join our platform.

Next Steps:
1. Your portfolio is currently under review by our team
2. Once approved, you'll be able to upload your artwork
3. We'll automatically create print-on-demand products from your approved art
4. Start earning royalties on every sale (30-45% based on performance!)

We typically review portfolios within 24-48 hours. You'll receive an email notification once your portfolio has been reviewed.

Visit your dashboard: ${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard

If you have any questions, feel free to reply to this email.

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getPasswordResetEmailHTML(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password</h1>
          </div>
          <div class="content">
            <p>You requested to reset your password for your 247 Print Network account.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <div class="warning">
              <strong>Security Notice:</strong> This link will expire in 60 minutes. If you didn't request this reset, please ignore this email.
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
            
            <p>Best regards,<br>247 Print Network Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetEmailText(resetUrl: string): string {
    return `
Reset Your Password

You requested to reset your password for your 247 Print Network account.

Click the link below to reset your password:
${resetUrl}

SECURITY NOTICE: This link will expire in 60 minutes. If you didn't request this reset, please ignore this email.

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getPortfolioApprovedEmailHTML(artistName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Portfolio Approved!</h1>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <div class="success">
              <strong>Congratulations!</strong> Your portfolio has been approved. You're now ready to start uploading artwork!
            </div>
            
            <p><strong>What's Next:</strong></p>
            <ol>
              <li>Upload your first artwork through your dashboard</li>
              <li>We'll review it and create print-on-demand products</li>
              <li>Your artwork goes live on our marketplace</li>
              <li>Start earning 30-45% royalties on every sale!</li>
            </ol>
            
            <p><strong>Royalty Tiers:</strong></p>
            <ul>
              <li>30% base royalty on all sales</li>
              <li>35% when you hit $500/month</li>
              <li>40% at $1,000/month</li>
              <li>45% at $2,500/month</li>
            </ul>
            
            <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard" class="button">Upload Your First Artwork</a>
            
            <p>We can't wait to see what you create!</p>
            
            <p>Best regards,<br>247 Print Network Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPortfolioApprovedEmailText(artistName: string): string {
    return `
🎉 Portfolio Approved!

Hi ${artistName},

Congratulations! Your portfolio has been approved. You're now ready to start uploading artwork!

What's Next:
1. Upload your first artwork through your dashboard
2. We'll review it and create print-on-demand products
3. Your artwork goes live on our marketplace
4. Start earning 30-45% royalties on every sale!

Royalty Tiers:
- 30% base royalty on all sales
- 35% when you hit $500/month
- 40% at $1,000/month
- 45% at $2,500/month

Upload your first artwork: ${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard

We can't wait to see what you create!

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getPortfolioRejectedEmailHTML(artistName: string, reason?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .info { background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Portfolio Submission Update</h1>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <p>Thank you for your interest in joining 247 Print Network. After reviewing your portfolio submission, we're unable to approve it at this time.</p>
            
            ${reason ? `
              <div class="info">
                <strong>Feedback:</strong><br>
                ${reason}
              </div>
            ` : ''}
            
            <p>We encourage you to continue developing your portfolio and consider reapplying in the future once you've addressed the feedback above.</p>
            
            <p>We appreciate your interest and wish you the best in your artistic journey!</p>
            
            <p>Best regards,<br>247 Print Network Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPortfolioRejectedEmailText(artistName: string, reason?: string): string {
    return `
Portfolio Submission Update

Hi ${artistName},

Thank you for your interest in joining 247 Print Network. After reviewing your portfolio submission, we're unable to approve it at this time.

${reason ? `Feedback: ${reason}` : ''}

We encourage you to continue developing your portfolio and consider reapplying in the future once you've addressed the feedback above.

We appreciate your interest and wish you the best in your artistic journey!

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getArtworkApprovedEmailHTML(artistName: string, artworkTitle: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎨 Your Artwork is Live!</h1>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <div class="success">
              <strong>Great news!</strong> Your artwork "${artworkTitle}" has been approved and is now live on our marketplace!
            </div>
            
            <p>Your artwork has been transformed into beautiful print-on-demand products across multiple sizes and finishes. Customers can now purchase your art, and you'll earn royalties on every sale.</p>
            
            <p><strong>What Happens Now:</strong></p>
            <ul>
              <li>Your artwork is live on the 247 Print Network marketplace</li>
              <li>Products are available in multiple sizes (8x10", 16x20", 24x36", 30x40")</li>
              <li>Two finish options: Premium Paper and Gallery Canvas</li>
              <li>You earn 30-45% royalties on every sale</li>
            </ul>
            
            <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard" class="button">View Your Dashboard</a>
            
            <p>Keep uploading! The more artwork you have live, the more you can earn.</p>
            
            <p>Best regards,<br>247 Print Network Sales Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getArtworkApprovedEmailText(artistName: string, artworkTitle: string): string {
    return `
🎨 Your Artwork is Live!

Hi ${artistName},

Great news! Your artwork "${artworkTitle}" has been approved and is now live on our marketplace!

Your artwork has been transformed into beautiful print-on-demand products across multiple sizes and finishes. Customers can now purchase your art, and you'll earn royalties on every sale.

What Happens Now:
- Your artwork is live on the 247 Print Network marketplace
- Products are available in multiple sizes (8x10", 16x20", 24x36", 30x40")
- Two finish options: Premium Paper and Gallery Canvas
- You earn 30-45% royalties on every sale

View your dashboard: ${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard

Keep uploading! The more artwork you have live, the more you can earn.

Best regards,
247 Print Network Sales Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getArtworkRejectedEmailHTML(artistName: string, artworkTitle: string, reason?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .info { background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Artwork Submission Update</h1>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <p>We've reviewed your artwork submission "${artworkTitle}". Unfortunately, we're unable to approve it at this time.</p>
            
            ${reason ? `
              <div class="info">
                <strong>Feedback:</strong><br>
                ${reason}
              </div>
            ` : ''}
            
            <p><strong>Common reasons for rejection:</strong></p>
            <ul>
              <li>Image resolution below 2400x3000px (required for print quality)</li>
              <li>Copyright or trademark concerns</li>
              <li>Image quality issues (compression artifacts, blur, noise)</li>
              <li>Inappropriate content</li>
            </ul>
            
            <p>Please address the feedback and feel free to submit new artwork. We're here to help you succeed!</p>
            
            <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard" class="button">Upload New Artwork</a>
            
            <p>Best regards,<br>247 Print Network Support Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getArtworkRejectedEmailText(artistName: string, artworkTitle: string, reason?: string): string {
    return `
Artwork Submission Update

Hi ${artistName},

We've reviewed your artwork submission "${artworkTitle}". Unfortunately, we're unable to approve it at this time.

${reason ? `Feedback: ${reason}` : ''}

Common reasons for rejection:
- Image resolution below 2400x3000px (required for print quality)
- Copyright or trademark concerns
- Image quality issues (compression artifacts, blur, noise)
- Inappropriate content

Please address the feedback and feel free to submit new artwork. We're here to help you succeed!

Upload new artwork: ${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard

Best regards,
247 Print Network Support Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }
}

export const emailService = new EmailService();
