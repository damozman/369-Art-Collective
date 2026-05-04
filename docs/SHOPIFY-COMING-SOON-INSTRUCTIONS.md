# Shopify Coming Soon Page - Deployment Instructions

## Overview
This Coming Soon page is designed for your Shopify store at 369artcollective.com. It features:
- Bold hero section with "Where Artists Build Profitable Empires" messaging
- Dual value propositions for customers and artists
- Platform highlights explaining how it works
- Email waitlist signup form that connects to your Replit backend

## Installation Steps

### Option 1: Use as Shopify Password Page (Recommended)

1. **Log in to Shopify Admin**
   - Go to your Shopify admin panel

2. **Access Theme Editor**
   - Navigate to: Online Store → Themes
   - Click "Customize" on your active theme

3. **Enable Password Protection**
   - Go to: Online Store → Preferences
   - Scroll to "Password protection"
   - Check "Enable password" if not already enabled
   - Save

4. **Edit Password Page Template**
   - In your theme editor, go to Templates
   - Find and edit `password.liquid`
   - Replace the entire content with the code from `shopify-coming-soon.html`

5. **Update API Endpoint**
   - In the HTML file, find this line (near the bottom in the JavaScript):
   ```javascript
   const response = await fetch('https://YOUR-REPLIT-APP.replit.app/api/waitlist', {
   ```
   - Replace `YOUR-REPLIT-APP.replit.app` with your actual Replit app URL
   - For example: `https://247portal.replit.app/api/waitlist`

6. **Save and Preview**
   - Save your changes
   - Visit your store while logged out to see the password page

### Option 2: Use as a Custom Page

1. **Create New Page**
   - Go to: Online Store → Pages
   - Click "Add page"
   - Title: "Coming Soon"

2. **Switch to HTML Editor**
   - Click the "Show HTML" button (usually in the editor toolbar)

3. **Paste Content**
   - Copy everything from `shopify-coming-soon.html`
   - Paste into the HTML editor
   - Don't forget to update the API endpoint URL (see step 5 above)

4. **Save and Set as Homepage**
   - Save the page
   - Go to: Online Store → Preferences
   - Under "Homepage", select your new "Coming Soon" page

## Important Configuration

### Update the API Endpoint
The waitlist form needs to connect to your Replit backend. You MUST update this URL:

**Find this line in the JavaScript section:**
```javascript
const response = await fetch('https://YOUR-REPLIT-APP.replit.app/api/waitlist', {
```

**Replace with your actual Replit app URL:**
```javascript
const response = await fetch('https://247portal.replit.app/api/waitlist', {
```

### Test the Waitlist Form

1. Visit your Coming Soon page
2. Fill out the waitlist form
3. Submit
4. Check your Replit app admin dashboard to see if the entry was saved
5. Check your email for the admin notification

## Customization

### Change Colors
The page uses a purple gradient (`#667eea` to `#764ba2`). To change:

1. Find all instances of these color codes in the CSS
2. Replace with your brand colors
3. Update the gradient values

### Change Text
All text can be edited directly in the HTML:
- Hero headline: `<h1>Where Artists Build Profitable Empires</h1>`
- Hero subtext: `<p>The revolutionary print-on-demand...`
- Value propositions: Edit the content in `.prop-card` sections
- Steps: Edit the content in `.step` sections

### Add Logo
Replace the text logo in the footer with an image:
```html
<div class="footer-logo">
  <img src="your-logo-url.png" alt="369 Art Collective" style="max-width: 200px;">
</div>
```

## Troubleshooting

### Waitlist Form Not Working
1. Check browser console for errors (F12 → Console)
2. Verify the API endpoint URL is correct
3. Make sure your Replit app is running
4. Check CORS settings on your Replit backend

### Page Not Showing
1. Verify password protection is enabled (if using password page)
2. Clear your browser cache
3. Check that you're viewing while logged out

### Styling Issues
1. Some Shopify themes may inject their own CSS
2. You may need to add `!important` to critical styles
3. Test on mobile devices and different browsers

## Support

If you need help:
1. Check your Replit app logs for API errors
2. Test the API endpoint directly using a tool like Postman
3. Verify the waitlist table exists in your database
