const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'GROQ_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

if (!process.env.RESEND_API_KEY && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
    console.warn('⚠️ Warning: Neither RESEND_API_KEY nor EMAIL_USER/EMAIL_PASS configured. Email sending may fail.');
}

// Connect to MongoDB
connectDB();

const app = express();

// Dynamic & resilient CORS configuration
app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests (Postman, curl, server-to-server)
        if (!origin) return callback(null, true);

        const cleanOrigin = origin.replace(/\/$/, '');
        const configuredFrontend = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : null;

        if (
            cleanOrigin.endsWith('.vercel.app') ||
            cleanOrigin.includes('localhost') ||
            (configuredFrontend && cleanOrigin === configuredFrontend)
        ) {
            return callback(null, origin);
        }

        return callback(null, origin);
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);

// Root route health check
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'AI Cold Email Generator API is running' });
});

// Absolute path to client build folder
const fs = require('fs');
const __dirnamePath = path.resolve();
const clientBuildPath = path.join(__dirnamePath, '..', 'client', 'dist');

// Serve static files if frontend build directory exists
if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));

    // For any route not starting with /api, send index.html
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(clientBuildPath, 'index.html'));
        }
    });
}


app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Server Error', error: err.message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});