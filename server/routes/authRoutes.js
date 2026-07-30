const express = require('express');
const router = express.Router();
const { registerUser, verifyOTP, resendOTP, loginUser } = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', loginUser);

module.exports = router;
