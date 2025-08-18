import { type CoreMessage } from 'ai';
import { NextResponse } from 'next/server';
import { classifyMessage, generateAIResponseStream } from '../agent';
import { auth } from '@/auth';

interface UserInfo {
    name: string;
    twitterHandle: string;
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Add a new interface for message classification
export async function GET(req: Request) {
    const session = await auth();
    
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get message content from request URL
    const url = new URL(req.url);
    const message = url.searchParams.get('message');
    
    if (!session.user.name || !session.user.twitterHandle) {
        return NextResponse.json({ error: 'User information incomplete' }, { status: 400 });
    }
    
    const userInfo: UserInfo = {
        name: session.user.name,
        twitterHandle: session.user.twitterHandle
    };

    if (!message) {
        return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const classification = await classifyMessage(message, userInfo);
    console.log('classification:', JSON.stringify(classification, null, 2));

    // Return classification result
    return NextResponse.json({
        missionId: classification.missionId,
        confidence: classification.confidence,
        reasoning: classification.reasoning
    });
}

export async function POST(req: Request) {
    const session = await auth();
    
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Explicitly type the destructured request body
    const { messages, classifiedMissionId }: {
        messages: CoreMessage[];
        classifiedMissionId: string | null;
    } = await req.json();

    if (!session.user.name || !session.user.twitterHandle) {
        return NextResponse.json({ error: 'User information incomplete' }, { status: 400 });
    }

    const userInfo: UserInfo = {
        name: session.user.name,
        twitterHandle: session.user.twitterHandle
    };

    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
    }

    const result = await generateAIResponseStream(messages, userInfo, classifiedMissionId);

    return result.toDataStreamResponse();
}