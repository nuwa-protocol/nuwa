import { Context } from 'telegraf';
import { getMissions } from '../airtable/airtable';
import { checkTwitterBinding, sendTwitterBindingMessage } from './twitter-binding';
import { UserInfo } from '../chat/mission-router';
import { conversationHistory, activeMissions } from '../bot/route';
import { generateAndSendAIResponse } from './ai-utils';

/**
 * 处理 /missions 命令，向用户发送任务列表按钮
 * @param ctx Telegram 上下文
 */
export async function handleMissionsCommand(ctx: Context): Promise<void> {
    try {

        console.log('handleMissionsCommand');
        // 获取所有任务
        const missions = await getMissions();

        if (missions.length === 0) {
            await ctx.reply('No available missions. Please try again later.');
            return;
        }

        // 构建任务列表消息
        const message = '📋 <b>Available Missions</b>\n\n';

        // 构建任务按钮
        const buttons = missions.map(mission => [{
            text: mission.title,
            callback_data: `mission_${mission.id}`
        }]);

        // 发送消息和按钮
        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    } catch (error) {
        console.error('Error handling missions command:', error);
        await ctx.reply('Error getting missions. Please try again later.');
    }
}

/**
 * 处理任务按钮点击事件
 * @param ctx Telegram 上下文
 * @param missionId 任务ID
 */
export async function handleMissionButton(ctx: Context, missionId: string): Promise<void> {
    try {
        // 获取用户的telegramId
        const telegramId = ctx.from?.id.toString();
        if (!telegramId) {
            await ctx.answerCbQuery('User information cannot be recognized, please try again');
            return;
        }

        // 检查Twitter绑定状态
        const twitterHandle = await checkTwitterBinding(telegramId);
        if (!twitterHandle) {
            await ctx.answerCbQuery('Please bind your Twitter account first');
            await sendTwitterBindingMessage(ctx, telegramId);
            return;
        }

        // 获取所有任务
        const missions = await getMissions();

        // 查找指定ID的任务
        const mission = missions.find(m => m.id === missionId);

        if (!mission) {
            await ctx.answerCbQuery('Mission not found or has been removed');
            return;
        }

        // Set the mission as active for this user
        activeMissions.set(telegramId, missionId);

        // 准备用户信息
        const userInfo: UserInfo = {
            name: ctx.from?.first_name || 'User',
            twitterHandle
        };

        // 清除之前的对话历史，开始新的任务对话
        // 获取或初始化会话历史记录
        if (!conversationHistory.has(telegramId)) {
            conversationHistory.set(telegramId, []);
        }
        const history = conversationHistory.get(telegramId)!;

        // 清空之前的对话历史，开始新的任务对话
        history.length = 0;

        // 添加系统初始消息到历史记录
        history.push({
            role: 'assistant',
            content: `I'll help you complete the "${mission.title}" mission. Let's get started!`
        });

        // 构建任务详情消息
        let message = `📌 <b>${mission.title}</b>\n\n`;
        message += `${mission.description}\n\n`;

        // 发送任务详情
        await ctx.answerCbQuery('Loading mission...');
        await ctx.reply(message, {
            parse_mode: 'HTML'
        });

        // 使用工具函数生成并发送AI响应
        await generateAndSendAIResponse(ctx, history, userInfo, missionId);

        // 添加提示信息
        await ctx.reply(`You can use /end_mission command to end this mission when you're done.`);

    } catch (error) {
        console.error('Error handling mission button:', error);
        await ctx.answerCbQuery('Error retrieving mission details, please try again later');
    }
} 