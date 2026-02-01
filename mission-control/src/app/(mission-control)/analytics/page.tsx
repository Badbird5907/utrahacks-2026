"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Target, Route, Trophy, Clock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { AIInsights } from "@/components/analytics/ai-insights";

interface ScoreTrend {
  run_number: number;
  score: number;
  moving_avg_5: number;
  moving_avg_10: number;
  score_change: number | null;
  trend: string;
}

interface OverallStats {
  total_runs: number;
  avg_score: number;
  best_score: number;
  worst_score: number;
  avg_duration_seconds: number;
  fastest_run_seconds: number;
  return_rate_pct: number;
  target_shooting_attempts: number;
  obstacle_attempts: number;
  curved_ramp_attempts: number;
  straight_ramp_attempts: number;
  blue_zone_hits: number;
  wall_hits: number;
  obstacle_completions: number;
}

interface BallDistribution {
  ball_landing_zone: string;
  count: number;
  percentage: number;
}

interface CodeVersionPerformance {
  code_hash: string;
  run_count: number;
  avg_score: number;
  best_score: number;
  worst_score: number;
  return_rate_pct: number;
}

interface RampComparison {
  curved: { attempts: number; avgScore: number; centerReachRate: string };
  straight: { attempts: number; avgScore: number; centerReachRate: string };
}

interface AnalyticsData {
  overall: OverallStats | null;
  scoreTrends: ScoreTrend[];
  ballDistribution: BallDistribution[];
  codeVersions: CodeVersionPerformance[];
  insights: {
    recentAvgScore: number;
    improvementTrendPercent: string | null;
    rampComparison: RampComparison;
  };
}

const BALL_ZONE_COLORS: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  white: "#9ca3af",
  missed: "#6b7280",
  hit_wall: "#f97316",
};

const scoreChartConfig = {
  score: {
    label: "Score",
    color: "#8b5cf6",
  },
  moving_avg_5: {
    label: "5-Run Avg",
    color: "#10b981",
  },
} satisfies ChartConfig;

const ballZoneChartConfig = {
  count: {
    label: "Count",
  },
  blue: { label: "Blue (Best)", color: "#3b82f6" },
  green: { label: "Green", color: "#22c55e" },
  yellow: { label: "Yellow", color: "#eab308" },
  red: { label: "Red", color: "#ef4444" },
  white: { label: "White", color: "#9ca3af" },
  missed: { label: "Missed", color: "#6b7280" },
  hit_wall: { label: "Hit Wall", color: "#f97316" },
} satisfies ChartConfig;

