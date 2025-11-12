import { EmailService } from '../server/lib/email-service';

async function testEmailTemplates() {
  const emailService = new EmailService();
  
  console.log('🧪 Testing Email Templates...\n');
  
  // Test data
  const testArtist = {
    email: 'test.artist@example.com',
    name: 'Alex Rivera',
    id: 'test-artist-123'
  };
  
  try {
    // Test 1: Welcome Email
    console.log('✅ Testing Welcome Email...');
    const welcomeResult = await emailService.sendWelcomeEmail(
      testArtist.email,
      testArtist.name,
      testArtist.id
    );
    console.log(`   Result: ${welcomeResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (!welcomeResult.success) console.error(`   Error: ${welcomeResult.error}`);
    
    // Test 2: Portfolio Approval Email
    console.log('\n✅ Testing Portfolio Approval Email...');
    const portfolioResult = await emailService.sendPortfolioDecisionEmail(
      testArtist.email,
      testArtist.name,
      testArtist.id,
      true
    );
    console.log(`   Result: ${portfolioResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (!portfolioResult.success) console.error(`   Error: ${portfolioResult.error}`);
    
    // Test 3: Tier Explainer Email (NEW)
    console.log('\n✅ Testing Tier Explainer Email (NEW)...');
    const tierExplainerResult = await emailService.sendTierExplainerEmail(
      testArtist.email,
      testArtist.name,
      testArtist.id
    );
    console.log(`   Result: ${tierExplainerResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (!tierExplainerResult.success) console.error(`   Error: ${tierExplainerResult.error}`);
    
    // Test 4: Subscription Confirmation - Pro
    console.log('\n✅ Testing Subscription Confirmation (Pro)...');
    const proSubResult = await emailService.sendSubscriptionConfirmation(
      testArtist.email,
      testArtist.name,
      testArtist.id,
      'pro',
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    );
    console.log(`   Result: ${proSubResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (!proSubResult.success) console.error(`   Error: ${proSubResult.error}`);
    
    // Test 5: Subscription Confirmation - Elite
    console.log('\n✅ Testing Subscription Confirmation (Elite)...');
    const eliteSubResult = await emailService.sendSubscriptionConfirmation(
      testArtist.email,
      testArtist.name,
      testArtist.id,
      'elite',
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    );
    console.log(`   Result: ${eliteSubResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (!eliteSubResult.success) console.error(`   Error: ${eliteSubResult.error}`);
    
    console.log('\n✨ Email Template Test Complete!');
    console.log('\n📧 Check your email inbox (test.artist@example.com) to verify rendering');
    console.log('   Or check email logs in the database for confirmation\n');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

testEmailTemplates();
