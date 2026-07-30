const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 lookup first to prevent Node 18+ IPv6 socket timeout on Vercel serverless
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

        // Option 1: HTTP API via Resend (instant 100ms delivery, no SMTP timeouts on Vercel)
        if (resendKey) {
            try {
                const resendResponse = await fetch('https://api.resend.com/emails', {
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

                const resendData = await resendResponse.json();

                if (resendResponse.ok) {
                    console.log('✅ Email sent via Resend API:', resendData.id);
                    return { success: true, message: 'Email sent successfully', messageId: resendData.id };
                } else {
                    console.warn('⚠️ Resend API error, falling back to SMTP:', resendData);
                }
            } catch (resendErr) {
                console.warn('⚠️ Resend fetch failed, falling back to SMTP:', resendErr.message);
            }
        }

        if (!user || !pass) {
            throw new Error('Email credentials (EMAIL_USER / EMAIL_PASS) not configured in server environment');
        }

        const mailOptions = {
            from: `"AI Cold Email Generator" <${user}>`,
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: formattedHtml
        };

        // Option 2: IPv4-forced SMTP transports
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
                    connectionTimeout: 5000,
                    greetingTimeout: 5000,
                    socketTimeout: 7000
                });
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Email sent successfully using IPv4 SMTP config #${i + 1}:`, info.response);
                return { success: true, message: 'Email sent successfully', messageId: info.messageId };
            } catch (err) {
                console.warn(`⚠️ SMTP transport config #${i + 1} failed: ${err.message}`);
                lastError = err;
            }
        }

        throw lastError || new Error('All SMTP connection attempts timed out');

    } catch (error) {
        console.error('❌ Email sending error:', error.message);
        throw new Error(`Failed to send email: ${error.message}`);
    }
};

module.exports = sendEmail;
