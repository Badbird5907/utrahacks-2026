"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ArrowUpDown, Clock, Target, Route, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Fragment } from "react";
import Link from "next/link";

interface Run {
  id: string;
  number: number;
  startTimestamp: string;
  endTimestamp: string;
  score: number;
  codeHash: string;
  notes: string;
  sectionsAttempted: string[];
  rampType: string | null;
  reachedTargetCenter: boolean | null;
  ballLandingZone: string | null;
  ballHitWall: boolean | null;
  obstacleCompleted: boolean | null;
  obstacleIssues: string | null;
  returnedToStart: boolean;
  boxPickupSuccess: boolean | null;
  pathUnlocked: string | null;
  technicalIssues: string | null;
  createdAt: string;
}

type SortField = "number" | "score" | "duration" | "createdAt";
type SortDirection = "asc" | "desc";

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBallZoneColor(zone: string | null): string {
  switch (zone) {
    case "blue": return "bg-blue-500";
    case "green": return "bg-green-500";
    case "yellow": return "bg-yellow-500";
    case "red": return "bg-red-500";
    case "white": return "bg-gray-300";
    case "hit_wall": return "bg-orange-500";
    case "missed": return "bg-gray-500";
    default: return "bg-gray-400";
  }
}

function getBallZoneLabel(zone: string | null): string {
  switch (zone) {
    case "blue": return "Blue (Best)";
    case "green": return "Green";
    case "yellow": return "Yellow";
    case "red": return "Red";
    case "white": return "White";
    case "hit_wall": return "Hit Wall";
    case "missed": return "Missed";
    default: return "N/A";
  }
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const response = await fetch("/api/runs");
        const data = await response.json();
        if (data.success) {
          setRuns(data.data);
        } else {
          setError(data.error || "Failed to fetch runs");
        }
      } catch (err) {
        setError("Failed to fetch runs");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRuns();
  }, []);

  const filteredAndSortedRuns = useMemo(() => {
    let filtered = runs;

    // Apply section filter
    if (sectionFilter === "target_shooting") {
      filtered = runs.filter((r) => r.sectionsAttempted.includes("target_shooting"));
    } else if (sectionFilter === "obstacle_course") {
      filtered = runs.filter((r) => r.sectionsAttempted.includes("obstacle_course"));
    } else if (sectionFilter === "both") {
      filtered = runs.filter(
        (r) =>
          r.sectionsAttempted.includes("target_shooting") &&
          r.sectionsAttempted.includes("obstacle_course")
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "number":
          comparison = a.number - b.number;
          break;
        case "score":
          comparison = a.score - b.score;
          break;
        case "duration":
          const durationA = new Date(a.endTimestamp).getTime() - new Date(a.startTimestamp).getTime();
          const durationB = new Date(b.endTimestamp).getTime() - new Date(b.startTimestamp).getTime();
          comparison = durationA - durationB;
          break;
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [runs, sortField, sortDirection, sectionFilter]);

  // Statistics
  const stats = useMemo(() => {
    if (runs.length === 0) return null;

    const scores = runs.map((r) => r.score);
    const durations = runs.map((r) => 
      new Date(r.endTimestamp).getTime() - new Date(r.startTimestamp).getTime()
    );

    return {
      totalRuns: runs.length,
      bestScore: Math.max(...scores),
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      fastestTime: Math.min(...durations),
      returnedToStartRate: Math.round(
        (runs.filter((r) => r.returnedToStart).length / runs.length) * 100
      ),
      targetShootingAttempts: runs.filter((r) => 
        r.sectionsAttempted.includes("target_shooting")
      ).length,
      obstacleAttempts: runs.filter((r) => 
        r.sectionsAttempted.includes("obstacle_course")
      ).length,
    };
  }, [runs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedRun(expandedRun === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading runs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

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
          <h1 className="text-xl font-semibold">Run History</h1>
          <Badge variant="secondary">{runs.length} runs</Badge>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalRuns}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Best Score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.bestScore}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg Score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.avgScore}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Fastest Run</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(() => {
                    const totalSeconds = Math.floor(stats.fastestTime / 1000);
                    const minutes = Math.floor(totalSeconds / 60);
                    const seconds = totalSeconds % 60;
                    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
                  })()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Return Rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.returnedToStartRate}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Target Shooting</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  {stats.targetShootingAttempts}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Obstacle Course</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Route className="h-5 w-5 text-blue-500" />
                  {stats.obstacleAttempts}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter by section:</span>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Runs</SelectItem>
                <SelectItem value="target_shooting">Target Shooting</SelectItem>
                <SelectItem value="obstacle_course">Obstacle Course</SelectItem>
                <SelectItem value="both">Both Sections</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Runs Table */}
        {filteredAndSortedRuns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-muted-foreground">
                {runs.length === 0 ? "No runs recorded yet" : "No runs match the current filter"}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("number")}
                    >
                      Run #
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("createdAt")}
                    >
                      Date
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("duration")}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Duration
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("score")}
                    >
                      Score
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Sections</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Return</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedRuns.map((run) => (
                  <Fragment key={run.id}>
                    <TableRow 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpanded(run.id)}
                    >
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          {expandedRun === run.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">#{run.number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(run.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatDuration(run.startTimestamp, run.endTimestamp)}
                      </TableCell>
                      <TableCell>
                        <span className={`font-bold ${run.score >= 70 ? "text-green-600" : run.score >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                          {run.score}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {run.sectionsAttempted.includes("target_shooting") && (
                            <Badge variant="outline" className="text-xs">
                              <Target className="h-3 w-3 mr-1" />
                              Target
                            </Badge>
                          )}
                          {run.sectionsAttempted.includes("obstacle_course") && (
                            <Badge variant="outline" className="text-xs">
                              <Route className="h-3 w-3 mr-1" />
                              Obstacle
                            </Badge>
                          )}
                          {run.sectionsAttempted.length === 0 && (
                            <span className="text-muted-foreground text-sm">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {run.pathUnlocked ? (
                          <Badge
                            variant="secondary"
                            className={run.pathUnlocked === "green" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                          >
                            {run.pathUnlocked}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {run.returnedToStart ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        {run.technicalIssues ? (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Details Row */}
                    {expandedRun === run.id && (
                      <TableRow key={`${run.id}-details`} className="bg-muted/30">
                        <TableCell colSpan={9} className="py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
                            {/* General Info */}
                            <div className="space-y-3">
                              <h4 className="font-semibold text-sm">General</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Box Pickup:</span>
                                  <span>{run.boxPickupSuccess ? "Success" : run.boxPickupSuccess === false ? "Failed" : "N/A"}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Code Hash:</span>
                                  <span className="font-mono text-xs">{run.codeHash.slice(0, 8)}...</span>
                                </div>
                                {run.technicalIssues && (
                                  <div className="mt-2">
                                    <span className="text-muted-foreground">Technical Issues:</span>
                                    <p className="mt-1 text-yellow-600">{run.technicalIssues}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Target Shooting */}
                            {run.sectionsAttempted.includes("target_shooting") && (
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                  <Target className="h-4 w-4 text-orange-500" />
                                  Target Shooting
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Ramp Type:</span>
                                    <Badge variant={run.rampType === "curved" ? "default" : "secondary"}>
                                      {run.rampType || "N/A"}
                                    </Badge>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Reached Center:</span>
                                    <span>{run.reachedTargetCenter ? "Yes" : run.reachedTargetCenter === false ? "No" : "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Ball Landing:</span>
                                    <div className="flex items-center gap-2">
                                      <div className={`h-3 w-3 rounded-full ${getBallZoneColor(run.ballLandingZone)}`} />
                                      <span>{getBallZoneLabel(run.ballLandingZone)}</span>
                                    </div>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Hit Wall:</span>
                                    <span className={run.ballHitWall ? "text-red-500" : ""}>
                                      {run.ballHitWall ? "Yes (Penalty)" : run.ballHitWall === false ? "No" : "N/A"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Obstacle Course */}
                            {run.sectionsAttempted.includes("obstacle_course") && (
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                  <Route className="h-4 w-4 text-blue-500" />
                                  Obstacle Course
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Completed:</span>
                                    <span className={run.obstacleCompleted ? "text-green-500" : "text-red-500"}>
                                      {run.obstacleCompleted ? "Yes" : run.obstacleCompleted === false ? "No" : "N/A"}
                                    </span>
                                  </div>
                                  {run.obstacleIssues && (
                                    <div>
                                      <span className="text-muted-foreground">Issues:</span>
                                      <p className="mt-1">{run.obstacleIssues}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Notes */}
                            {run.notes && (
                              <div className="space-y-3 md:col-span-3">
                                <h4 className="font-semibold text-sm">Notes</h4>
                                <p className="text-sm text-muted-foreground">{run.notes}</p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
