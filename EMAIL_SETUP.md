# 📧 Email Setup Guide - Sending to Subscribers

This guide shows you how to send emails to your Free Materials subscribers using Gmail.

## Quick Start

### 1. Get Gmail App Password

**Important:** You cannot use your regular Gmail password. You need an "App Password".

1. **Enable 2-Factor Authentication**
   - Go to https://myaccount.google.com/security
   - Click "2-Step Verification" and enable it
   - Follow the setup process

2. **Create App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Other (Custom name)"
   - Enter name: "Nigents Mailer"
   - Click "Generate"
   - **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)

### 2. Set Environment Variables

```bash
# In your terminal (or add to ~/.bashrc or ~/.zshrc)
export GMAIL_USER="your-email@gmail.com"
export GMAIL_PASS="abcd efgh ijkl mnop"  # Your App Password
```

### 3. Test Your Setup

```bash
cd /home/ubuntu/nigents
node scripts/send-emails.js test --to=your-email@gmail.com
```

You should receive a test email within seconds.

## Sending Emails

### Send Welcome Email to All Subscribers

```bash
node scripts/send-emails.js welcome-all
```

This sends the roadmap email to everyone in `data/subscribers.json`.

### List All Subscribers

```bash
node scripts/send-emails.js list
```

Shows all collected emails with their subscribed roadmaps.

### Send Custom Email to All

```bash
node scripts/send-emails.js send \
  --subject="New Roadmap Available! 🎉" \
  --message="<p>We've just added a new <strong>AI Engineer</strong> roadmap!</p><p><a href='https://nigents.com'>Check it out</a></p>"
```

### Test Mode (No emails sent)

Add `--test` to preview without sending:

```bash
node scripts/send-emails.js welcome-all --test
```

## Gmail Limits

- **Daily limit:** 500 emails per day (Gmail)
- **Rate limit:** ~100 emails per minute
- The script automatically adds delays between emails

## Troubleshooting

### "Invalid login credentials"
- Make sure you're using an **App Password**, not your regular password
- Verify 2-Factor Authentication is enabled

### "Application-specific password required"
- This confirms you need an App Password (not regular password)

### Emails going to spam
- Send from a professional email address
- Keep subject lines relevant
- Include unsubscribe option (already included)

### "Daily limit exceeded"
- Gmail allows 500 emails per day
- Wait 24 hours or upgrade to Google Workspace

## Viewing Subscribers

Subscribers are stored in:
```
data/subscribers.json
```

Example structure:
```json
{
  "user@example.com": {
    "email": "user@example.com",
    "name": "John Doe",
    "roadmaps": ["fullstack", "backend"],
    "subscribedAt": "2026-03-14T10:30:00.000Z"
  }
}
```

## Automate with Cron (Optional)

Send welcome emails automatically every hour:

```bash
# Edit crontab
crontab -e

# Add this line (runs every hour)
0 * * * * cd /home/ubuntu/nigents && node scripts/send-emails.js welcome-all >> /var/log/nigents-emails.log 2>&1
```

## Next Steps: Professional Email Service

For production use with higher volume, consider:

1. **SendGrid** (100 emails/day free)
2. **Mailgun** (5,000 emails/month free)
3. **AWS SES** (very cheap, 62,000 emails/month free from EC2)

These services provide better deliverability and analytics than Gmail.

## Need Help?

Run the help command:
```bash
node scripts/send-emails.js --help
```
