import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { query, isConfigured } from '@/lib/snowflake';

export const maxDuration = 60;

// Normalize Snowflake uppercase keys to lowercase
function normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key in obj) {
    normalized[key.toLowerCase()] = obj[key];
  }
  return normalized;
}

const SYSTEM_PROMPT = `You are an expert robotics competition analyst. Your job is to analyze run data and provide strategic insights to help the team improve their score.

## Competition Overview
This is a robotics competition where robots must:
1. Pick up a box and use it to unlock a path (red or green)
2. Complete Target Shooting section (climb ramp, navigate to center, shoot ball at target zones)
3. Complete Obstacle Course section (navigate winding path with sharp turns)
4. Return to starting position

## Scoring
- Curved ramp = more points than straight ramp
- Ball landing zones: Blue (best) > Green > Yellow > Red > White (worst)
- Wall hit = penalty
- Faster obstacle course = more points
- Returning to start = bonus points

## Your Task
Analyze the provided analytics data and give specific, actionable recommendations. Focus on:
1. What's working well
2. What needs improvement
3. Specific code/strategy changes to try
4. Which section to prioritize

Be concise and actionable. Use bullet points. Highlight the most impactful insights first.`;

export async function POST(req: Request) {
  try {
    const { prompt, analyticsData } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch fresh data from Snowflake if configured and no data provided
    let dataContext = analyticsData;
    
    if (!dataContext && isConfigured()) {
      try {
        const [overallStats, recentRuns, codeVersions] = await Promise.all([
          query('SELECT * FROM OVERALL_STATS'),
          query('SELECT * FROM SCORE_TRENDS ORDER BY run_number DESC LIMIT 20'),
          query('SELECT * FROM CODE_VERSION_PERFORMANCE LIMIT 5'),
        ]);

        dataContext = {
          overall: overallStats[0] ? normalizeKeys(overallStats[0]) : null,
          recentRuns: recentRuns.map(r => normalizeKeys(r)),
          codeVersions: codeVersions.map(r => normalizeKeys(r)),
        };
      } catch (e) {
        console.error('Failed to fetch Snowflake data for insights:', e);
      }
    }

    const dataString = dataContext 
      ? `\n\nAnalytics Data:\n${JSON.stringify(dataContext, null, 2)}`
      : '\n\nNo analytics data available.';

    const fullPrompt = `${prompt}${dataString}`;

    const result = streamText({
      model: google('gemini-2.0-flash'),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Analytics insights API error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
