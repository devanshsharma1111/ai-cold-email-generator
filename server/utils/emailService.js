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
        const resendKey = process.env.RESEND_API_KEY;
        const brevoKey = process.env.BREVO_API_KEY;
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

        // 1. Resend HTTP API (Best for Vercel - uses HTTPS Port 443, never times out)
        if (resendKey) {
            try {
                const res = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resendKey}`
                    },
                    body: JSON.stringify({
                        from: 'AI Cold Email Generator <onboarding@resend.dev>',
                        to: [options.email],
                        subject: options.subject,
                        html: formattedHtml,
                        text: options.message
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    console.log('✅ Email sent via Resend HTTP API:', data.id);
                    return { success: true, message: 'Email sent successfully via Resend API', messageId: data.id };
                } else {
                    console.warn('⚠️ Resend HTTP API error:', data);
                }
            } catch (err) {
                console.warn('⚠️ Resend fetch failed:', err.message);
            }
        }

        // 2. Brevo HTTP API
        if (brevoKey) {
            try {
                const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': brevoKey
                    },
                    body: JSON.stringify({
                        sender: { name: 'AI Cold Email Generator', email: user || 'no-reply@aicoldemail.com' },
                        to: [{ email: options.email }],
                        subject: options.subject,
                        htmlContent: formattedHtml,
                        textContent: options.message
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    console.log('✅ Email sent via Brevo HTTP API:', data.messageId);
                    return { success: true, message: 'Email sent successfully via Brevo API', messageId: data.messageId };
                } else {
                    console.warn('⚠️ Brevo HTTP API error:', data);
                }
            } catch (err) {
                console.warn('⚠️ Brevo fetch failed:', err.message);
            }
        }

        // 3. SendGrid HTTP API
        if (sendgridKey) {
            try {
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
                    console.log('✅ Email sent via SendGrid HTTP API');
                    return { success: true, message: 'Email sent successfully via SendGrid API' };
                } else {
                    const data = await res.json();
                    console.warn('⚠️ SendGrid HTTP API error:', data);
                }
            } catch (err) {
                console.warn('⚠️ SendGrid fetch failed:', err.message);
            }
        }

        // 4. Nodemailer SMTP Fallback (Works on Localhost / VPS, times out on Vercel)
        if (!user || !pass) {
            throw new Error('No HTTP Email API key (RESEND_API_KEY) or SMTP credentials (EMAIL_USER/EMAIL_PASS) set in environment variables');
        }

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
                console.log(`✅ Email sent successfully using SMTP config #${i + 1}:`, info.response);
                return { success: true, message: 'Email sent successfully', messageId: info.messageId };
            } catch (err) {
                console.warn(`⚠️ SMTP transport config #${i + 1} failed: ${err.message}`);
                lastError = err;
            }
        }

        throw new Error(`Vercel Serverless blocks direct SMTP sockets (smtp.gmail.com). Please add RESEND_API_KEY in Vercel Environment Variables to send emails via HTTP API. Original error: ${lastError ? lastError.message : 'Timeout'}`);

    } catch (error) {
        console.error('❌ Email sending error:', error.message);
        throw error;
    }
};

module.exports = sendEmail;
