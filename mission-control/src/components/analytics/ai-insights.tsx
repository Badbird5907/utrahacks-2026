"use client";

import { useState } from "react";
import { Sparkles, X, Loader2, TrendingUp, Target, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Streamdown } from "streamdown";
import { math } from "@streamdown/math";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";

interface AIInsightsProps {
  analyticsData: unknown;
  onClose: () => void;
}

export function AIInsights({ analyticsData, onClose }: AIInsightsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamInsights = async (prompt: string) => {
    setIsGenerating(true);
    setError(null);
    setInsights(""); // Start with empty string to show streaming

    try {
      const response = await fetch("/api/analytics/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          analyticsData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate insights");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // toTextStreamResponse returns plain text chunks
          const chunk = decoder.decode(value, { stream: true });
          accumulatedText += chunk;
          setInsights(accumulatedText);
        }
      }

      if (!accumulatedText) {
        setInsights("No insights generated. Please try again.");
      }
    } catch (err) {
      console.error("AI insights error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate insights");
      setInsights(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateFullAnalysis = () => {
    streamInsights(`Analyze this robotics competition data and provide strategic insights to help the team improve their score. Focus on:

1. Overall performance trends - are we improving?
2. Which sections (target shooting vs obstacle course) need more work
3. Ramp strategy - should we use curved or straight?
4. Ball shooting accuracy and wall hit penalties
5. Code version effectiveness - which code versions performed best?
6. Specific actionable recommendations

Provide 3-5 key insights with specific recommendations. Be concise and actionable.`);
  };

  const quickPrompts = [
    {
      icon: TrendingUp,
      label: "Show improvement trends",
      prompt: "What are the key improvement trends in our recent runs? Are we getting better? What specific improvements do you see?",
    },
    {
      icon: Target,
      label: "Optimize target shooting",
      prompt: "How can we improve our target shooting performance? Should we use curved or straight ramp? How can we improve ball accuracy and avoid wall hits?",
    },
    {
      icon: AlertCircle,
      label: "Identify weaknesses",
      prompt: "What are our biggest weaknesses based on the data? What's causing us to lose the most points? What should we focus on fixing first?",
    },
  ];

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>AI Insights</CardTitle>
            <CardDescription>
              Get strategic recommendations from Gemini based on your analytics data
            </CardDescription>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Prompts - show when not generating and no insights */}
        {!insights && !isGenerating && !error && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Quick analysis options:</p>
            <div className="grid gap-2">
              {quickPrompts.map((item) => (
                <Button
                  key={item.label}
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => streamInsights(item.prompt)}
                  disabled={isGenerating}
                >
                  <item.icon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="text-left">{item.label}</span>
                </Button>
              ))}
            </div>
            <div className="pt-2 border-t">
              <Button
                variant="default"
                className="w-full"
                onClick={generateFullAnalysis}
                disabled={isGenerating}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Full Analysis
              </Button>
            </div>
          </div>
        )}

        {/* Loading State - only show initially */}
        {isGenerating && insights === "" && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyzing your data with Gemini...
            </div>
          </div>
        )}

        {/* Streaming/Complete Insights Display */}
        {insights && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {isGenerating ? "Generating..." : "AI Generated"}
              </Badge>
              {!isGenerating && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setInsights(null);
                    setError(null);
                  }}
                >
                  New Analysis
                </Button>
              )}
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="bg-muted rounded-lg p-4 whitespace-pre-wrap">
                <Streamdown plugins={{ code, mermaid, math, cjk }}>
                  {insights}
                </Streamdown>
                {isGenerating && (
                  <span className="inline-block ml-1 animate-pulse">|</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Failed to generate insights
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    generateFullAnalysis();
                  }}
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
