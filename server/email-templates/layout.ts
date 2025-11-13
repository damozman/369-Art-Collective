// Shared email layout with professional styling
// Used by all transactional emails for consistent branding

interface EmailLayoutProps {
  preheader?: string;
  children: string;
}

export function emailLayout({ preheader, children }: EmailLayoutProps): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>247 Print Network</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f4f4f4;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #333333;
      font-size: 24px;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .content p {
      color: #666666;
      font-size: 16px;
      margin: 0 0 16px;
    }
    .button {
      display: inline-block;
      padding: 16px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      text-align: center;
    }
    .button:hover {
      opacity: 0.9;
    }
    .benefits {
      background-color: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
    }
    .benefits ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .benefits li {
      color: #666666;
      margin: 8px 0;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .footer p {
      color: #999999;
      font-size: 14px;
      margin: 8px 0;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .highlight {
      background-color: #fff4e6;
      border-left: 4px solid #ff9800;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .preheader {
      display: none;
      font-size: 1px;
      color: #ffffff;
      line-height: 1px;
      max-height: 0px;
      max-width: 0px;
      opacity: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  ${preheader ? `<div class="preheader">${preheader}</div>` : ''}
  <div class="email-container">
    <div class="header">
      <h1>247 Print Network</h1>
    </div>
    <div class="content">
      ${children}
    </div>
    <div class="footer">
      <p><strong>247 Print Network</strong> - Artist-Powered Print-on-Demand Marketplace</p>
      <p>
        <a href="{{unsubscribeUrl}}">Unsubscribe</a> | 
        <a href="https://{{domain}}/artist/settings">Manage Subscription</a> | 
        <a href="https://{{domain}}/contact">Contact Support</a>
      </p>
      <p>&copy; ${new Date().getFullYear()} 3six9 Media Masters LLC. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
