# 3six9 Media Masters - Production Deployment Runbook

**Last Updated:** November 12, 2025  
**Version:** 1.0  
**Platforms:** 247 Print Network (POD Marketplace) + 247 CreatorStack (Digital Kits)

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Variables](#environment-variables)
3. [Database Setup](#database-setup)
4. [Integration Configuration](#integration-configuration)
5. [Health Check Verification](#health-check-verification)
6. [Email System Monitoring](#email-system-monitoring)
7. [Security Configuration](#security-configuration)
8. [Post-Deployment Validation](#post-deployment-validation)
9. [Troubleshooting](#troubleshooting)
10. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

Before deploying to production, ensure:

- [ ] All environment variables are configured (see `.env.example`)
- [ ] Database connection is verified
- [ ] All API keys are valid and active
- [ ] Webhook endpoints are properly secured with HMAC verification
- [ ] Email service (Resend) is configured and tested
- [ ] Health check endpoint returns 200 OK
- [ ] SSL/TLS certificates are valid
- [ ] Session secret is cryptographically secure (32+ characters)
- [ ] Rate limiting is enabled on all public endpoints
- [ ] Audit logging is enabled for sensitive operations

---

## Environment Variables

### Required Variables

Copy `.env.example` to `.env` and configure the following:

#### Core Application
```bash
NODE_ENV=production
PORT=5000
SESSION_SECRET=<cryptographically-secure-random-string-32+chars>
VITE_SITE_URL=https://your-production-domain.com
```

#### Database (Replit PostgreSQL)
```bash
DATABASE_URL=<provided-by-replit>
PGHOST=<provided-by-replit>
PGPORT=<provided-by-replit>
PGUSER=<provided-by-replit>
PGPASSWORD=<provided-by-replit>
PGDATABASE=<provided-by-replit>
```

#### Stripe (Payment Processing & Subscriptions)
```bash
STRIPE_SECRET_KEY=sk_live_...
VITE_STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Setup Instructions:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to Developers → API Keys
3. Copy "Secret key" → `STRIPE_SECRET_KEY`
4. Copy "Publishable key" → `VITE_STRIPE_PUBLIC_KEY`
5. Navigate to Developers → Webhooks
6. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
7. Select events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
8. Copy "Signing secret" → `STRIPE_WEBHOOK_SECRET`

#### Shopify (Storefront & Order Management)
```bash
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
SHOPIFY_WEBHOOK_SECRET=<random-secure-string>
```

**Setup Instructions:**
1. Go to Shopify Admin → Apps → Develop apps
2. Create custom app: "247 Print Network Backend"
3. Configure Admin API scopes:
   - `read_products`, `write_products`
   - `read_orders`, `write_orders`
   - `read_inventory`, `write_inventory`
   - `read_themes`, `write_themes`
4. Install app and copy "Admin API access token" → `SHOPIFY_ACCESS_TOKEN`
5. Set `SHOPIFY_STORE_URL` to your store domain (without https://)
6. Generate random secret (32+ chars) → `SHOPIFY_WEBHOOK_SECRET`
7. Configure webhooks:
   - Go to Settings → Notifications → Webhooks
   - Add webhook: `https://your-domain.com/api/webhooks/shopify/orders`
   - Format: JSON
   - Event: Order creation
   - Include `X-Shopify-Hmac-SHA256` header

#### Printify (Print-on-Demand Fulfillment)
```bash
PRINTIFY_API_TOKEN=<your-printify-token>
PRINTIFY_SHOP_ID=<your-shop-id>
```

**Setup Instructions:**
1. Go to [Printify](https://printify.com) → Settings → Connections
2. Generate API token → `PRINTIFY_API_TOKEN`
3. Copy Shop ID from store settings → `PRINTIFY_SHOP_ID`

#### OpenAI (AI Art Studio - DALL-E 3 & GPT-4o)

**Replit AI Integration (Automatic Setup):**
```bash
AI_INTEGRATIONS_OPENAI_BASE_URL=https://openai-proxy.replit.ai/v1
AI_INTEGRATIONS_OPENAI_API_KEY=<auto-configured-by-replit>
```

**Setup Instructions:**
1. In Replit project, navigate to "Tools" → "AI" tab
2. Click "Enable OpenAI Integration"
3. The following variables are automatically configured:
   - `AI_INTEGRATIONS_OPENAI_BASE_URL`
   - `AI_INTEGRATIONS_OPENAI_API_KEY`
4. **Important:** Replit manages OpenAI billing and rate limits automatically
5. Monitor usage in Replit dashboard under "AI Usage"

**Note:** This integration uses Replit's OpenAI proxy, which handles authentication and usage tracking. You do NOT need to manually create OpenAI API keys.

#### Resend (Email Service)

**Replit Connector Integration (Automatic Setup):**
```bash
REPLIT_CONNECTORS_HOSTNAME=<auto-configured-by-replit>
REPL_IDENTITY=<auto-configured-by-replit>
WEB_REPL_RENEWAL=<auto-configured-by-replit>
```

**Setup Instructions:**
1. In Replit project, navigate to "Tools" → "Integrations"
2. Search for "Resend" and click "Connect"
3. Follow OAuth flow to connect your Resend account
4. Configure sending domain and from email in the connector settings
5. The following variables are automatically configured:
   - `REPLIT_CONNECTORS_HOSTNAME`
   - `REPL_IDENTITY` (or `WEB_REPL_RENEWAL` for deployments)
6. The application fetches Resend credentials dynamically at runtime

**Note:** This integration uses Replit's connector service, which securely manages Resend API credentials. You do NOT need to manually set `RESEND_API_KEY`. The connector handles:
- API key rotation
- Domain verification
- From email configuration

**Verify Connection:**
After setup, the application will automatically fetch:
- `api_key` from connector settings (used to send emails)
- `from_email` from connector settings (sender address)

---

## Database Setup

### Initial Migration

The application uses Drizzle ORM with PostgreSQL. Schema is defined in `shared/schema.ts`.

**Deploy schema to database:**
```bash
npm run db:push
```

If you encounter data-loss warnings (e.g., changing column types), force the push:
```bash
npm run db:push --force
```

**CRITICAL:** Never manually change primary key ID types (`serial` ↔ `varchar`). This breaks existing data.

### Database Indexes

The following indexes are critical for production performance:

**Email System (emailLogs table):**
- `idx_email_logs_recipient` on `(recipientId, emailType, status)`
- Used for idempotency guards when checking duplicate emails

**Artist Subscription System (artists table):**
- Unique index on `stripeCustomerId`
- Unique index on `stripeSubscriptionId`
- Regular index on `(subscriptionTier, subscriptionStatus)`
- Used for high-volume subscription lookups

**Audit Logging (adminActions table):**
- Index on `(adminId, timestamp)`
- Used for security audits and compliance

These indexes are defined in `shared/schema.ts` and created automatically via `npm run db:push`.

### Default Admin Account

On first run, the application creates a default admin account:
- **Email:** `admin@247print.network`
- **Password:** `Admin123!`

**⚠️ SECURITY CRITICAL:**
1. Log in immediately after deployment
2. Change the password to a strong, unique value
3. Update the email to your actual admin email
4. Delete or disable this account if you create a new admin

---

## Integration Configuration

### Stripe Connect (Artist Payouts)

The application uses Stripe for artist subscription billing but **does not yet** have automated payout functionality implemented.

**Current State:**
- Subscription management: ✅ Fully implemented
- Royalty calculation: ✅ Implemented (30-45% based on tier)
- Automated payouts: ❌ Not yet implemented

**When payout service is added:**
1. Enable Stripe Connect in Stripe Dashboard
2. Configure platform settings
3. Update webhook events to include Connect-related events
4. Test payout flow in Stripe test mode before going live

### Webhook Security

All webhooks verify HMAC signatures to prevent spoofing:

**Stripe:** Uses `STRIPE_WEBHOOK_SECRET` with SHA-256
**Shopify:** Uses `SHOPIFY_WEBHOOK_SECRET` with SHA-256
**Printify:** No webhooks currently used (polling-based)

**Verification Process:**
1. Webhook receives request with signature header
2. Server recomputes HMAC using shared secret
3. Compares computed vs received signature (constant-time comparison)
4. Rejects request if signatures don't match

**Testing Webhooks:**
```bash
# Stripe CLI for local testing
stripe listen --forward-to localhost:5000/api/webhooks/stripe
stripe trigger customer.subscription.created

# Shopify CLI for local testing
shopify webhook trigger orders/create
```

---

## Health Check Verification

### Endpoint: `GET /api/health`

Returns comprehensive status of all integrations.

**Expected Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T03:20:00.000Z",
  "services": {
    "database": {
      "status": "up",
      "responseTime": 12,
      "details": {
        "connection": "successful",
        "tables": ["artists", "artworks", "emailLogs", ...]
      }
    },
    "stripe": {
      "status": "up",
      "responseTime": 145,
      "details": {
        "api_version": "2023-10-16",
        "account_id": "acct_xxx"
      }
    },
    "shopify": {
      "status": "up",
      "responseTime": 203,
      "details": {
        "store": "your-store.myshopify.com",
        "product_count": 88
      }
    },
    "printify": {
      "status": "up",
      "responseTime": 178,
      "details": {
        "shop_id": "123456",
        "connection": "authenticated"
      }
    },
    "openai": {
      "status": "up",
      "responseTime": 234,
      "details": {
        "models": ["dall-e-3", "gpt-4o"]
      }
    },
    "email": {
      "status": "up",
      "responseTime": 98,
      "details": {
        "provider": "resend",
        "from_domain": "your-domain.com"
      }
    }
  }
}
```

**Error Response (503 Service Unavailable):**
```json
{
  "status": "unhealthy",
  "timestamp": "2025-11-12T03:20:00.000Z",
  "services": {
    "database": { "status": "up", ... },
    "stripe": {
      "status": "down",
      "error": "Authentication failed: Invalid API key",
      "details": null
    },
    ...
  }
}
```

**Monitoring Setup:**
1. Configure uptime monitoring (Pingdom, UptimeRobot, etc.)
2. Point monitor to `https://your-domain.com/api/health`
3. Alert on non-200 responses
4. Check every 5 minutes
5. Set up PagerDuty/Slack alerts for downtime

**Manual Testing:**
```bash
curl https://your-domain.com/api/health
```

---

## Email System Monitoring

### Email Logging Architecture

All emails are logged to the `emailLogs` table with comprehensive metadata for audit trails and idempotency.

**Schema:**
```typescript
{
  id: number,                    // Auto-increment primary key
  recipientEmail: string,        // Who received the email
  recipientType: 'artist' | 'customer' | 'admin',
  recipientId: string,           // Artist ID, customer ID, etc.
  emailType: string,             // 'subscription_confirmed', 'payment_failed', etc.
  subject: string,               // Email subject line
  status: 'sent' | 'failed',     // Delivery status
  sentAt: timestamp,             // When email was sent
  errorMessage: string | null,   // Error details if failed
  metadata: jsonb                // Additional context (see below)
}
```

### Critical Metadata Fields

The `metadata` JSONB column stores event-specific context for idempotency and debugging:

**Subscription Confirmation Emails:**
```json
{
  "artistName": "John Doe",
  "tier": "pro",
  "periodEnd": "2025-12-12T03:20:00.000Z",
  "subscriptionId": "sub_xxx"    // ← Critical for idempotency
}
```

**Payment Failed Emails:**
```json
{
  "artistName": "John Doe",
  "tier": "elite",
  "subscriptionId": "sub_xxx",
  "invoiceId": "in_xxx"          // ← Critical for idempotency
}
```

**Payout Notification Emails:**
```json
{
  "artistName": "John Doe",
  "amount": 350.00,
  "period": "October 2025",
  "payoutId": "po_xxx"           // Future: when payout service is implemented
}
```

### Idempotency Guarantees

To prevent duplicate emails on webhook retries, the system uses `hasEmailBeenSent()` helper:

**How It Works:**
1. Before sending email, query last 10 `emailLogs` for this artist + email type
2. Check if any log has matching metadata (e.g., same `invoiceId`)
3. If match found, skip sending (webhook retry detected)
4. If no match, send email and log with metadata

**Example: Payment Failed Email**
```typescript
// Stripe retries invoice.payment_failed webhook 3 times
// All retries have the same invoice.id

// First webhook (11:30 AM):
hasEmailBeenSent('artist123', 'payment_failed', { invoiceId: 'in_abc' })
// → Returns false (no logs with invoiceId: 'in_abc')
// → Sends email, creates log with invoiceId: 'in_abc'

// Second webhook retry (11:35 AM):
hasEmailBeenSent('artist123', 'payment_failed', { invoiceId: 'in_abc' })
// → Returns true (log found with invoiceId: 'in_abc')
// → Skips sending (duplicate detected)

// Third webhook retry (11:40 AM):
hasEmailBeenSent('artist123', 'payment_failed', { invoiceId: 'in_abc' })
// → Returns true
// → Skips sending
```

### Querying Email Logs

**Find all payment failed emails for an artist:**
```sql
SELECT * FROM "emailLogs"
WHERE "recipientId" = 'artist-uuid'
  AND "emailType" = 'payment_failed'
ORDER BY "sentAt" DESC;
```

**Find emails for a specific invoice (debugging webhook retries):**
```sql
SELECT * FROM "emailLogs"
WHERE "emailType" = 'payment_failed'
  AND metadata->>'invoiceId' = 'in_xxx'
ORDER BY "sentAt" DESC;
```

**Find emails for a specific subscription:**
```sql
SELECT * FROM "emailLogs"
WHERE metadata->>'subscriptionId' = 'sub_xxx'
ORDER BY "sentAt" DESC;
```

**Check email delivery failures (last 24 hours):**
```sql
SELECT * FROM "emailLogs"
WHERE status = 'failed'
  AND "sentAt" > NOW() - INTERVAL '24 hours'
ORDER BY "sentAt" DESC;
```

**Detect potential spam (same email type sent >3 times to same recipient in 1 hour):**
```sql
SELECT "recipientEmail", "emailType", COUNT(*) as send_count
FROM "emailLogs"
WHERE "sentAt" > NOW() - INTERVAL '1 hour'
GROUP BY "recipientEmail", "emailType"
HAVING COUNT(*) > 3
ORDER BY send_count DESC;
```

### Email Delivery Monitoring

**Key Metrics to Track:**
1. **Delivery Rate:** `(sent emails / total emails) * 100`
2. **Failure Rate:** `(failed emails / total emails) * 100`
3. **Average Send Time:** Time from trigger to delivery
4. **Duplicate Rate:** Emails blocked by idempotency guards

**Resend Dashboard:**
- Monitor bounce rate (should be < 2%)
- Monitor spam complaint rate (should be < 0.1%)
- Check domain reputation score (should be "good")
- Review delivery logs for failed sends

**Alerting Rules:**
- Alert if failure rate > 5% in last hour
- Alert if duplicate rate > 10% (indicates webhook retry issues)
- Alert if no emails sent in 24 hours (dead system)

---

## Security Configuration

### Secure Logging

All logs are scrubbed of sensitive data before output.

**Sanitized Data Types:**
- Session IDs (replaced with `[SESSION_ID_REDACTED]`)
- Stripe API keys (replaced with `sk_***`)
- Stripe customer objects (replaced with `[Stripe.Customer]`)
- API tokens for Shopify, Printify, OpenAI
- Email addresses in error messages (partially masked)

**Implementation:** See `server/lib/secure-logger.ts`

**Example Log Output:**
```
[SUCCESS][SUBSCRIPTION] Created subscription [Stripe.Subscription] for artist artist-uuid
[ERROR][WEBHOOK] Stripe signature mismatch (expected vs received redacted)
```

### Rate Limiting

**Artist Subscription Endpoints:**
- **POST /api/artists/subscription/create:** 10 requests/hour per IP
- **POST /api/artists/subscription/cancel:** 10 requests/hour per IP
- **GET /api/artists/subscription:** 100 requests/15min per IP

**Rationale:**
- Prevents abuse of Stripe API (which has its own rate limits)
- Prevents spam subscription creation
- Allows legitimate dashboard refreshes

**Configuration:** See `server/routes.ts` (express-rate-limit middleware)

### Session Management

**Session Configuration:**
- **Storage:** PostgreSQL (via connect-pg-simple)
- **Cookie:** HTTP-only, Secure (HTTPS only), SameSite=Lax
- **Rotation:** New session ID generated on login (prevents session fixation)
- **Expiration:** 7 days of inactivity

**Session Security:**
```typescript
{
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}
```

**Session Rotation on Login:**
```typescript
// Regenerate session ID after successful authentication
await new Promise<void>((resolve, reject) => {
  req.session.regenerate((err) => {
    if (err) reject(err);
    else resolve();
  });
});
```

### Audit Logging

All sensitive admin actions are logged to `adminActions` table:

**Logged Actions:**
- Artist account approval/rejection
- Artwork approval/archival
- Subscription tier changes
- Credit allocation
- Account deletions (soft delete)

**Query Recent Admin Actions:**
```sql
SELECT * FROM "adminActions"
WHERE timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

---

## Post-Deployment Validation

### 1. Verify Application Start

```bash
# Check server logs
tail -f /var/log/app.log

# Expected output:
# ✓ Default admin account already exists
# ✓ Test artist account already exists and is approved
# ✓ AI Credits: 10 free credits available
# [express] serving on port 5000
```

### 2. Test Health Check

```bash
curl https://your-domain.com/api/health

# Should return 200 OK with all services "up"
```

### 3. Test Admin Login

1. Navigate to `https://your-domain.com/admin/login`
2. Login with default credentials:
   - Email: `admin@247print.network`
   - Password: `Admin123!`
3. **Immediately change password after first login**

### 4. Test Artist Registration

1. Navigate to `https://your-domain.com/artist/register`
2. Create test artist account
3. Verify email notification sent (check Resend dashboard)
4. Approve artist in admin dashboard
5. Verify approval email sent

### 5. Test Subscription Flow (Test Mode)

**Prerequisites:**
1. Switch Stripe to test mode
2. Use test API keys: `sk_test_...` and `pk_test_...`
3. Use test webhook secret

**Test Flow:**
1. Login as test artist
2. Navigate to subscription page
3. Upgrade to Pro tier
4. Use Stripe test card: `4242 4242 4242 4242`
5. Verify subscription created in Stripe dashboard
6. Verify email sent (subscription_confirmed)
7. Check `emailLogs` table for proper metadata

### 6. Test Webhook Delivery

**Stripe:**
```bash
# Use Stripe CLI
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

**Shopify:**
1. Create test order in Shopify admin
2. Verify order captured in application logs
3. Check HMAC signature verification passed

### 7. Test AI Art Studio (if enabled)

1. Login as Pro/Elite artist
2. Navigate to AI Art Studio
3. Generate test image with DALL-E 3
4. Verify credit deduction
5. Verify image saved to storage
6. Check OpenAI usage dashboard

---

## Troubleshooting

### Issue: Health Check Returns 503

**Symptom:** `/api/health` returns service unavailable

**Diagnosis:**
```bash
curl https://your-domain.com/api/health | jq .
```

Check which service is "down" and review error message.

**Common Causes:**
1. **Database down:** Check `DATABASE_URL` and Replit PostgreSQL status
2. **Stripe down:** Verify `STRIPE_SECRET_KEY` is valid (not expired)
3. **Shopify down:** Check `SHOPIFY_ACCESS_TOKEN` permissions
4. **OpenAI down:** Verify `AI_INTEGRATIONS_OPENAI_API_KEY` is configured (Replit AI integration)
5. **Email down:** Check Resend connector is connected (Replit integrations tab)

**Resolution:**
1. Fix the failing service configuration
2. Restart application: `npm run dev`
3. Re-check health endpoint

### Issue: Emails Not Sending

**Symptom:** Email logs show status='failed'

**Diagnosis:**
```sql
SELECT * FROM "emailLogs"
WHERE status = 'failed'
ORDER BY "sentAt" DESC
LIMIT 10;
```

**Common Causes:**
1. **Resend connector not setup:** Check Replit integrations tab
2. **Missing connector credentials:** Verify `REPLIT_CONNECTORS_HOSTNAME` is set
3. **Invalid authentication token:** Check `REPL_IDENTITY` or `WEB_REPL_RENEWAL`
4. **Unverified domain:** Verify domain in Resend connector settings
5. **Invalid recipient email:** Check `errorMessage` in logs

**Resolution:**
1. Go to Replit Tools → Integrations and verify Resend is connected
2. Check that connector credentials are properly fetched (see application logs)
3. Re-connect the Resend integration if authentication fails
4. Ensure sending domain has proper DNS records (SPF, DKIM)
5. Check Resend dashboard for delivery issues

### Issue: Webhook Signature Verification Fails

**Symptom:** Logs show "HMAC signature mismatch"

**Diagnosis:**
```
[ERROR][WEBHOOK] Shopify webhook signature verification failed
```

**Common Causes:**
1. **Wrong webhook secret:** `SHOPIFY_WEBHOOK_SECRET` or `STRIPE_WEBHOOK_SECRET` doesn't match configured values
2. **Request body modified:** Middleware parsed body before verification
3. **Using test secret in production:** Stripe test secret in production environment

**Resolution:**
1. Verify webhook secrets in respective dashboards (Shopify Settings → Webhooks, Stripe Dashboard → Webhooks)
2. Ensure raw body is used for signature verification (no body parsing middleware before webhook routes)
3. Regenerate webhook secret if compromised
4. For Stripe: Use `STRIPE_WEBHOOK_SECRET` from production webhook endpoint
5. For Shopify: Ensure `SHOPIFY_WEBHOOK_SECRET` matches the secret configured in Shopify admin

### Issue: Duplicate Subscription Emails

**Symptom:** Artists receive multiple subscription confirmation emails

**Diagnosis:**
```sql
SELECT "recipientEmail", "emailType", COUNT(*) as count
FROM "emailLogs"
WHERE "emailType" = 'subscription_confirmed'
  AND "sentAt" > NOW() - INTERVAL '1 hour'
GROUP BY "recipientEmail", "emailType"
HAVING COUNT(*) > 1;
```

**Common Causes:**
1. **Idempotency guard not working:** Check `hasEmailBeenSent()` logic
2. **Missing metadata:** `subscriptionId` not being logged
3. **Webhook retry spam:** Stripe retrying faster than guard can check

**Resolution:**
1. Verify `subscriptionId` is present in `metadata` column
2. Check `hasEmailBeenSent()` queries logs properly
3. Add debouncing if webhooks arrive too quickly

### Issue: Session Expired Unexpectedly

**Symptom:** Users logged out after short time

**Diagnosis:**
Check session configuration in `server/index.ts`

**Common Causes:**
1. **Missing SESSION_SECRET:** Session cookies invalidated on restart
2. **Cookie settings incorrect:** Secure flag enabled on HTTP
3. **Session store down:** PostgreSQL connection lost

**Resolution:**
1. Set `SESSION_SECRET` in environment variables
2. Verify cookie settings match environment (HTTP vs HTTPS)
3. Check database connection

---

## Rollback Procedures

### Quick Rollback (Replit)

Replit provides automatic checkpoints and rollback functionality:

1. Navigate to Replit project
2. Click "History" tab
3. Select checkpoint before deployment
4. Click "Restore"
5. Verify application starts successfully

### Manual Rollback

**Database Schema Rollback:**
```bash
# NOT RECOMMENDED: Drizzle doesn't support down migrations
# Instead: Deploy previous schema version and run db:push
git checkout <previous-commit>
npm run db:push --force
```

**Code Rollback:**
```bash
git revert <commit-hash>
git push origin main
```

**Environment Variable Rollback:**
1. Restore previous `.env` from backup
2. Restart application

### Emergency Shutdown

If critical security issue discovered:

```bash
# Stop application immediately
pkill -f "node server/index.ts"

# Or in Replit: Stop workflow manually
```

Then:
1. Investigate issue
2. Apply security patch
3. Test thoroughly in staging
4. Redeploy

---

## Additional Resources

- **Stripe Documentation:** https://stripe.com/docs
- **Shopify Admin API:** https://shopify.dev/docs/admin-api
- **Printify API:** https://developers.printify.com
- **OpenAI API:** https://platform.openai.com/docs
- **Resend Documentation:** https://resend.com/docs
- **Drizzle ORM:** https://orm.drizzle.team

---

## Contact

**Technical Issues:** engineering@3six9media.com  
**Business Support:** support@247print.network  
**Security Concerns:** security@3six9media.com

---

**End of Deployment Runbook**
