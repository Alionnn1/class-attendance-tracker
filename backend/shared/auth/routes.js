const express = require('express');

const authController = require('./controller');
const { requireAuth } = require('./middleware');
const { requireJson } = require('../http');

const router = express.Router();

router.post('/login', requireJson, authController.login);
router.post('/logout', requireAuth(), authController.logout);

module.exports = router;
