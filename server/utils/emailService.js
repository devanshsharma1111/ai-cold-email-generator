const nodemailer = require('nodemailer');

const createTransporter = (config) => {
    return nodemailer.createTransport({
        ...config,
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 8000
    });
};

const sendEmail = async (options) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error('Email credentials (EMAIL_USER / EMAIL_PASS) not configured in server environment');
        }

        const user = process.env.EMAIL_USER;
        const pass = process.env.EMAIL_PASS;

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

        const mailOptions = {
            from: `"AI Cold Email Generator" <${user}>`,
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: formattedHtml
        };

        // Try Port 587 (STARTTLS) first, then Port 465 (SSL), then service 'gmail'
        const transportConfigs = [
            {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                requireTLS: true,
                auth: { user, pass },
                tls: { rejectUnauthorized: false }
            },
            {
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: { user, pass }
            },
            {
                service: 'gmail',
                auth: { user, pass }
            }
        ];

        let lastError = null;

        for (let i = 0; i < transportConfigs.length; i++) {
            try {
                const transporter = createTransporter(transportConfigs[i]);
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Email sent successfully using config #${i + 1}:`, info.response);
                return { success: true, message: 'Email sent successfully', messageId: info.messageId };
            } catch (err) {
                console.warn(`⚠️ SMTP transport config #${i + 1} failed: ${err.message}`);
                lastError = err;
            }
        }

        throw lastError || new Error('All SMTP transport connection attempts failed');

    } catch (error) {
        console.error('❌ Email sending error:', error.message);
        throw new Error(`Failed to send email: ${error.message}`);
    }
};

module.exports = sendEmail;
