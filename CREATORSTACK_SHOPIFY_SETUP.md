# 🚀 CreatorStack - Shopify Launch Guide

## Quick Start: Get Your First $47 Sale

This guide will help you add the Social Media Blitz kit to Shopify and start selling within 30 minutes.

---

## 📦 Step 1: Add Product to Shopify (10 mins)

1. **Log into Shopify Admin** → Products → **Add Product**

2. **Product Details:**
   
   **Title:** `Social Media Blitz`
   
   **Description:**
   ```
   🚀 Create 30 days of social media content in just 5 minutes per day!
   
   Perfect for busy solopreneurs, coaches, and creators who need consistent social media presence without the time investment.
   
   ✅ What's Included:
   • 50 professionally designed Canva templates
   • GPT-4o AI caption generator (unlimited use!)
   • Instagram, Facebook & LinkedIn formats
   • 30 days of content in 5 min/day workflow
   • Instant download & lifetime access
   
   📱 After Purchase:
   You'll receive instant access to your buyer dashboard where you can:
   • Download all 50 Canva templates
   • Generate AI-powered captions on demand
   • Access bonus resources and quick-start guides
   
   💰 One-time payment. No subscriptions. Lifetime access.
   ```

3. **Pricing:**
   - **Price:** `$47.00`
   - **Compare at price:** (optional - e.g., `$97` to show value)

4. **Media:**
   - Upload a product mockup image
   - Add screenshot of template examples if you have them
   - (You can update these later with professional designs)

5. **⚠️ CRITICAL - SKU Setup:**
   
   Scroll to **"Variants"** section:
   - Find the **SKU** field
   - Enter **EXACTLY:** `KIT-6b1c0e1e-c854-4338-8646-7def07957218`
   
   **⚠️ This MUST be exact - no spaces, no typos!**
   
   This SKU links your Shopify product to the CreatorStack database. Without it, purchases won't unlock buyer access.

6. **Product Organization:**
   - **Product type:** `Digital Product`
   - **Vendor:** `3six9 Media Masters` (or your business name)
   - **Collections:** Add to `AI Kits` or `Digital Products` (create if needed)
   - **Tags:** `ai-kit`, `social-media`, `canva-templates`

7. **Inventory Settings:**
   - ✅ **Track quantity:** OFF (it's a digital product)
   - ✅ **Continue selling when out of stock:** ON
   - ✅ **This is a physical product:** OFF

8. **Sales channels:**
   - ✅ Enable **Online Store**
   - ✅ Enable any other channels you use

9. **Product status:**
   - Set to **Active** when ready to launch
   - Or **Draft** to preview first

10. **Click "Save"**

---

## 🔗 Step 2: Configure Webhook (5 mins)

This webhook automatically creates buyer accounts and grants access when someone purchases.

### Find Your Replit App URL:

Your webhook URL will be:
```
https://YOUR-REPLIT-USERNAME-YOUR-REPL-NAME.replit.dev/api/creatorstack/webhooks/shopify
```

**To find it:**
1. Look at your Replit webview URL
2. Or check Deployments tab for your app domain
3. Example: `https://johndoe-3six9.replit.dev/api/creatorstack/webhooks/shopify`

### Set Up the Webhook:

1. **Shopify Admin** → **Settings** → **Notifications**

2. Scroll to **"Webhooks"** section → **Create webhook**

3. **Configure:**
   - **Event:** `Order creation`
   - **Format:** `JSON`
   - **URL:** `https://YOUR-APP.replit.dev/api/creatorstack/webhooks/shopify`
   - **Webhook API version:** Latest (2024-10 or newer)

4. **Click "Save"**

5. **✅ Webhook Created!** You should see it listed as "Active"

---

## ✅ Step 3: Test Your Setup (15 mins)

### Option A: Quick Development Test (Recommended First)

Test without making a real Shopify order:

```bash
curl -X POST https://YOUR-APP.replit.dev/api/creatorstack/webhooks/shopify/test \
  -H "Content-Type: application/json" \
  -d '{
    "id": 99999999,
    "email": "test@example.com",
    "created_at": "2025-11-11T12:00:00Z",
    "total_price": "47.00",
    "line_items": [{
      "id": 88888888,
      "title": "Social Media Blitz",
      "quantity": 1,
      "price": "47.00",
      "sku": "KIT-6b1c0e1e-c854-4338-8646-7def07957218"
    }]
  }'
```

**What should happen:**
- Replit logs show: `✅ [CreatorStack] Created purchase: Buyer test@example.com → Kit Social Media Blitz`
- Response shows: `{"success":true}`

### Option B: Shopify Test Order

1. **Shopify Admin** → **Orders** → **Create order**
2. **Add "Social Media Blitz"** product
3. **Customer email:** Enter your test email (e.g., `you+test@gmail.com`)
4. **Mark as paid** (use test payment gateway if configured)
5. **Create order**

**Check Replit Logs:**
- Look for `[CreatorStack] Processing Shopify order`
- Should see buyer account created
- Should see purchase record created

### ⚠️ Known Issue: Auto-Provisioned Passwords

When webhooks create buyer accounts, they use a temporary random password. This means:

**Current Limitation:**
- Buyers can't login immediately after purchase (they don't know the password)

