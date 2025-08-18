import { createServiceClient } from '@/app/services/supabase';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { Context } from 'telegraf';

// 生成 PKCE 挑战
export function generatePKCEChallenge() {
    // 生成验证码
    const verifier = crypto.randomBytes(32).toString('base64url');

    // 生成挑战码
    const challenge = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');

    return { verifier, challenge };
}

// 检查 Twitter 绑定状态
export async function checkTwitterBinding(telegramId: string) {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from('telegram_twitter_bindings')
        .select('twitter_handle')
        .eq('telegram_id', telegramId)
        .single();

    if (error) {
        console.error('Error checking Twitter binding:', error);
        return null;
    }

    return data?.twitter_handle;
}

// 生成 Twitter 授权 URL
export function generateTwitterAuthUrl(telegramId: string) {
    const { verifier, challenge } = generatePKCEChallenge();
    const state = crypto.randomBytes(32).toString('base64url');
    const encodedState = `${telegramId}.${verifier}.${uuidv4()}`;

    const twitterAuthUrl = new URL('https://twitter.com/i/oauth2/authorize');
    const redirectUri = `https://${process.env.NEXTAUTH_URL}/api/auth/tg-x-binding-callback`;

    twitterAuthUrl.searchParams.append('client_id', process.env.TWITTER_CLIENT_ID || '');
    twitterAuthUrl.searchParams.append('scope', 'users.read tweet.read offline.access');
    twitterAuthUrl.searchParams.append('response_type', 'code');
    twitterAuthUrl.searchParams.append('redirect_uri', redirectUri);
    twitterAuthUrl.searchParams.append('state', encodedState);
    twitterAuthUrl.searchParams.append('code_challenge', challenge);
    twitterAuthUrl.searchParams.append('code_challenge_method', 'S256');

    return twitterAuthUrl.toString();
}

// 处理未绑定 Twitter 的情况
export async function sendTwitterBindingMessage(ctx: Context, telegramId: string) {
    const twitterAuthUrl = generateTwitterAuthUrl(telegramId);

    await ctx.reply(
        'Welcome to Nuwa!\n\nPlease bind your Twitter account to continue using:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Login with Twitter', url: twitterAuthUrl }]
                ]
            }
        }
    );
}

// 处理 Twitter 绑定错误
export async function sendTwitterBindingError(ctx: Context, error: any) {
    console.error('Error in Twitter binding:', error);
    await ctx.reply('Sorry, an error occurred while processing the request. Please try again later.');
} 