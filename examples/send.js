'use strict';

// Minimal local example. Configure EMAILTHECODE_SMTP_HOST or a local sendmail.
const { EmailTheCode } = require('..');

(async () => {
  const mail = new EmailTheCode();
  const result = await mail.emails.send({
    from: 'Example App <noreply@example.com>',
    to: 'user@example.net',
    subject: 'Hello from EmailTheCode',
    text: 'This is a test message. Replace the addresses before sending.',
  });
  console.log(result);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