**Post-MVP Fix:**
- Implement password setup email (see Next Steps in replit.md)

**Workaround for Testing:**
1. Create a buyer account manually via `/creatorstack/login` (register)
2. Then make a test purchase with the same email
3. Login works because you set your own password

---

## 🎯 What Success Looks Like

### In Replit Logs:
```
[CreatorStack] Processing Shopify order: 12345678
[CreatorStack] Auto-created buyer account: buyer@email.com (ID: abc-123)
✅ [CreatorStack] Created purchase: Buyer buyer@email.com → Kit Social Media Blitz
[CreatorStack] ✅ Purchase processed: 1 items
POST /api/creatorstack/webhooks/shopify 200 OK
```

### In CreatorStack Dashboard:
1. Go to `https://YOUR-APP.replit.dev/creatorstack/dashboard`
2. Buyer can see "Social Media Blitz" kit card
3. Can access AI content generator
4. Can track kit access

---

## 🚨 Troubleshooting

### Webhook Not Working:

**1. Check Replit App is Running:**
- Green "Running" indicator in Replit
- App doesn't go to sleep (consider Replit Always On for production)

**2. Verify SKU is Exact:**
```
Correct: KIT-6b1c0e1e-c854-4338-8646-7def07957218
Wrong:   kit-6b1c0e1e-c854-4338-8646-7def07957218 (lowercase)
Wrong:   KIT-6b1c0e1e (missing rest of UUID)
```

**3. Check Webhook Deliveries in Shopify:**
- Shopify Admin → Settings → Notifications → Webhooks
- Click your webhook → "View recent deliveries"
- Should show 200 responses (green)
- If red, check error message

**4. Look at Replit Logs:**
- Check for error messages
- Look for HMAC verification failures
- Verify order is being received

### Purchase Created But No Access:

Check database:
```sql
SELECT * FROM creatorstack_purchases 
WHERE buyer_id = (SELECT id FROM creatorstack_buyers WHERE email = 'buyer@email.com');
```

Should show:
- `access_granted = true`
- `shopify_order_id` matches your order
- `kit_id` matches the Social Media Blitz kit

### Can't Login After Purchase:

This is expected (see "Auto-Provisioned Passwords" above).

**Solution:** Implement password reset email OR have buyers register first.

---

## 🎨 Optional: Make It Look Good

### Add Product Images:

1. Create a mockup showing:
   - Canva template examples
   - AI generator interface preview
   - Social media post examples

2. Use tools like:
   - Canva for mockups
   - Figma for UI previews
   - Screenshots of actual templates

### Write Better Copy:

- Add customer testimonials (if you have any)
- Show before/after examples
- Highlight time savings (5 min/day vs 2+ hours)
- Emphasize one-time payment vs subscriptions

### Create a Landing Page:

Link to `/creatorstack` from your product:
- Showcases all kits
- Explains the AI generator
- Has social proof and benefits

---

## 📊 After Your First Sale

### Immediate Actions:
1. ✅ Verify webhook processed correctly
2. ✅ Check buyer account was created
3. ✅ Test that AI generator works
4. ✅ Send manual welcome email (until auto-email is built)

### Within 24 Hours:
1. Ask for feedback
2. Monitor AI generation usage
3. Check for any errors in logs
4. Celebrate! 🎉

### Within 1 Week:
1. Collect testimonials
2. Add actual Canva template URLs to kit
3. Create bonus resources
4. Plan next kit launch

---

## 🔐 Production Checklist

Before scaling to real customers:

- [ ] Webhook URL uses HTTPS (✅ automatic with Replit)
- [ ] HMAC verification enabled (✅ already in code)
- [ ] Test endpoint disabled in production (⚠️ manual step)
- [ ] Replit app won't sleep (consider Always On)
- [ ] Error monitoring set up
- [ ] Customer support email ready
- [ ] Refund policy defined
- [ ] Password reset flow implemented

---

## 🚀 Launch Checklist

- [ ] Product created in Shopify with correct SKU
- [ ] Webhook configured and active
- [ ] Test purchase successful
- [ ] Buyer dashboard tested
- [ ] AI generator working
- [ ] Product description polished
- [ ] Images uploaded
- [ ] Price set to $47
- [ ] Ready to share product link!

---

## 🎯 Your Product URL

After publishing, your product will be at:
```
https://YOUR-SHOPIFY-STORE.com/products/social-media-blitz
```

Share this link to start making sales!

---

## 💡 Next Steps After Launch

1. **Get First 10 Sales** ($470 revenue - proof of concept!)
2. **Collect Feedback** - What do buyers love? What's confusing?
3. **Add Kit Resources** - Upload actual Canva templates and prompt library
4. **Build Email Flow** - Password setup for auto-provisioned buyers
5. **Create Second Kit** - Email Launch Rocket or Content Creation Bundle
6. **Plan Pro Tier** - $29/mo with unlimited AI generations

---

**Ready to launch? Let's get your first $47 sale! 🚀**

Questions? Check the troubleshooting section or reach out for help.
