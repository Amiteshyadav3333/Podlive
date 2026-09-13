const test = require('node:test');
const assert = require('assert');
const storageService = require('../src/services/storage.service');
const telegramService = require('../src/services/telegram.service');

test('storageService detects configured provider based on env', () => {
    const originalProvider = process.env.STORAGE_PROVIDER;
    const originalTgToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalTgChat = process.env.TELEGRAM_STORAGE_CHAT_ID;

    try {
        process.env.STORAGE_PROVIDER = 'telegram';
        assert.strictEqual(storageService.getProvider(), 'telegram');

        process.env.STORAGE_PROVIDER = 'bunny';
        assert.strictEqual(storageService.getProvider(), 'bunny');
    } finally {
        process.env.STORAGE_PROVIDER = originalProvider;
        process.env.TELEGRAM_BOT_TOKEN = originalTgToken;
        process.env.TELEGRAM_STORAGE_CHAT_ID = originalTgChat;
    }
});

test('telegramService requires bot token and chat ID', () => {
    const originalTgToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalTgChat = process.env.TELEGRAM_STORAGE_CHAT_ID;

    try {
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_STORAGE_CHAT_ID;

        assert.throws(() => {
            telegramService.assertTelegramConfigured();
        }, /Telegram storage is not configured/);

        process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
        process.env.TELEGRAM_STORAGE_CHAT_ID = '-100123456789';

        const config = telegramService.assertTelegramConfigured();
        assert.strictEqual(config.token, 'mock-bot-token');
        assert.strictEqual(config.chatId, '-100123456789');
    } finally {
        process.env.TELEGRAM_BOT_TOKEN = originalTgToken;
        process.env.TELEGRAM_STORAGE_CHAT_ID = originalTgChat;
    }
});
