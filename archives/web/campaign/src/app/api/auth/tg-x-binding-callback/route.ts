import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/services/supabase';

export async function GET(req: NextRequest) {
    try {
        // 检查环境变量
        if (!process.env.TWITTER_CLIENT_ID || !process.env.TWITTER_CLIENT_SECRET || !process.env.NEXTAUTH_URL) {
            console.error('Missing required environment variables:', {
                TWITTER_CLIENT_ID: !!process.env.TWITTER_CLIENT_ID,
                TWITTER_CLIENT_SECRET: !!process.env.TWITTER_CLIENT_SECRET,
                NEXTAUTH_URL: !!process.env.NEXTAUTH_URL
            });
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=config_error', req.url));
        }

        // 获取查询参数
        const searchParams = req.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');

        console.log('TG-X Binding Callback received with params:', {
            code: code ? 'present' : 'missing',
            state: state || 'missing',
            url: req.url
        });

        if (!code || !state) {
            console.error('Missing required parameters:', { code, state });
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=missing_params', req.url));
        }

        // 解析 state 参数，获取 telegram_id 和 verifier
        const parts = state.split('.');
        if (parts.length < 2) {
            console.error('Invalid state parameter:', { state });
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=invalid_state', req.url));
        }

        const telegramId = parts[0];
        const verifier = parts[1];

        if (!telegramId || !verifier) {
            console.error('Invalid state parameter parts:', { telegramId, verifier });
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=invalid_state', req.url));
        }

        // 获取 Twitter 访问令牌
        const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
        const requestProtocol = req.url.startsWith('https') ? 'https' : 'http';
        const baseUrl = process.env.NEXTAUTH_URL?.startsWith('http')
            ? process.env.NEXTAUTH_URL
            : `${requestProtocol}://${process.env.NEXTAUTH_URL}`;
        const redirectUri = `${baseUrl}/api/auth/tg-x-binding-callback`;

        console.log('Requesting Twitter token with:', {
            tokenUrl,
            redirectUri,
            clientId: process.env.TWITTER_CLIENT_ID,
            verifier: verifier.substring(0, 5) + '...',
            nextAuthUrl: process.env.NEXTAUTH_URL,
            baseUrl,
            requestProtocol,
            originalUrl: req.url
        });

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: verifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Failed to get Twitter token:', {
                status: tokenResponse.status,
                statusText: tokenResponse.statusText,
                error: errorText
            });
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=token_error', req.url));
        }

        const tokenData = await tokenResponse.json();
        console.log('Successfully obtained Twitter token');

        // 获取用户信息
        const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=name,profile_image_url', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
            },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('Failed to get user info:', {
                status: userResponse.status,
                statusText: userResponse.statusText,
                error: errorText
            });
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=user_info_error', req.url));
        }

        const userData = await userResponse.json();
        const twitterHandle = userData.data.username;
        const twitterName = userData.data.name;
        const twitterAvatarUrl = userData.data.profile_image_url?.replace('_normal', '_400x400') || userData.data.profile_image_url;
        console.log('Successfully obtained user info:', { twitterHandle, twitterName, twitterAvatarUrl });

        // 存储绑定关系
        const supabase = await createServiceClient();
        const { error } = await supabase
            .from('telegram_twitter_bindings')
            .upsert({
                telegram_id: telegramId,
                twitter_handle: twitterHandle,
            }, {
                onConflict: 'telegram_id',
            });

        if (error) {
            console.error('Failed to store binding:', error);
            return NextResponse.redirect(new URL('/tg-x-binding/error?error=db_error', req.url));
        }

        console.log('Successfully stored binding:', { telegramId, twitterHandle, twitterName, twitterAvatarUrl });

        // 重定向到成功页面
        return NextResponse.redirect(new URL(`/tg-x-binding/success?telegram_id=${telegramId}&twitter_handle=${twitterHandle}&twitter_name=${encodeURIComponent(twitterName)}&twitter_avatar_url=${encodeURIComponent(twitterAvatarUrl)}`, req.url));
    } catch (error) {
        console.error('Error in TG-X Binding callback:', error);
        return NextResponse.redirect(new URL('/tg-x-binding/error?error=server_error', req.url));
    }
} 