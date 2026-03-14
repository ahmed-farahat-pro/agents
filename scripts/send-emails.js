/**
 * Email Sender for Free Materials Subscribers
 * Uses Gmail SMTP to send emails to collected subscribers
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');

// Gmail configuration
const GMAIL_USER = process.env.GMAIL_USER; // your-email@gmail.com
const GMAIL_PASS = process.env.GMAIL_PASS; // App Password (NOT your regular password)

// Create transporter
function createTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.error('❌ Error: GMAIL_USER and GMAIL_PASS environment variables required');
    console.log('\nSet them like this:');
    console.log('  export GMAIL_USER="your-email@gmail.com"');
    console.log('  export GMAIL_PASS="your-app-password"');
    console.log('\n📖 How to get App Password:');
    console.log('  1. Go to https://myaccount.google.com/security');
    console.log('  2. Enable 2-Factor Authentication');
    console.log('  3. Go to "App passwords"');
    console.log('  4. Select "Mail" and "Other (Custom name)"');
    console.log('  5. Name it "Nigents Mailer"');
    console.log('  6. Copy the 16-character password');
    process.exit(1);
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  });
}

// Load subscribers
function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading subscribers:', error);
  }
  return {};
}

// Send roadmap email
async function sendRoadmapEmail(transporter, subscriber) {
  const { email, name, roadmaps } = subscriber;
  
  const displayName = name || 'there';
  const roadmapList = roadmaps.map(r => `• ${r.charAt(0).toUpperCase() + r.slice(1)} Developer Roadmap`).join('\n');
  
  const mailOptions = {
    from: `"Nigents Learning" <${GMAIL_USER}>`,
    to: email,
    subject: 'Your Free Learning Roadmap is Here!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Hi ${displayName}!</h2>
        
        <p>Thank you for subscribing! Here are your requested roadmaps:</p>
        
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #065f46;">Your Roadmaps:</h3>
          <p style="white-space: pre-line;">${roadmapList}</p>
        </div>
        
        <p><strong>Download your PDFs here:</strong></p>
        <ul>
          ${roadmaps.map(r => `<li><a href="https://nigents.com/materials/${r}-roadmap.pdf" style="color: #3b82f6;">${r.charAt(0).toUpperCase() + r.slice(1)} Roadmap</a></li>`).join('')}
        </ul>
        
        <p>These 30-day roadmaps will guide you step-by-step to become a professional developer.</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px;">
          You're receiving this because you subscribed at <a href="https://nigents.com">nigents.com</a>.<br>
          To unsubscribe, reply with "UNSUBSCRIBE".
        </p>
      </div>
    `,
    text: `Hi ${displayName}!\n\nThank you for subscribing! Here are your requested roadmaps:\n\n${roadmapList}\n\nDownload your PDFs at: https://nigents.com/dashboard\n\nThese 30-day roadmaps will guide you step-by-step to become a professional developer.\n\n---\nYou're receiving this because you subscribed at nigents.com.\nTo unsubscribe, reply with "UNSUBSCRIBE".`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`❌ Failed to send to ${email}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Send welcome/update email to all subscribers
async function sendToAll(options = {}) {
  const { subject, message, testOnly = false } = options;
  
  if (!subject || !message) {
    console.error('❌ Error: subject and message required');
    console.log('Usage:');
    console.log('  node send-emails.js --to-all --subject "Update" --message "Hello!"');
    process.exit(1);
  }

  const transporter = createTransporter();
  const subscribers = loadSubscribers();
  const emails = Object.keys(subscribers);

  if (emails.length === 0) {
    console.log('No subscribers found.');
    return;
  }

  console.log(`\n📧 Sending to ${emails.length} subscribers...\n`);

  if (testOnly) {
    console.log('🔍 TEST MODE - No emails actually sent');
    console.log('Would send to:', emails.join(', '));
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const email of emails) {
    const subscriber = subscribers[email];
    const displayName = subscriber.name || 'there';

    const mailOptions = {
      from: `"Nigents Learning" <${GMAIL_USER}>`,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Hi ${displayName}!</h2>
          <div>${message}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            You're receiving this because you subscribed at nigents.com.<br>
            To unsubscribe, reply with "UNSUBSCRIBE".
          </p>
        </div>
      `,
      text: `Hi ${displayName}!\n\n${message}\n\n---\nYou're receiving this because you subscribed at nigents.com.\nTo unsubscribe, reply with "UNSUBSCRIBE".`,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ ${email}`);
      successCount++;
    } catch (error) {
      console.error(`❌ ${email}: ${error.message}`);
      failCount++;
    }

    // Rate limit: 100 emails per second max (Gmail limit)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📊 Results: ${successCount} sent, ${failCount} failed`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Show help
  if (!command || command === '--help' || command === '-h') {
    console.log(`
📧 Nigents Email Sender

Usage:
  node send-emails.js [command] [options]

Commands:
  welcome-all          Send welcome email to all subscribers
  test                 Test email to yourself
  list                 List all subscribers
  send                 Send custom email to all

Options:
  --to=email          Send to specific email
  --subject="..."     Email subject
  --message="..."     Email body (HTML supported)
  --test              Test mode (don't actually send)

Examples:
  # Send welcome email to all subscribers
  node send-emails.js welcome-all

  # Test email to yourself
  export GMAIL_USER="you@gmail.com"
  export GMAIL_PASS="your-app-password"
  node send-emails.js test --to=you@gmail.com

  # List all subscribers
  node send-emails.js list

  # Send custom update to all
  node send-emails.js send --subject="New Roadmaps Available!" --message="<p>Check out our new AI Engineer roadmap!</p>"

Setup Gmail:
  1. Enable 2-Factor Auth: https://myaccount.google.com/security
  2. Create App Password: https://myaccount.google.com/apppasswords
  3. Set environment variables:
     export GMAIL_USER="your-email@gmail.com"
     export GMAIL_PASS="xxxx xxxx xxxx xxxx"
`);
    process.exit(0);
  }

  // List subscribers
  if (command === 'list') {
    const subscribers = loadSubscribers();
    const emails = Object.keys(subscribers);
    
    console.log(`\n📋 Total Subscribers: ${emails.length}\n`);
    
    emails.forEach((email, i) => {
      const s = subscribers[email];
      console.log(`${i + 1}. ${email}`);
      console.log(`   Name: ${s.name || 'N/A'}`);
      console.log(`   Roadmaps: ${s.roadmaps.join(', ')}`);
      console.log(`   Subscribed: ${new Date(s.subscribedAt).toLocaleDateString()}`);
      console.log('');
    });
    return;
  }

  // Test email
  if (command === 'test') {
    const testEmail = args.find(a => a.startsWith('--to='))?.split('=')[1];
    
    if (!testEmail) {
      console.error('❌ Error: --to=email required for test');
      console.log('Example: node send-emails.js test --to=youremail@gmail.com');
      process.exit(1);
    }

    const transporter = createTransporter();
    
    console.log(`\n📧 Sending test email to ${testEmail}...\n`);

    try {
      const result = await transporter.sendMail({
        from: `"Nigents Learning" <${GMAIL_USER}>`,
        to: testEmail,
        subject: 'Test Email from Nigents',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Test Email</h2>
            <p>This is a test email from your Nigents email sender.</p>
            <p>If you're seeing this, your Gmail configuration is working!</p>
            <hr style="margin: 30px 0;">
            <p style="color: #6b7280; font-size: 12px;">Sent from Nigents Dashboard</p>
          </div>
        `,
        text: 'Test Email\n\nThis is a test email from your Nigents email sender.\nIf you\'re seeing this, your Gmail configuration is working!',
      });

      console.log('✅ Test email sent successfully!');
      console.log('Message ID:', result.messageId);
    } catch (error) {
      console.error('❌ Failed to send test email:', error.message);
    }
    return;
  }

  // Welcome all subscribers
  if (command === 'welcome-all') {
    const transporter = createTransporter();
    const subscribers = loadSubscribers();
    const emails = Object.keys(subscribers);

    if (emails.length === 0) {
      console.log('No subscribers found.');
      return;
    }

    const testOnly = args.includes('--test');
    
    console.log(`\n📧 Sending welcome emails to ${emails.length} subscribers...\n`);
    
    if (testOnly) {
      console.log('🔍 TEST MODE - No emails actually sent');
      console.log('Subscribers:', emails.join(', '));
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const email of emails) {
      const result = await sendRoadmapEmail(transporter, subscribers[email]);
      if (result.success) successCount++;
      else failCount++;
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n📊 Results: ${successCount} sent, ${failCount} failed`);
    return;
  }

  // Send custom email
  if (command === 'send') {
    const subject = args.find(a => a.startsWith('--subject='))?.split('=')[1]?.replace(/^["']|["']$/g, '');
    const message = args.find(a => a.startsWith('--message='))?.split('=')[1]?.replace(/^["']|["']$/g, '');
    const testOnly = args.includes('--test');

    await sendToAll({ subject, message, testOnly });
    return;
  }

  console.error(`❌ Unknown command: ${command}`);
  console.log('Run `node send-emails.js --help` for usage');
}

main().catch(console.error);
