import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeMessage } from './send-welcome';

/**
 * Sends a welcome message to a Telegram user after successful Twitter binding
 * @param telegramId - The Telegram user ID
 * @param twitterHandle - The Twitter handle of the user
 * @returns Promise that resolves when the message is sent
 */
export async function POST(request: NextRequest) {
    try {
        const { telegramId, twitterHandle } = await request.json();

        if (!telegramId || !twitterHandle) {
            return NextResponse.json(
                { success: false, error: 'Missing required parameters: telegramId and twitterHandle' },
                { status: 400 }
            );
        }

        await sendWelcomeMessage(telegramId, twitterHandle);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in send-welcome API route:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to send welcome message' },
            { status: 500 }
        );
    }
} 