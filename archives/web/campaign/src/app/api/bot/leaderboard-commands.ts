import { Context } from 'telegraf';
import { getLeaderboardData } from '../../services/supabaseService';

/**
 * 处理 /leaderboard 命令
 * 显示用户排行榜
 */
export async function handleLeaderboardCommand(ctx: Context) {
    try {
        // 获取排行榜数据
        const leaderboardData = await getLeaderboardData();

        if (leaderboardData.length === 0) {
            await ctx.reply('No leaderboard data available.');
            return;
        }

        // 构建排行榜消息
        let message = '🏆 <b>Leaderboard</b> 🏆\n\n';

        // 只显示前10名
        const topUsers = leaderboardData.slice(0, 10);

        for (let i = 0; i < topUsers.length; i++) {
            const user = topUsers[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            message += `${medal} @${user.handle}: ${user.points} points\n`;
        }

        await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error in leaderboard command:', error);
        await ctx.reply('Sorry, an error occurred while fetching the leaderboard. Please try again later.');
    }
} 