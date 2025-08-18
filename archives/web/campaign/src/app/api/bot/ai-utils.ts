import { Context } from 'telegraf';
import { generateAIResponse } from '../agent';
import { UserInfo } from '../chat/mission-router';

/**
 * Generate and send AI response
 * @param ctx Telegram context
 * @param history Conversation history
 * @param systemPrompt System prompt
 * @param userInfo User information
 * @param missionId Mission ID
 */
export async function generateAndSendAIResponse(
    ctx: Context,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userInfo: UserInfo,
    missionId?: string | null
) {
    try {
        // Show "typing..." indicator
        await ctx.sendChatAction('typing');

        // Build message array from history
        const messages = history.map(entry => ({
            role: entry.role,
            content: entry.content
        }));

        // Generate AI response using agent
        const aiResponseText = await generateAIResponse(messages, userInfo, missionId || null);

        // Add AI response to history
        history.push({ role: 'assistant', content: aiResponseText });

        // Send AI response
        await ctx.reply(aiResponseText, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error generating AI response:', error);
        await ctx.reply('Sorry, an error occurred while generating a response. Please try again later.');
    }
} 