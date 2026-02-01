import { query, isConfigured } from "@/lib/snowflake";

export const dynamic = "force-dynamic";

// Snowflake returns UPPERCASE column names, normalize to lowercase
function normalizeKeys<T>(obj: Record<string, unknown>): T {
  const normalized: Record<string, unknown> = {};
  for (const key in obj) {
    normalized[key.toLowerCase()] = obj[key];
  }
  return normalized as T;
}

function normalizeArray<T>(arr: Record<string, unknown>[]): T[] {
  return arr.map(item => normalizeKeys<T>(item));
}

interface ScoreTrend {
  run_number: number;
  score: number;
  moving_avg_5: number;
  moving_avg_10: number;
  score_change: number | null;
  trend: string;
  start_timestamp: string;
}

interface OverallStats {
  total_runs: number;
  avg_score: number;
  best_score: number;
  worst_score: number;
  score_stddev: number;
  avg_duration_seconds: number;
  fastest_run_seconds: number;
  return_rate_pct: number;
  box_pickup_rate_pct: number | null;
  target_shooting_attempts: number;
  obstacle_attempts: number;
  both_sections_attempts: number;
  curved_ramp_attempts: number;
  straight_ramp_attempts: number;
  blue_zone_hits: number;
  wall_hits: number;
  obstacle_completions: number;
}

interface TargetShootingStats {
  run_number: number;
  score: number;
  ramp_type: string;
  reached_target_center: boolean;
  ball_landing_zone: string;
  ball_hit_wall: boolean;
  landing_zone_score: number;
  wall_penalty: number;
}

interface CodeVersionPerformance {
  code_hash: string;
  run_count: number;
  avg_score: number;
  best_score: number;
  worst_score: number;
  score_stddev: number;
  avg_duration: number;
  return_rate_pct: number;
  first_run: string;
  last_run: string;
}

interface DailySummary {
  run_date: string;
  runs: number;
  avg_score: number;
  best_score: number;
  worst_score: number;
  avg_duration: number;
  successful_returns: number;
  target_shooting_attempts: number;
  obstacle_attempts: number;
}

interface BallLandingDistribution {
  ball_landing_zone: string;
  count: number;
  percentage: number;
}

export async function GET(): Promise<Response> {
  if (!isConfigured()) {
    return Response.json(
      { 
        success: false, 
        error: "Snowflake is not configured. Please set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PASSWORD environment variables." 
      },
      { status: 503 }
    );
  }

  try {
    // Run all queries in parallel for better performance
    const [
      scoreTrendsRaw,
      overallStatsRaw,
      targetShootingRaw,
      codeVersionsRaw,
      dailySummaryRaw,
      ballDistributionRaw,
    ] = await Promise.all([
      // Score trends (last 50 runs)
      query(`
        SELECT run_number, score, moving_avg_5, moving_avg_10, score_change, trend, start_timestamp
        FROM SCORE_TRENDS
        ORDER BY run_number DESC
        LIMIT 50
      `),
      
      // Overall statistics
      query(`SELECT * FROM OVERALL_STATS`),
      
      // Target shooting stats (last 20)
      query(`
        SELECT * FROM TARGET_SHOOTING_STATS
        ORDER BY run_number DESC
        LIMIT 20
      `),
      
      // Code version performance (top 10 by run count)
      query(`
        SELECT * FROM CODE_VERSION_PERFORMANCE
        LIMIT 10
      `),
      
      // Daily summary (last 14 days)
      query(`
        SELECT * FROM DAILY_SUMMARY
        LIMIT 14
      `),
      
      // Ball landing zone distribution
      query(`
        SELECT 
          ball_landing_zone,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
        FROM COMPETITION_RUNS
        WHERE ball_landing_zone IS NOT NULL
        GROUP BY ball_landing_zone
        ORDER BY count DESC
      `),
    ]);

    // Transform results - normalize UPPERCASE keys from Snowflake to lowercase
    const scoreTrends = normalizeArray<ScoreTrend>(scoreTrendsRaw).reverse(); // Oldest first for chart
    const overallStats = overallStatsRaw[0] ? normalizeKeys<OverallStats>(overallStatsRaw[0]) : undefined;
    const targetShooting = normalizeArray<TargetShootingStats>(targetShootingRaw);
    const codeVersions = normalizeArray<CodeVersionPerformance>(codeVersionsRaw);
    const dailySummary = normalizeArray<DailySummary>(dailySummaryRaw);
    const ballDistribution = normalizeArray<BallLandingDistribution>(ballDistributionRaw);

    // Calculate additional insights
    const recentRuns = scoreTrends.slice(-10);
    const olderRuns = scoreTrends.slice(-20, -10);
    
    const recentAvg = recentRuns.length > 0 
      ? recentRuns.reduce((sum, r) => sum + r.score, 0) / recentRuns.length 
      : 0;
    const olderAvg = olderRuns.length > 0 
      ? olderRuns.reduce((sum, r) => sum + r.score, 0) / olderRuns.length 
      : 0;
    
    const improvementTrend = olderAvg > 0 
      ? ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1)
      : null;

    // Ramp type comparison
    const curvedRampRuns = targetShooting.filter(r => r.ramp_type === 'curved');
    const straightRampRuns = targetShooting.filter(r => r.ramp_type === 'straight');
    
    const rampComparison = {
      curved: {
        attempts: curvedRampRuns.length,
        avgScore: curvedRampRuns.length > 0 
          ? curvedRampRuns.reduce((sum, r) => sum + r.score, 0) / curvedRampRuns.length 
          : 0,
        centerReachRate: curvedRampRuns.length > 0
          ? (curvedRampRuns.filter(r => r.reached_target_center).length / curvedRampRuns.length * 100).toFixed(1)
          : 0,
      },
      straight: {
        attempts: straightRampRuns.length,
        avgScore: straightRampRuns.length > 0 
          ? straightRampRuns.reduce((sum, r) => sum + r.score, 0) / straightRampRuns.length 
          : 0,
        centerReachRate: straightRampRuns.length > 0
          ? (straightRampRuns.filter(r => r.reached_target_center).length / straightRampRuns.length * 100).toFixed(1)
          : 0,
      },
    };

    return Response.json({
      success: true,
      data: {
        overall: overallStats || null,
        scoreTrends,
        targetShooting,
        codeVersions,
        dailySummary,
        ballDistribution,
        insights: {
          recentAvgScore: Math.round(recentAvg * 10) / 10,
          improvementTrendPercent: improvementTrend,
          rampComparison,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, error: `Failed to fetch analytics: ${message}` },
      { status: 500 }
    );
  }
}
