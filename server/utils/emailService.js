const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 lookup first for local/VPS SMTP
if (dns.setDefaultResultOrder) {
    try {
        dns.setDefaultResultOrder('ipv4first');
    } catch (e) {
        // Ignore if already set
    }
}

const sendEmail = async (options) => {
    try {
        const user = process.env.EMAIL_USER;
        const pass = process.env.EMAIL_PASS;
        const brevoKey = process.env.BREVO_API_KEY;
        const resendKey = process.env.RESEND_API_KEY;
        const sendgridKey = process.env.SENDGRID_API_KEY;

        const otpMatch = options.message.match(/\d{6}/);
        const otpCode = otpMatch ? otpMatch[0] : '';

        const formattedHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #4f46e5; text-align: center; margin-top: 0;">AI Cold Email Generator</h2>
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="font-size: 15px; color: #374151;">Hello,</p>
                <p style="font-size: 15px; color: #374151; line-height: 1.5;">${options.message.replace(/\n/g, '<br>')}</p>
                ${otpCode ? `
                <div style="background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 8px; margin: 24px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1f2937; font-family: monospace;">${otpCode}</span>
                </div>
                ` : ''}
                <p style="font-size: 13px; color: #6b7280; text-align: center; margin-bottom: 0;">If you did not request this code, please ignore this email.</p>
            </div>
        `;

        // ─────────────────────────────────────────────────────────────────────
        // 1. BREVO — PRIMARY (recommended)
        //    ✅ Send FROM your Gmail address (verify it once at https://app.brevo.com/senders)
        //    ✅ Delivers to ANY recipient email — no domain ownership needed
        //    ✅ 300 emails/day free, works on Vercel (pure HTTPS, no SMTP sockets)
        //    ACTION NEEDED: Go to https://app.brevo.com/senders → Add dev.1092004@gmail.com → click the verify link sent to that Gmail
        // ─────────────────────────────────────────────────────────────────────
        if (brevoKey) {
            try {
                const senderEmail = user || 'no-reply@aicoldemail.com';
                console.log('📧 [Brevo] Sending. From:', senderEmail, '→ To:', options.email);

                const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': brevoKey
                    },
                    body: JSON.stringify({
                        sender: { name: 'AI Cold Email Generator', email: senderEmail },
                        to: [{ email: options.email }],
                        subject: options.subject,
                        htmlContent: formattedHtml,
                        textContent: options.message
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    console.log('✅ [Brevo] Email sent! messageId:', data.messageId);
                    return { success: true, message: 'Email sent successfully via Brevo', messageId: data.messageId };
                } else {
                    console.warn('⚠️ [Brevo] Error (status ' + res.status + '):', JSON.stringify(data, null, 2));
                    if (data.code === 'unauthorized') {
                        console.warn('   → Fix: Invalid API key. Check BREVO_API_KEY in .env and Vercel env vars.');
                    } else if (data.message && data.message.toLowerCase().includes('sender')) {
                        console.warn('   → Fix: Sender not verified. Go to https://app.brevo.com/senders and verify: ' + senderEmail);
                    }
                    // Fall through to next provider
                }
            } catch (err) {
                console.warn('⚠️ [Brevo] Fetch failed:', err.message);
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. RESEND — FALLBACK
        //    ⚠️  Cannot use @gmail.com as sender (Resend requires you to own the domain)
        //    ⚠️  Default test sender (onboarding@resend.dev) only delivers to your Resend account email
        //    ✅  Works on Vercel (pure HTTPS)
        //    For any-recipient production delivery: verify domain at https://resend.com/domains
        //    then set RESEND_FROM=no-reply@yourdomain.com in .env + Vercel env vars
        // ─────────────────────────────────────────────────────────────────────
        if (resendKey) {
            try {
                const resendFrom = process.env.RESEND_FROM;
                const fromEmail = resendFrom
                    ? `AI Cold Email Generator <${resendFrom}>`
                    : 'AI Cold Email Generator <onboarding@resend.dev>';

                console.log('📧 [Resend] Sending. From:', fromEmail, '→ To:', options.email);
                if (!resendFrom) {
                    console.log('   ℹ️  Using test sender — email only arrives if recipient = your Resend account email.');
                }

                const res = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resendKey}`
                    },
                    body: JSON.stringify({
                        from: fromEmail,
                        to: [options.email],
                        subject: options.subject,
                        html: formattedHtml,
                        text: options.message
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    console.log('✅ [Resend] Email sent! id:', data.id);
                    return { success: true, message: 'Email sent successfully via Resend', messageId: data.id };
                } else {
                    console.warn('⚠️ [Resend] Error (status ' + res.status + '):', JSON.stringify(data, null, 2));
                    if (data.message && data.message.includes('domain is not verified')) {
                        console.warn('   → Fix: Do NOT set RESEND_FROM to a @gmail.com address. Use a domain you own, verified at https://resend.com/domains');
                    }
                    // Fall through to next provider
                }
            } catch (err) {
                console.warn('⚠️ [Resend] Fetch failed:', err.message);
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. SENDGRID — FALLBACK
        // ─────────────────────────────────────────────────────────────────────
        if (sendgridKey) {
            try {
                console.log('📧 [SendGrid] Sending → To:', options.email);

                const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sendgridKey}`
                    },
                    body: JSON.stringify({
                        personalizations: [{ to: [{ email: options.email }] }],
                        from: { email: user || 'no-reply@aicoldemail.com', name: 'AI Cold Email Generator' },
                        subject: options.subject,
                        content: [
                            { type: 'text/plain', value: options.message },
                            { type: 'text/html', value: formattedHtml }
                        ]
                    })
                });

                if (res.ok) {
                    console.log('✅ [SendGrid] Email sent!');
                    return { success: true, message: 'Email sent successfully via SendGrid' };
                } else {
                    const data = await res.json();
                    console.warn('⚠️ [SendGrid] Error:', data);
                }
            } catch (err) {
                console.warn('⚠️ [SendGrid] Fetch failed:', err.message);
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. GMAIL SMTP — LOCAL ONLY (Vercel blocks outbound SMTP sockets)
        //    Works on your machine / VPS. Will timeout on Vercel serverless.
        // ─────────────────────────────────────────────────────────────────────
        if (!user || !pass) {
            throw new Error('No email provider configured. Set BREVO_API_KEY (recommended) or RESEND_API_KEY in your environment variables.');
        }

        console.log('📧 [SMTP] Trying Gmail SMTP (local only — will fail on Vercel)...');

        const mailOptions = {
            from: `"AI Cold Email Generator" <${user}>`,
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: formattedHtml
        };

        const transportConfigs = [
            {
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                family: 4,
                auth: { user, pass }
            },
            {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                requireTLS: true,
                family: 4,
                auth: { user, pass },
                tls: { rejectUnauthorized: false }
            },
            {
                service: 'gmail',
                family: 4,
                auth: { user, pass }
            }
        ];

        let lastError = null;
        for (let i = 0; i < transportConfigs.length; i++) {
            try {
                const transporter = nodemailer.createTransport({
                    ...transportConfigs[i],
                    connectionTimeout: 4000,
                    greetingTimeout: 4000,
                    socketTimeout: 5000
                });
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ [SMTP] Email sent via config #${i + 1}:`, info.response);
                return { success: true, message: 'Email sent successfully via SMTP', messageId: info.messageId };
            } catch (err) {
                console.warn(`⚠️ [SMTP] Config #${i + 1} failed: ${err.message}`);
                lastError = err;
            }
        }

        throw new Error(
            `All email providers failed. On Vercel: set BREVO_API_KEY (verify sender at https://app.brevo.com/senders). ` +
            `Last SMTP error: ${lastError ? lastError.message : 'Unknown'}`
        );

    } catch (error) {
        console.error('❌ Email sending error:', error.message);
        throw error;
    }
};

module.exports = sendEmail;
