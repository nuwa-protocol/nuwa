import { NextResponse } from 'next/server';
import { getLeaderboardData } from '@/app/services/supabaseService';

export async function GET() {
  try {
    const data = await getLeaderboardData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching leaderboard data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data' }, 
      { status: 500 }
    );
  }
}
