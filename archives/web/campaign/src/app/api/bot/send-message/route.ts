import { NextRequest, NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';

// Initialize Telegraf bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

/**
 * API endpoint for sending messages to Telegram users
 * Used for tg-x-bind-auth callback to send messages
 */
export async function POST(req: NextRequest) {
    try {
        // Parse request body
        const body = await req.json();
        const { telegramId, message } = body;

        // Validate required parameters
        if (!telegramId || !message) {
            return NextResponse.json(
                { error: 'Missing required parameters: telegramId and message' },
                { status: 400 }
            );
        }

        // Send message to Telegram user
        await bot.telegram.sendMessage(telegramId, message);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error sending message to Telegram:', error);
        return NextResponse.json(
            { error: 'Failed to send message to Telegram' },
            { status: 500 }
        );
    }
} 