const rampChartConfig = {
  avgScore: { label: "Average Score", color: "#8b5cf6" },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAIInsights, setShowAIInsights] = useState(false);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/analytics");
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Failed to fetch analytics");
      }
    } catch (err) {
      setError("Failed to connect to analytics service");
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRefresh = () => {
    fetchAnalytics(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading analytics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Mission Control
              </Button>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold">Run Analytics</h1>
          </div>
        </header>
        <main className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-destructive mb-4">{error}</div>
              <p className="text-muted-foreground text-sm mb-4">
                Make sure Snowflake is configured and the initialization script has been run.
              </p>
              <Button onClick={() => fetchAnalytics()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const overall = data?.overall;
  const scoreTrends = data?.scoreTrends || [];
  const ballDistribution = data?.ballDistribution || [];
  const codeVersions = data?.codeVersions || [];
  const insights = data?.insights;

  // Prepare ramp comparison data for bar chart
  const rampData = insights?.rampComparison
    ? [
        { type: "Curved", avgScore: insights.rampComparison.curved.avgScore, attempts: insights.rampComparison.curved.attempts },
        { type: "Straight", avgScore: insights.rampComparison.straight.avgScore, attempts: insights.rampComparison.straight.attempts },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Mission Control
              </Button>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold">Run Analytics</h1>
            {overall && <Badge variant="secondary">{overall.total_runs} runs</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showAIInsights ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowAIInsights(!showAIInsights)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              AI Insights
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* AI Insights Panel */}
        {showAIInsights && (
          <AIInsights analyticsData={data} onClose={() => setShowAIInsights(false)} />
        )}

        {/* Summary Cards */}
        {overall && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overall.total_runs}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Best Score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  {overall.best_score}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Recent Avg</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {insights?.recentAvgScore || Math.round(overall.avg_score)}
                  {insights?.improvementTrendPercent && (
                    <span className={`text-sm flex items-center ${parseFloat(insights.improvementTrendPercent) > 0 ? "text-green-500" : "text-red-500"}`}>
                      {parseFloat(insights.improvementTrendPercent) > 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {insights.improvementTrendPercent}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Fastest Run</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  {Math.floor(overall.fastest_run_seconds / 60)}:{(overall.fastest_run_seconds % 60).toString().padStart(2, "0")}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Return Rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(overall.return_rate_pct)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Blue Zone Hits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{overall.blue_zone_hits}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Score Trend
              </CardTitle>
              <CardDescription>Score progression with 5-run moving average</CardDescription>
            </CardHeader>
            <CardContent>
              {scoreTrends.length > 0 ? (
                <ChartContainer config={scoreChartConfig} className="h-[300px]">
                  <LineChart data={scoreTrends} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="run_number" label={{ value: "Run #", position: "bottom", offset: -5 }} stroke="#888" />
                    <YAxis domain={[0, 100]} stroke="#888" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="var(--color-score)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="moving_avg_5"
                      stroke="var(--color-moving_avg_5)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No score data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ball Landing Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-orange-500" />
                Ball Landing Zones
              </CardTitle>
              <CardDescription>Distribution of ball landing locations</CardDescription>
            </CardHeader>
            <CardContent>
              {ballDistribution.length > 0 ? (
                <ChartContainer config={ballZoneChartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ballDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="ball_landing_zone"
                        label={({ ball_landing_zone, percentage }) => `${ball_landing_zone}: ${percentage}%`}
                      >
                        {ballDistribution.map((entry) => (
                          <Cell
                            key={entry.ball_landing_zone}
                            fill={BALL_ZONE_COLORS[entry.ball_landing_zone] || "#888"}
                          />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No target shooting data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ramp Type Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5 text-blue-500" />
                Ramp Type Comparison
              </CardTitle>
              <CardDescription>Average score by ramp type</CardDescription>
            </CardHeader>
            <CardContent>
              {rampData.length > 0 && rampData.some(d => d.attempts > 0) ? (
                <ChartContainer config={rampChartConfig} className="h-[300px]">
                  <BarChart data={rampData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="type" stroke="#888" />
                    <YAxis domain={[0, 100]} stroke="#888" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="avgScore" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No ramp data available
                </div>
              )}
              {insights?.rampComparison && (
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="font-medium">Curved Ramp</div>
                    <div className="text-muted-foreground">
                      {insights.rampComparison.curved.attempts} attempts • {insights.rampComparison.curved.centerReachRate}% reached center
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="font-medium">Straight Ramp</div>
                    <div className="text-muted-foreground">
                      {insights.rampComparison.straight.attempts} attempts • {insights.rampComparison.straight.centerReachRate}% reached center
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Code Version Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Code Version Performance</CardTitle>
              <CardDescription>Performance by code hash (top versions)</CardDescription>
            </CardHeader>
            <CardContent>
              {codeVersions.length > 0 ? (
                <div className="space-y-3">
                  {codeVersions.slice(0, 5).map((version, index) => (
                    <div key={version.code_hash || index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                        <div>
                          <div className="font-mono text-sm">{version.code_hash?.slice(0, 8) || 'unknown'}...</div>
                          <div className="text-xs text-muted-foreground">{version.run_count || 0} runs</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">{Math.round(version.avg_score || 0)}</div>
                        <div className="text-xs text-muted-foreground">
                          Best: {version.best_score || 0} • Return: {Math.round(version.return_rate_pct || 0)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No code version data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section Stats */}
        {overall && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  Target Shooting Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{overall.target_shooting_attempts}</div>
                    <div className="text-sm text-muted-foreground">Total Attempts</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{overall.curved_ramp_attempts}</div>
                    <div className="text-sm text-muted-foreground">Curved Ramp</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-blue-500">{overall.blue_zone_hits}</div>
                    <div className="text-sm text-muted-foreground">Blue Zone Hits</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-orange-500">{overall.wall_hits}</div>
                    <div className="text-sm text-muted-foreground">Wall Penalties</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="h-5 w-5 text-blue-500" />
                  Obstacle Course Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{overall.obstacle_attempts}</div>
                    <div className="text-sm text-muted-foreground">Total Attempts</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-green-500">{overall.obstacle_completions}</div>
                    <div className="text-sm text-muted-foreground">Completions</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg col-span-2">
                    <div className="text-2xl font-bold">
                      {overall.obstacle_attempts > 0
                        ? Math.round((overall.obstacle_completions / overall.obstacle_attempts) * 100)
                        : 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">Completion Rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
