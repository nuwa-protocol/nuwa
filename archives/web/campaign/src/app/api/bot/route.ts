import { NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import * as filters from 'telegraf/filters';
import { getDefaultSystemPrompt, getMissionSystemPrompt, UserInfo } from '../chat/mission-router';
import { checkTwitterBinding, sendTwitterBindingMessage, sendTwitterBindingError } from './twitter-binding';
import { handleMissionsCommand, handleMissionButton } from './mission-commands';
import { handleMyPointsCommand } from './points-commands';
import { handleLeaderboardCommand } from './leaderboard-commands';
import { sendWelcomeMessage, handleWelcomeButtons } from './send-welcome/send-welcome';
import { generateAndSendAIResponse } from './ai-utils';
import { classifyMessage } from '../agent';

// Initialize Telegraf bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Store conversation history in memory
export const conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant', content: string }>>();

// Store current active mission for each user
export const activeMissions = new Map<string, string>();

// Maximum history length limit
const MAX_HISTORY_LENGTH = 10;

// Handle /start command
bot.command('start', async (ctx) => {
    try {
        const telegramId = ctx.from.id.toString();

        // Check Twitter binding status
        const twitterHandle = await checkTwitterBinding(telegramId);

        if (twitterHandle) {
            // Send welcome message
            await sendWelcomeMessage(ctx, twitterHandle);
        } else {
            // If not bound, display welcome message and binding button
            await sendTwitterBindingMessage(ctx, telegramId);
        }
    } catch (error) {
        await sendTwitterBindingError(ctx, error);
    }
});

// Handle /help command
bot.command('help', async (ctx) => {
    try {
        const telegramId = ctx.from.id.toString();

        // Check Twitter binding status
        const twitterHandle = await checkTwitterBinding(telegramId);

        if (twitterHandle) {
            // Send welcome message
            await sendWelcomeMessage(ctx, twitterHandle);
        } else {
            // If not bound, display welcome message and binding button
            await sendTwitterBindingMessage(ctx, telegramId);
        }
    } catch (error) {
        await sendTwitterBindingError(ctx, error);
    }
});

// Handle /bind_twitter command
bot.command('bind_twitter', async (ctx) => {
    try {
        const telegramId = ctx.from.id.toString();

        // Check if already bound
        const twitterHandle = await checkTwitterBinding(telegramId);
        if (twitterHandle) {
            await ctx.reply(`You have already bound your Twitter account @${twitterHandle}.`);
            return;
        }
    } catch (error) {
        await sendTwitterBindingError(ctx, error);
    }
});

// Handle /end_mission command
bot.command('end_mission', async (ctx) => {
    try {
        const telegramId = ctx.from.id.toString();

        // Check Twitter binding status
        const twitterHandle = await checkTwitterBinding(telegramId);
        if (!twitterHandle) {
            await sendTwitterBindingMessage(ctx, telegramId);
            return;
        }

        // Clear conversation history
        if (conversationHistory.has(telegramId)) {
            conversationHistory.delete(telegramId);
        }

        // Clear active mission
        if (activeMissions.has(telegramId)) {
            activeMissions.delete(telegramId);
        }

        // Send confirmation message
        await ctx.reply('Mission ended. You can start a new mission with /missions command or chat with me to identify a new mission.');
    } catch (error) {
        console.error('Error handling end mission command:', error);
        await ctx.reply('Error ending mission. Please try again later.');
    }
});

// Handle /missions command
bot.command('missions', handleMissionsCommand);

// Handle /my_points command
bot.command('my_points', handleMyPointsCommand);

// Handle /leaderboard command
bot.command('leaderboard', handleLeaderboardCommand);

// Handle mission button clicks
bot.action(/^mission_(.+)$/, async (ctx) => {
    // Extract mission ID from callback data
    const callbackQuery = ctx.callbackQuery;
    if (callbackQuery && 'data' in callbackQuery) {
        const missionId = callbackQuery.data.replace('mission_', '');
        await handleMissionButton(ctx, missionId);
    }
});

// Handle welcome message buttons
bot.action(/^show_(points|leaderboard|missions)$/, handleWelcomeButtons);

// Handle text messages
bot.on(filters.message('text'), async (ctx) => {
    try {
        const userMessage = ctx.message.text;
        const telegramId = ctx.from.id.toString(); // Extract telegramId as a separate variable

        // Check Twitter binding status
        const twitterHandle = await checkTwitterBinding(telegramId);

        // If user has not bound Twitter account, prompt binding and return
        if (!twitterHandle) {
            await sendTwitterBindingMessage(ctx, telegramId);
            return;
        }

        // Use UserInfo interface
        const userInfo: UserInfo = {
            name: ctx.from.first_name,
            twitterHandle: twitterHandle // Confirmed bound
        };

        // Get or initialize conversation history
        if (!conversationHistory.has(telegramId)) {
            conversationHistory.set(telegramId, []);
        }
        const history = conversationHistory.get(telegramId)!;

        // Add user message to history
        history.push({ role: 'user', content: userMessage });

        // If history is too long, delete the oldest messages
        if (history.length > MAX_HISTORY_LENGTH) {
            history.splice(0, 2); // Delete one conversation pair (user+assistant) at a time
        }

        // Check if user has an active mission
        let missionId = activeMissions.get(telegramId) || null;
        let confidence = 1.0; // If we have an active mission, use it with full confidence

        // If no active mission, classify the message
        if (!missionId) {
            try {
                // Use agent module to classify the message
                const classification = await classifyMessage(userMessage, userInfo);
                
                missionId = classification.missionId;
                confidence = classification.confidence;

                // If confidence is high, set as active mission
                if (confidence > 0.7 && missionId) {
                    activeMissions.set(telegramId, missionId);
                }
            } catch (error) {
                console.error('Error classifying message:', error);
            }
        }

        await ctx.reply(`Well noted, just a moment...`);


        // Use AI helper tool to generate and send response, passing user info and mission ID
        await generateAndSendAIResponse(ctx, history, userInfo, missionId);

        await ctx.reply(`You can use /end_mission command to end this mission when you're done.`);

    } catch (error) {
        console.error('Error processing message:', error);
        await ctx.reply('Sorry, an error occurred while processing the message. Please try again later.');
    }
});

// Webhook handler
export async function POST(req: Request) {
    try {
        const update = await req.json();
        await bot.handleUpdate(update);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error in webhook handler:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}