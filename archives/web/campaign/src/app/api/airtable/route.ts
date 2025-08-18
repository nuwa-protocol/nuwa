import { NextRequest, NextResponse } from 'next/server';
import {
    getMissions
} from '@/app/api/airtable/airtable';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    try {
        // 只处理 missions 相关的请求
        if (action === 'getMissions') {
            const data = await getMissions();
            return NextResponse.json({ success: true, data });
        }
        else {
            return NextResponse.json({ success: false, error: 'Invalid action or action not supported by Airtable API' }, { status: 400 });
        }
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}