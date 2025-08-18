import { Context } from 'telegraf';
import { checkTwitterBinding } from './twitter-binding';
import { getUserPointsByHandle } from '../../services/supabaseService';

/**
 * 处理 /my_points 命令
 * 显示用户的积分
 */
export async function handleMyPointsCommand(ctx: Context) {
    try {
        if (!ctx.from) {
            await ctx.reply('Unable to identify your account. Please try again later.');
            return;
        }

        const telegramId = ctx.from.id.toString();

        // 检查 Twitter 绑定状态
        const twitterHandle = await checkTwitterBinding(telegramId);

        if (!twitterHandle) {
            await ctx.reply('You need to bind your Twitter account first. Use /bind_twitter command.');
            return;
        }

        // 获取用户积分
        const points = await getUserPointsByHandle(twitterHandle);
        await ctx.reply(`Your current points: ${points}`);
    } catch (error) {
        console.error('Error in my_points command:', error);
        await ctx.reply('Sorry, an error occurred while fetching your points. Please try again later.');
    }
} 