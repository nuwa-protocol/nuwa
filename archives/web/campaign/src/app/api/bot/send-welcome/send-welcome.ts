import { Context } from 'telegraf';
import { Telegraf } from 'telegraf';
import { handleMyPointsCommand } from '../points-commands';
import { handleLeaderboardCommand } from '../leaderboard-commands';
import { handleMissionsCommand } from '../mission-commands';

// 初始化 Telegraf 机器人
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

/**
 * 发送欢迎消息给 Telegram 用户
 * @param ctxOrId - Telegraf Context 对象或 Telegram 用户 ID
 * @param twitterHandle - 用户的 Twitter 用户名
 */
export async function sendWelcomeMessage(ctxOrId: Context | string | number, twitterHandle: string) {
    try {
        const welcomeMessage = `
👋 Welcome to Nuwa!

Your Twitter handle: @${twitterHandle}

Here are the available commands:
• /my_points - View your points
• /leaderboard - View the leaderboard
• /missions - View available missions

You can also click the buttons below to quickly access these features:
`;

        // 创建内联键盘按钮
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎯 My Points', callback_data: 'show_points' },
                    { text: '🏆 Leaderboard', callback_data: 'show_leaderboard' }
                ],
                [
                    { text: '📋 Missions List', callback_data: 'show_missions' }
                ]
            ]
        };

        // 根据参数类型选择发送方式
        if (ctxOrId instanceof Context) {
            // 如果是 Context 对象，使用 ctx.reply
            await ctxOrId.reply(welcomeMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } else {
            // 如果是 telegramId，使用 bot.telegram.sendMessage
            await bot.telegram.sendMessage(ctxOrId, welcomeMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
        throw error; // 向上传递错误，让调用者处理
    }
}

// 处理按钮回调
export async function handleWelcomeButtons(ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    const action = callbackQuery.data;

    switch (action) {
        case 'show_points':
            await handleMyPointsCommand(ctx);
            break;
        case 'show_leaderboard':
            await handleLeaderboardCommand(ctx);
            break;
        case 'show_missions':
            await handleMissionsCommand(ctx);
            break;
    }

    // 回答回调查询，移除加载状态
    await ctx.answerCbQuery();
} 