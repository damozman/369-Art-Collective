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
  | 'artwork_rejected'
  | 'artwork_archive_warning'
  | 'artwork_archived'
  | 'influencer_application'
  | 'influencer_approved'
  | 'subscription_confirmed'
  | 'subscription_canceled'
  | 'payment_failed'
  | 'payout_notification'
  | 'custom';

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
  private renderEmailLayout(params: {
    title: string;
    headerColor?: string;
    bodyHtml: string;
  }): string {
    const headerColor = params.headerColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${headerColor}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .danger { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
          .info { background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${params.title}</h1>
          </div>
          <div class="content">
            ${params.bodyHtml}
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

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

      if (result.data && 'id' in result.data) {
        await this.logEmail(data, result.data.id, 'sent');
        return { success: true };
      } else {
        const errorMsg = result.error?.message || 'Unknown error';
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

  async sendArtworkArchiveWarning(
    artistEmail: string,
    artistName: string,
    artworkTitle: string,
    artworkId: string
  ) {
    const subject = `Action Needed: Keep "${artworkTitle}" Live on 247 Print Network`;
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() + 30);
    
    const htmlBody = this.getArtworkArchiveWarningHTML(artistName, artworkTitle, archiveDate, artworkId);
    const textBody = this.getArtworkArchiveWarningText(artistName, artworkTitle, archiveDate, artworkId);

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artworkId,
      emailType: 'artwork_archive_warning',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName, artworkTitle, artworkId, archiveDate },
    });
  }

  async sendArtworkArchivedNotification(
    artistEmail: string,
    artistName: string,
    artworkTitle: string,
    artworkId: string
  ) {
    const subject = `"${artworkTitle}" Has Been Archived`;
    
    const htmlBody = this.getArtworkArchivedHTML(artistName, artworkTitle, artworkId);
    const textBody = this.getArtworkArchivedText(artistName, artworkTitle, artworkId);

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artworkId,
      emailType: 'artwork_archived',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName, artworkTitle, artworkId },
    });
  }

  async sendInfluencerApplicationEmail(
    influencerEmail: string,
    influencerName: string,
    influencerId: string
  ) {
    const subject = 'Welcome to 247 Print Network Influencer Program!';
    const htmlBody = this.getInfluencerApplicationHTML(influencerName);
    const textBody = this.getInfluencerApplicationText(influencerName);

    return this.sendEmail({
      recipientEmail: influencerEmail,
      recipientType: 'artist',
      recipientId: influencerId,
      emailType: 'influencer_application',
      subject,
      htmlBody,
      textBody,
      metadata: { influencerName },
    });
  }

  async sendInfluencerApprovalEmail(
    influencerEmail: string,
    influencerName: string,
    influencerId: string,
    affiliateCode: string
  ) {
    const subject = 'Your Influencer Application is Approved!';
    const htmlBody = this.getInfluencerApprovalHTML(influencerName, affiliateCode);
    const textBody = this.getInfluencerApprovalText(influencerName, affiliateCode);

    return this.sendEmail({
      recipientEmail: influencerEmail,
      recipientType: 'artist',
      recipientId: influencerId,
      emailType: 'influencer_approved',
      subject,
      htmlBody,
      textBody,
      metadata: { influencerName, affiliateCode },
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
          .info { background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
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
            
            <p>Welcome to the artist community! We're excited to have you join our platform where you'll earn <strong>30-45% royalties</strong> on every sale.</p>
            
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Your portfolio is currently under review by our team</li>
              <li>Once approved, you'll be able to upload your artwork</li>
              <li>We'll automatically create print-on-demand products from your approved art</li>
              <li>Start earning royalties immediately!</li>
            </ol>
            
            <p>We typically review portfolios within 24-48 hours. You'll receive an email notification once your portfolio has been reviewed.</p>
            
            <div class="info">
              <strong>💡 Three Ways to Grow With Us:</strong><br>
              • <strong>Free:</strong> Start earning 30% royalties with up to 20 artworks<br>
              • <strong>Pro:</strong> Unlock 35% royalties, unlimited uploads, AI Art Studio, and homepage featured rotation<br>
              • <strong>Elite:</strong> Get 45% royalties, unlimited AI tools, guaranteed homepage placement, and priority support<br><br>
              You'll learn more about tier options once your portfolio is approved!
            </div>
            
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

Welcome to the artist community! We're excited to have you join our platform where you'll earn 30-45% royalties on every sale.

NEXT STEPS:
1. Your portfolio is currently under review by our team
2. Once approved, you'll be able to upload your artwork
3. We'll automatically create print-on-demand products from your approved art
4. Start earning royalties immediately!

We typically review portfolios within 24-48 hours. You'll receive an email notification once your portfolio has been reviewed.

💡 THREE WAYS TO GROW WITH US:
• Free: Start earning 30% royalties with up to 20 artworks
• Pro: Unlock 35% royalties, unlimited uploads, AI Art Studio, and homepage featured rotation
• Elite: Get 45% royalties, unlimited AI tools, guaranteed homepage placement, and priority support

You'll learn more about tier options once your portfolio is approved!

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
          .button-secondary { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 10px 10px 0; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          .info { background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .tier-comparison { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .tier-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
          .tier-label { font-weight: bold; color: #667eea; }
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
              <strong>Congratulations!</strong> Your portfolio has been approved. You're now a 247 Print Network artist!
            </div>
            
            <p><strong>Your Free Tier Includes:</strong></p>
            <ul>
              <li>✅ <strong>30% royalty</strong> on all sales</li>
              <li>✅ Upload up to <strong>20 artworks</strong></li>
              <li>✅ Automatic print-on-demand product creation</li>
              <li>✅ Professional artist dashboard</li>
            </ul>
            
            <div class="warning">
              <strong>📊 Free Tier Limit:</strong> You can upload up to 20 artworks on the Free tier. Need more? Upgrade to Pro for unlimited uploads!
            </div>
            
            <p><strong>What's Next:</strong></p>
            <ol>
              <li>Upload your first artwork through your dashboard</li>
              <li>We'll review it and create print-on-demand products</li>
              <li>Your artwork goes live on our Shopify marketplace</li>
              <li>Start earning 30% royalties immediately!</li>
            </ol>
            
            <div class="tier-comparison">
              <h3 style="margin-top: 0; color: #667eea;">🚀 Ready to Unlock More?</h3>
              
              <p><strong>Pro Tier ($15-20/mo):</strong></p>
              <ul>
                <li>✨ <strong>35% minimum royalty</strong> (guaranteed!)</li>
                <li>🎨 <strong>Unlimited artwork uploads</strong></li>
                <li>🤖 <strong>AI Art Studio access</strong> - Generate new designs with DALL-E 3</li>
                <li>⭐ <strong>Homepage featured rotation</strong> - Fair exposure for all Pro artists</li>
              </ul>
              
              <p><strong>Elite Tier ($40-50/mo):</strong></p>
              <ul>
                <li>💎 <strong>45% royalty guarantee</strong> (max tier immediately!)</li>
                <li>🎨 <strong>Unlimited uploads + AI Studio</strong></li>
                <li>🏆 <strong>Guaranteed homepage placement</strong> via hybrid rotation</li>
                <li>⚡ <strong>Priority artwork review</strong></li>
                <li>🎯 <strong>Full profile customization</strong></li>
              </ul>
              
              <div class="info">
                <strong>💡 Featured Artist System:</strong> Pro and Elite members get fair homepage rotation (2 performance slots for top sellers + 2 rotation slots ensuring everyone gets exposure). Your work will be seen!
              </div>
              
              <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/settings" class="button-secondary">Upgrade to Pro</a>
            </div>
            
            <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard" class="button">Upload Your First Artwork</a>
            
            <p>We can't wait to see what you create! Questions about tiers or features? Just reply to this email.</p>
            
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

Congratulations! Your portfolio has been approved. You're now a 247 Print Network artist!

YOUR FREE TIER INCLUDES:
✅ 30% royalty on all sales
✅ Upload up to 20 artworks
✅ Automatic print-on-demand product creation
✅ Professional artist dashboard

📊 FREE TIER LIMIT: You can upload up to 20 artworks on the Free tier. Need more? Upgrade to Pro for unlimited uploads!

WHAT'S NEXT:
1. Upload your first artwork through your dashboard
2. We'll review it and create print-on-demand products
3. Your artwork goes live on our Shopify marketplace
4. Start earning 30% royalties immediately!

🚀 READY TO UNLOCK MORE?

PRO TIER ($15-20/mo):
✨ 35% minimum royalty (guaranteed!)
🎨 Unlimited artwork uploads
🤖 AI Art Studio access - Generate new designs with DALL-E 3
⭐ Homepage featured rotation - Fair exposure for all Pro artists

ELITE TIER ($40-50/mo):
💎 45% royalty guarantee (max tier immediately!)
🎨 Unlimited uploads + AI Studio
🏆 Guaranteed homepage placement via hybrid rotation
⚡ Priority artwork review
🎯 Full profile customization

💡 FEATURED ARTIST SYSTEM: Pro and Elite members get fair homepage rotation (2 performance slots for top sellers + 2 rotation slots ensuring everyone gets exposure). Your work will be seen!

Upgrade to Pro: ${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/settings

Upload your first artwork: ${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard

We can't wait to see what you create! Questions about tiers or features? Just reply to this email.

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

  private getArtworkArchiveWarningHTML(artistName: string, artworkTitle: string, archiveDate: Date, artworkId: string): string {
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;
    const formattedDate = archiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
          .button-secondary { background: #6b7280; }
          .info { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          ul { line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Action Needed</h1>
            <p style="font-size: 18px; margin: 10px 0 0 0;">Keep "${artworkTitle}" Live</p>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <p>We don't want to lose this piece from our marketplace! Your artwork <strong>"${artworkTitle}"</strong> has been inactive for 17 months and is scheduled for archiving on <strong>${formattedDate}</strong> (30 days from now).</p>
            
            <div class="info">
              <strong>📊 Inactivity Summary:</strong><br>
              No sales recorded in the last 17 months<br>
              Without activity, this artwork will be removed from the marketplace to maintain our quality standards.
            </div>
            
            <p><strong>🎯 How to keep "${artworkTitle}" live:</strong></p>
            <ul>
              <li><strong>Make a sale</strong> - Share this artwork on social media to boost visibility</li>
              <li><strong>Cross-promote</strong> - Include it in your artist newsletter or portfolio</li>
              <li><strong>Refresh your listing</strong> - Update tags, description, or add to featured collections</li>
              <li><strong>Join a campaign</strong> - Participate in seasonal promotions or artist spotlights</li>
            </ul>
            
            <p style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}" class="button">View Marketing Toolkit</a>
              <a href="${dashboardUrl}" class="button button-secondary">View in Dashboard</a>
            </p>
            
            <p><strong>What happens if archived?</strong></p>
            <p>Archived artworks are hidden from the marketplace but remain in your dashboard. You can reactivate them at any time. Your files, ratings, and all data remain intact.</p>
            
            <p>We're here to support your success. If you'd like help promoting this artwork or have questions, reply to this email.</p>
            
            <p>Best regards,<br>247 Print Network Team</p>
          </div>
          <div class="footer">
            <p>This is an automated notice based on our marketplace quality policy. You can manage your artwork anytime in your dashboard.</p>
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getArtworkArchiveWarningText(artistName: string, artworkTitle: string, archiveDate: Date, artworkId: string): string {
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;
    const formattedDate = archiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    return `
⏰ ACTION NEEDED: Keep "${artworkTitle}" Live

Hi ${artistName},

We don't want to lose this piece from our marketplace! Your artwork "${artworkTitle}" has been inactive for 17 months and is scheduled for archiving on ${formattedDate} (30 days from now).

INACTIVITY SUMMARY:
📊 No sales recorded in the last 17 months
Without activity, this artwork will be removed from the marketplace to maintain our quality standards.

HOW TO KEEP "${artworkTitle}" LIVE:
• Make a sale - Share this artwork on social media to boost visibility
• Cross-promote - Include it in your artist newsletter or portfolio  
• Refresh your listing - Update tags, description, or add to featured collections
• Join a campaign - Participate in seasonal promotions or artist spotlights

View Marketing Toolkit: ${dashboardUrl}
View in Dashboard: ${dashboardUrl}

WHAT HAPPENS IF ARCHIVED?
Archived artworks are hidden from the marketplace but remain in your dashboard. You can reactivate them at any time. Your files, ratings, and all data remain intact.

We're here to support your success. If you'd like help promoting this artwork or have questions, reply to this email.

Best regards,
247 Print Network Team

---
This is an automated notice based on our marketplace quality policy. You can manage your artwork anytime in your dashboard.
© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getArtworkArchivedHTML(artistName: string, artworkTitle: string, artworkId: string): string {
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .info { background: #e5e7eb; border-left: 4px solid #6b7280; padding: 15px; margin: 20px 0; }
          .reassurance { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          ul { line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Artwork Archived</h1>
            <p style="font-size: 18px; margin: 10px 0 0 0;">"${artworkTitle}"</p>
          </div>
          <div class="content">
            <p>Hi ${artistName},</p>
            
            <p>Your artwork <strong>"${artworkTitle}"</strong> has been archived due to 18 months of inactivity (no sales). This helps us maintain a vibrant, active marketplace for all artists.</p>
            
            <div class="info">
              <strong>📋 What Changed:</strong><br>
              ✓ Removed from marketplace (no longer visible to shoppers)<br>
              ✓ Shopify product status set to draft<br>
              ✓ Moved to your "Archived" section in the dashboard
            </div>
            
            <div class="reassurance">
              <strong>✅ What's Protected:</strong><br>
              • Your original artwork files remain intact<br>
              • All ratings, reviews, and historical data preserved<br>
              • No deletion - you still own all rights to your work<br>
              • Can be reactivated anytime
            </div>
            
            <p><strong>🔄 Ready to bring this artwork back?</strong></p>
            <p>You can reactivate "${artworkTitle}" with one click. When reactivated, it will return to the marketplace, and the Shopify product will be republished.</p>
            
            <p style="text-align: center;">
              <a href="${dashboardUrl}" class="button">Restore This Artwork</a>
            </p>
            
            <p><strong>💡 Tips for Success:</strong></p>
            <ul>
              <li>Promote reactivated artworks on social media for maximum visibility</li>
              <li>Update artwork descriptions and tags to improve discoverability</li>
              <li>Consider seasonal trends when choosing which pieces to reactivate</li>
              <li>Join our artist campaigns to showcase your work to new audiences</li>
            </ul>
            
            <p>We value your partnership and are here to help. If you have questions or need marketing support, reply to this email.</p>
            
            <p>Best regards,<br>247 Print Network Team</p>
          </div>
          <div class="footer">
            <p>This action was taken in accordance with our marketplace quality policy and terms of service.</p>
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getArtworkArchivedText(artistName: string, artworkTitle: string, artworkId: string): string {
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;
    
    return `
📦 ARTWORK ARCHIVED: "${artworkTitle}"

Hi ${artistName},

Your artwork "${artworkTitle}" has been archived due to 18 months of inactivity (no sales). This helps us maintain a vibrant, active marketplace for all artists.

WHAT CHANGED:
✓ Removed from marketplace (no longer visible to shoppers)
✓ Shopify product status set to draft
✓ Moved to your "Archived" section in the dashboard

WHAT'S PROTECTED:
• Your original artwork files remain intact
• All ratings, reviews, and historical data preserved
• No deletion - you still own all rights to your work
• Can be reactivated anytime

READY TO BRING THIS ARTWORK BACK?
You can reactivate "${artworkTitle}" with one click. When reactivated, it will return to the marketplace, and the Shopify product will be republished.

Restore This Artwork: ${dashboardUrl}

TIPS FOR SUCCESS:
• Promote reactivated artworks on social media for maximum visibility
• Update artwork descriptions and tags to improve discoverability
• Consider seasonal trends when choosing which pieces to reactivate
• Join our artist campaigns to showcase your work to new audiences

We value your partnership and are here to help. If you have questions or need marketing support, reply to this email.

Best regards,
247 Print Network Team

---
This action was taken in accordance with our marketplace quality policy and terms of service.
© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getInfluencerApplicationHTML(influencerName: string): string {
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
            <h1>Welcome to the Influencer Program!</h1>
          </div>
          <div class="content">
            <p>Hi ${influencerName},</p>
            
            <p>Thank you for applying to become a 247 Print Network influencer! We're excited about your interest in partnering with us.</p>
            
            <div class="info">
              <strong>Application Status:</strong> Pending Review<br>
              <strong>Review Timeline:</strong> 24-48 hours<br>
              <strong>Next Steps:</strong> We'll email you once approved
            </div>
            
            <p><strong>What Happens Next:</strong></p>
            <ol>
              <li>Our team will review your application within 1-2 business days</li>
              <li>We'll evaluate your platform, audience, and alignment with our brand</li>
              <li>Upon approval, you'll receive your unique affiliate code</li>
              <li>Start promoting and earning commissions immediately!</li>
            </ol>
            
            <p><strong>Commission Structure:</strong></p>
            <ul>
              <li><strong>Bronze (Start):</strong> 20% commission</li>
              <li><strong>Silver ($500/month):</strong> 25% commission</li>
              <li><strong>Gold ($2,000/month):</strong> 30% commission</li>
              <li><strong>Platinum ($5,000/month):</strong> 35% commission</li>
              <li><strong>Elite ($10,000/month):</strong> 40% commission</li>
            </ul>
            
            <p>We review applications carefully to ensure quality partnerships that benefit both our artists and influencers. You'll hear from us soon!</p>
            
            <p>If you have any questions in the meantime, feel free to reply to this email.</p>
            
            <p>Best regards,<br>247 Print Network Partnerships Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getInfluencerApplicationText(influencerName: string): string {
    return `
Welcome to the Influencer Program!

Hi ${influencerName},

Thank you for applying to become a 247 Print Network influencer! We're excited about your interest in partnering with us.

APPLICATION STATUS: Pending Review
REVIEW TIMELINE: 24-48 hours
NEXT STEPS: We'll email you once approved

What Happens Next:
1. Our team will review your application within 1-2 business days
2. We'll evaluate your platform, audience, and alignment with our brand
3. Upon approval, you'll receive your unique affiliate code
4. Start promoting and earning commissions immediately!

COMMISSION STRUCTURE:
• Bronze (Start): 20% commission
• Silver ($500/month): 25% commission
• Gold ($2,000/month): 30% commission
• Platinum ($5,000/month): 35% commission
• Elite ($10,000/month): 40% commission

We review applications carefully to ensure quality partnerships that benefit both our artists and influencers. You'll hear from us soon!

If you have any questions in the meantime, feel free to reply to this email.

Best regards,
247 Print Network Partnerships Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  private getInfluencerApprovalHTML(influencerName: string, affiliateCode: string): string {
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/influencer/dashboard`;
    const affiliateUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/?ref=${affiliateCode}`;
    
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
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          .code-box { background: #f3f4f6; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Approved!</h1>
          </div>
          <div class="content">
            <p>Hi ${influencerName},</p>
            
            <div class="success">
              <strong>Congratulations!</strong> Your influencer application has been approved. Welcome to the 247 Print Network family!
            </div>
            
            <p><strong>Your Unique Affiliate Code:</strong></p>
            <div class="code-box">
              <h2 style="margin: 0; color: #667eea; font-size: 28px;">${affiliateCode}</h2>
              <p style="margin: 10px 0 0 0; color: #666;">Share this link with your audience</p>
              <p style="word-break: break-all; color: #667eea; margin: 10px 0 0 0;">${affiliateUrl}</p>
            </div>
            
            <p><strong>Getting Started:</strong></p>
            <ol>
              <li><strong>Access Your Dashboard:</strong> View real-time stats, earnings, and performance metrics</li>
              <li><strong>Share Your Link:</strong> Promote your affiliate link across social media, blog, email, etc.</li>
              <li><strong>Track Conversions:</strong> Monitor clicks, artist signups, and sales in real-time</li>
              <li><strong>Earn Commissions:</strong> Get paid for every sale from artists you recruit</li>
            </ol>
            
            <p><strong>Your Commission Tiers:</strong></p>
            <ul>
              <li><strong>Bronze (Current):</strong> 20% commission - You're starting here!</li>
              <li><strong>Silver:</strong> 25% at $500/month in sales</li>
              <li><strong>Gold:</strong> 30% at $2,000/month</li>
              <li><strong>Platinum:</strong> 35% at $5,000/month</li>
              <li><strong>Elite:</strong> 40% at $10,000/month</li>
            </ul>
            
            <p><strong>Dashboard Features:</strong></p>
            <ul>
              <li>Real-time click and conversion tracking</li>
              <li>Tier progress visualization</li>
              <li>Earnings breakdown and payout history</li>
              <li>Achievement unlocking and leaderboard rankings</li>
              <li>Active challenges with prizes</li>
            </ul>
            
            <a href="${dashboardUrl}" class="button">Go to Your Dashboard</a>
            
            <p><strong>Pro Tips for Success:</strong></p>
            <ul>
              <li>Share authentic stories about the artists and their work</li>
              <li>Use UTM parameters to track which campaigns perform best</li>
              <li>Engage with your audience - answer questions about the platform</li>
              <li>Highlight the royalty structure to attract quality artists</li>
              <li>Join our monthly challenges for bonus payouts</li>
            </ul>
            
            <p>We're excited to partner with you! If you have any questions or need marketing materials, reply to this email.</p>
            
            <p>Best regards,<br>247 Print Network Partnerships Team</p>
          </div>
          <div class="footer">
            <p>© 2025 247 Print Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getInfluencerApprovalText(influencerName: string, affiliateCode: string): string {
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/influencer/dashboard`;
    const affiliateUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/?ref=${affiliateCode}`;
    
    return `
You're Approved!

Hi ${influencerName},

Congratulations! Your influencer application has been approved. Welcome to the 247 Print Network family!

YOUR UNIQUE AFFILIATE CODE: ${affiliateCode}

Share this link with your audience:
${affiliateUrl}

GETTING STARTED:
1. Access Your Dashboard: View real-time stats, earnings, and performance metrics
2. Share Your Link: Promote your affiliate link across social media, blog, email, etc.
3. Track Conversions: Monitor clicks, artist signups, and sales in real-time
4. Earn Commissions: Get paid for every sale from artists you recruit

YOUR COMMISSION TIERS:
• Bronze (Current): 20% commission - You're starting here!
• Silver: 25% at $500/month in sales
• Gold: 30% at $2,000/month
• Platinum: 35% at $5,000/month
• Elite: 40% at $10,000/month

DASHBOARD FEATURES:
• Real-time click and conversion tracking
• Tier progress visualization
• Earnings breakdown and payout history
• Achievement unlocking and leaderboard rankings
• Active challenges with prizes

Go to Your Dashboard: ${dashboardUrl}

PRO TIPS FOR SUCCESS:
• Share authentic stories about the artists and their work
• Use UTM parameters to track which campaigns perform best
• Engage with your audience - answer questions about the platform
• Highlight the royalty structure to attract quality artists
• Join our monthly challenges for bonus payouts

We're excited to partner with you! If you have any questions or need marketing materials, reply to this email.

Best regards,
247 Print Network Partnerships Team

© 2025 247 Print Network. All rights reserved.
    `.trim();
  }

  async sendSubscriptionConfirmation(
    artistEmail: string,
    artistName: string,
    artistId: string,
    tier: 'pro' | 'elite',
    periodEnd: Date
  ) {
    const tierName = tier === 'pro' ? 'Pro' : 'Elite';
    const tierPrice = tier === 'pro' ? '$15-20' : '$40-50';
    const tierRoyalty = tier === 'pro' ? '35%' : '45%';
    const nextBillingDate = periodEnd.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });

    const subject = `Welcome to ${tierName} - Your Subscription is Active!`;
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;

    const bodyHtml = `
      <p>Hi ${artistName},</p>
      
      <div class="success">
        <strong>Your ${tierName} subscription is now active!</strong> Thank you for upgrading your 247 Print Network account.
      </div>
      
      <p><strong>Your ${tierName} Benefits:</strong></p>
      <ul>
        <li>💰 <strong>${tierRoyalty} minimum royalty</strong> on all sales${tier === 'elite' ? ' (guaranteed max tier!)' : ''}</li>
        <li>🎨 <strong>Unlimited artwork uploads</strong> - no monthly limits</li>
        ${tier === 'pro' ? '<li>🤖 <strong>50 AI Art Studio credits/month</strong> for generating new artwork with DALL-E 3</li>' : '<li>🤖 <strong>Unlimited AI Art Studio access</strong> - generate as many designs as you need</li>'}
        ${tier === 'elite' ? '<li>⚡ <strong>Priority review</strong> for artwork submissions</li>' : ''}
        ${tier === 'elite' ? '<li>🎯 <strong>Full profile customization</strong> - make your artist page stand out</li>' : ''}
      </ul>
      
      <div class="info">
        <strong>🏆 Homepage Featured Artist System${tier === 'elite' ? ' (Guaranteed!)' : ''}:</strong><br>
        ${tier === 'elite' 
          ? 'As an Elite member, you\'re guaranteed homepage placement through our hybrid rotation system:<br><br><strong>2 Performance Slots:</strong> Reserved for top sellers (you can compete for constant visibility)<br><strong>2 Rotation Slots:</strong> Fair cycling ensures all Elite artists get homepage time<br><br>Your artwork will be prominently featured to every visitor!' 
          : 'As a Pro member, you\'re eligible for our fair homepage rotation system:<br><br><strong>2 Performance Slots:</strong> Top sellers by tier + monthly sales (compete with other artists)<br><strong>2 Rotation Slots:</strong> Fair cycling ensures all Pro artists get homepage exposure<br><br>We track when you\'re last featured and rotate fairly - everyone gets their turn!'
        }
      </div>
      
      <div class="info">
        <strong>Billing Information:</strong><br>
        Plan: ${tierName} - ${tierPrice}/month<br>
        Next billing date: ${nextBillingDate}<br>
        Payment method: Card ending in your saved payment method
      </div>
      
      <p><strong>What's Next:</strong></p>
      <ol>
        <li>Upload unlimited artwork to maximize your earnings</li>
        <li>Use AI Art Studio to create new designs faster (${tier === 'pro' ? '50 credits/month' : 'unlimited'})</li>
        <li>Watch your homepage rotation bring in new customers</li>
        <li>Watch your royalty earnings grow at ${tierRoyalty}${tier === 'elite' ? '' : '+'}</li>
        <li>Track your performance in your enhanced dashboard</li>
      </ol>
      
      ${tier === 'pro' ? `
      <div class="info">
        <strong>💡 Want Even More?</strong><br>
        Elite tier offers 45% royalty guarantee, unlimited AI Studio, priority review, and guaranteed homepage placement. <a href="${dashboardUrl}#settings">Explore Elite benefits</a>
      </div>
      ` : ''}
      
      <a href="${dashboardUrl}" class="button">Go to Your Dashboard</a>
      
      <p>Questions about your subscription or featured rotation? Just reply to this email and we'll help!</p>
      
      <p>Best regards,<br>247 Print Network Team</p>
    `;

    const textBody = `
Welcome to ${tierName} - Your Subscription is Active!

Hi ${artistName},

Your ${tierName} subscription is now active! Thank you for upgrading your 247 Print Network account.

YOUR ${tierName.toUpperCase()} BENEFITS:
💰 ${tierRoyalty} minimum royalty on all sales${tier === 'elite' ? ' (guaranteed max tier!)' : ''}
🎨 Unlimited artwork uploads - no monthly limits
${tier === 'pro' ? '🤖 50 AI Art Studio credits/month for generating new artwork with DALL-E 3' : '🤖 Unlimited AI Art Studio access - generate as many designs as you need'}
${tier === 'elite' ? '⚡ Priority review for artwork submissions' : ''}
${tier === 'elite' ? '🎯 Full profile customization - make your artist page stand out' : ''}

🏆 HOMEPAGE FEATURED ARTIST SYSTEM${tier === 'elite' ? ' (GUARANTEED!)' : ''}:
${tier === 'elite' 
  ? 'As an Elite member, you\'re guaranteed homepage placement through our hybrid rotation system:\n\n2 PERFORMANCE SLOTS: Reserved for top sellers (you can compete for constant visibility)\n2 ROTATION SLOTS: Fair cycling ensures all Elite artists get homepage time\n\nYour artwork will be prominently featured to every visitor!' 
  : 'As a Pro member, you\'re eligible for our fair homepage rotation system:\n\n2 PERFORMANCE SLOTS: Top sellers by tier + monthly sales (compete with other artists)\n2 ROTATION SLOTS: Fair cycling ensures all Pro artists get homepage exposure\n\nWe track when you\'re last featured and rotate fairly - everyone gets their turn!'
}

BILLING INFORMATION:
Plan: ${tierName} - ${tierPrice}/month
Next billing date: ${nextBillingDate}
Payment method: Card ending in your saved payment method

WHAT'S NEXT:
1. Upload unlimited artwork to maximize your earnings
2. Use AI Art Studio to create new designs faster (${tier === 'pro' ? '50 credits/month' : 'unlimited'})
3. Watch your homepage rotation bring in new customers
4. Watch your royalty earnings grow at ${tierRoyalty}${tier === 'elite' ? '' : '+'}
5. Track your performance in your enhanced dashboard

${tier === 'pro' ? `💡 WANT EVEN MORE?
Elite tier offers 45% royalty guarantee, unlimited AI Studio, priority review, and guaranteed homepage placement. Explore Elite benefits: ${dashboardUrl}#settings

` : ''}Go to Your Dashboard: ${dashboardUrl}

Questions about your subscription or featured rotation? Just reply to this email and we'll help!

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();

    const htmlBody = this.renderEmailLayout({
      title: `Welcome to ${tierName}!`,
      headerColor: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      bodyHtml
    });

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'subscription_confirmed',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName, tier, periodEnd: periodEnd.toISOString() },
    });
  }

  async sendPaymentFailed(
    artistEmail: string,
    artistName: string,
    artistId: string,
    tier: 'pro' | 'elite',
    subscriptionId?: string,
    invoiceId?: string
  ) {
    const tierName = tier === 'pro' ? 'Pro' : 'Elite';
    const subject = 'Payment Failed - Action Required for Your Subscription';
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;

    const bodyHtml = `
      <p>Hi ${artistName},</p>
      
      <div class="warning">
        <strong>Payment Unsuccessful:</strong> We were unable to process your payment for your ${tierName} subscription.
      </div>
      
      <p><strong>What This Means:</strong></p>
      <ul>
        <li>Your ${tierName} benefits are currently on hold</li>
        <li>You still have access to free tier features</li>
        <li>We'll retry payment automatically over the next few days</li>
      </ul>
      
      <p><strong>How to Fix This:</strong></p>
      <ol>
        <li>Update your payment method in your dashboard</li>
        <li>Make sure your card has sufficient funds</li>
        <li>Check that your billing address is correct</li>
      </ol>
      
      <div class="info">
        <strong>Need Help?</strong><br>
        Common issues include expired cards, insufficient funds, or incorrect billing information. Updating your payment method will immediately restore your ${tierName} benefits.
      </div>
      
      <a href="${dashboardUrl}" class="button">Update Payment Method</a>
      
      <p>If you're experiencing financial difficulty, please reply to this email to discuss options. We're here to help!</p>
      
      <p>Best regards,<br>247 Print Network Team</p>
    `;

    const textBody = `
Payment Failed - Action Required for Your Subscription

Hi ${artistName},

We were unable to process your payment for your ${tierName} subscription.

WHAT THIS MEANS:
• Your ${tierName} benefits are currently on hold
• You still have access to free tier features
• We'll retry payment automatically over the next few days

HOW TO FIX THIS:
1. Update your payment method in your dashboard
2. Make sure your card has sufficient funds
3. Check that your billing address is correct

NEED HELP?
Common issues include expired cards, insufficient funds, or incorrect billing information. Updating your payment method will immediately restore your ${tierName} benefits.

Update Payment Method: ${dashboardUrl}

If you're experiencing financial difficulty, please reply to this email to discuss options. We're here to help!

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();

    const htmlBody = this.renderEmailLayout({
      title: 'Payment Failed',
      headerColor: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      bodyHtml
    });

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'payment_failed',
      subject,
      htmlBody,
      textBody,
      metadata: { 
        artistName, 
        tier, 
        subscriptionId, 
        invoiceId 
      },
    });
  }

  async sendPayoutNotification(
    artistEmail: string,
    artistName: string,
    artistId: string,
    amount: number,
    payoutId: string
  ) {
    const formattedAmount = (amount / 100).toFixed(2);
    const subject = `Payout Sent - $${formattedAmount} On Its Way!`;
    const dashboardUrl = `${process.env.VITE_SITE_URL || 'http://localhost:5000'}/artist/dashboard`;

    const bodyHtml = `
      <p>Hi ${artistName},</p>
      
      <div class="success">
        <strong>Great news!</strong> Your royalty payout has been sent to your Stripe Connect account.
      </div>
      
      <p><strong>Payout Details:</strong></p>
      <div class="info">
        Amount: $${formattedAmount}<br>
        Payout ID: ${payoutId}<br>
        Status: Processing<br>
        Expected in your bank: 2-3 business days
      </div>
      
      <p><strong>What Happens Next:</strong></p>
      <ol>
        <li>Stripe processes the payout (usually instant)</li>
        <li>Your bank receives the funds (1-3 business days)</li>
        <li>Funds appear in your connected bank account</li>
      </ol>
      
      <p><strong>Track Your Earnings:</strong></p>
      <ul>
        <li>View detailed sales breakdowns in your dashboard</li>
        <li>See which artworks are earning the most</li>
        <li>Monitor your royalty tier progress</li>
        <li>Access complete payout history</li>
      </ul>
      
      <a href="${dashboardUrl}" class="button">View Earnings Dashboard</a>
      
      <p>Keep creating amazing artwork! Every sale earns you 30-45% royalties.</p>
      
      <p>Best regards,<br>247 Print Network Team</p>
    `;

    const textBody = `
Payout Sent - $${formattedAmount} On Its Way!

Hi ${artistName},

Great news! Your royalty payout has been sent to your Stripe Connect account.

PAYOUT DETAILS:
Amount: $${formattedAmount}
Payout ID: ${payoutId}
Status: Processing
Expected in your bank: 2-3 business days

WHAT HAPPENS NEXT:
1. Stripe processes the payout (usually instant)
2. Your bank receives the funds (1-3 business days)
3. Funds appear in your connected bank account

TRACK YOUR EARNINGS:
• View detailed sales breakdowns in your dashboard
• See which artworks are earning the most
• Monitor your royalty tier progress
• Access complete payout history

View Earnings Dashboard: ${dashboardUrl}

Keep creating amazing artwork! Every sale earns you 30-45% royalties.

Best regards,
247 Print Network Team

© 2025 247 Print Network. All rights reserved.
    `.trim();

    const htmlBody = this.renderEmailLayout({
      title: 'Payout Sent!',
      headerColor: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      bodyHtml
    });

    return this.sendEmail({
      recipientEmail: artistEmail,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'payout_notification',
      subject,
      htmlBody,
      textBody,
      metadata: { artistName, amount, payoutId },
    });
  }
}

export const emailService = new EmailService();
