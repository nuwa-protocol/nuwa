// 简单的测试API，用于验证API路由是否正常工作
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Auth test API is working' });
}

export async function POST() {
  return NextResponse.json({ status: 'ok', message: 'POST method is working' });
} 