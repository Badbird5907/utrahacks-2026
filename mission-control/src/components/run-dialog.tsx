"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Play, Square, Timer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useProjectStore } from "@/lib/project-state";
import { getDaemonClient } from "@/lib/daemon-client";

type RunPhase = "ready" | "timing" | "recording";

interface RunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Hash content using SHA-256
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Format milliseconds to HH:MM:SS
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");
}

export function RunDialog({ open, onOpenChange }: RunDialogProps) {
  const [phase, setPhase] = useState<RunPhase>("ready");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Basic fields
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");

  // Section selection
  const [attemptedTargetShooting, setAttemptedTargetShooting] = useState(false);
  const [attemptedObstacleCourse, setAttemptedObstacleCourse] = useState(false);

  // Target Shooting fields
  const [rampType, setRampType] = useState<string>("");
  const [reachedTargetCenter, setReachedTargetCenter] = useState(false);
  const [ballLandingZone, setBallLandingZone] = useState<string>("");
  const [ballHitWall, setBallHitWall] = useState(false);

  // Obstacle Course fields
  const [obstacleCompleted, setObstacleCompleted] = useState(false);
  const [obstacleIssues, setObstacleIssues] = useState("");

  // General run info
  const [returnedToStart, setReturnedToStart] = useState(false);
  const [boxPickupSuccess, setBoxPickupSuccess] = useState(false);
  const [pathUnlocked, setPathUnlocked] = useState<string>("");
  const [technicalIssues, setTechnicalIssues] = useState("");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sketchPath = useProjectStore((s) => s.sketchPath);
  const sketchInfo = useProjectStore((s) => s.sketchInfo);
  const openFiles = useProjectStore((s) => s.openFiles);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPhase("ready");
      setElapsedMs(0);
      setStartTime(null);
      setEndTime(null);
      setScore("");
      setNotes("");
      setIsSaving(false);
      // Reset competition fields
      setAttemptedTargetShooting(false);
      setAttemptedObstacleCourse(false);
      setRampType("");
      setReachedTargetCenter(false);
      setBallLandingZone("");
      setBallHitWall(false);
      setObstacleCompleted(false);
      setObstacleIssues("");
      setReturnedToStart(false);
      setBoxPickupSuccess(false);
      setPathUnlocked("");
      setTechnicalIssues("");
    }
  }, [open]);

  // Stopwatch interval
  useEffect(() => {
    if (phase === "timing" && startTime) {
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime.getTime());
      }, 100);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, startTime]);

  const handleStart = useCallback(() => {
    const now = new Date();
    setStartTime(now);
    setElapsedMs(0);
    setPhase("timing");
  }, []);

  const handleStop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const now = new Date();
    setEndTime(now);
    if (startTime) {
      setElapsedMs(now.getTime() - startTime.getTime());
    }
    setPhase("recording");
  }, [startTime]);

  const handleSave = useCallback(async () => {
    if (!startTime || !endTime || !sketchPath || !sketchInfo) {
      toast.error("Missing required data");
      return;
    }

    const scoreNum = parseInt(score, 10);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 99) {
      toast.error("Score must be a number between 0 and 99");
      return;
    }

    setIsSaving(true);

    try {
      // Get the main .ino file content for hashing
      let inoContent = "";
      const mainFilePath = sketchPath + "/" + sketchInfo.mainFile;
      const normalizedMainPath = mainFilePath.replace(/\\/g, "/");

      const openFile = openFiles.find(
        (f) => f.path.replace(/\\/g, "/") === normalizedMainPath
      );
      if (openFile) {
        inoContent = openFile.content;
      } else {
        const client = getDaemonClient();
        const result = await client.readFile(mainFilePath);
        inoContent = result.content;
      }

      const codeHash = await hashContent(inoContent);

      // Build sections attempted array
      const sectionsAttempted: string[] = [];
      if (attemptedTargetShooting) sectionsAttempted.push("target_shooting");
      if (attemptedObstacleCourse) sectionsAttempted.push("obstacle_course");

      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTimestamp: startTime.toISOString(),
          endTimestamp: endTime.toISOString(),
          score: scoreNum,
          codeHash,
          notes: notes.trim(),
          // Competition fields
          sectionsAttempted,
          rampType: attemptedTargetShooting ? rampType || null : null,
          reachedTargetCenter: attemptedTargetShooting ? reachedTargetCenter : null,
          ballLandingZone: attemptedTargetShooting ? ballLandingZone || null : null,
          ballHitWall: attemptedTargetShooting ? ballHitWall : null,
          obstacleCompleted: attemptedObstacleCourse ? obstacleCompleted : null,
          obstacleIssues: attemptedObstacleCourse ? obstacleIssues.trim() || null : null,
          returnedToStart,
          boxPickupSuccess,
          pathUnlocked: pathUnlocked || null,
          technicalIssues: technicalIssues.trim() || null,
          metadata: {},
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save run");
      }

      toast.success(`Run #${data.data.number} saved!`, {
        description: `Score: ${scoreNum} | Duration: ${formatTime(elapsedMs)}`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save run:", error);
      toast.error("Failed to save run", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    startTime,
    endTime,
    sketchPath,
    sketchInfo,
    openFiles,
    score,
    notes,
    elapsedMs,
    onOpenChange,
    attemptedTargetShooting,
    attemptedObstacleCourse,
    rampType,
    reachedTargetCenter,
    ballLandingZone,
    ballHitWall,
    obstacleCompleted,
    obstacleIssues,
    returnedToStart,
    boxPickupSuccess,
    pathUnlocked,
    technicalIssues,
  ]);

  const handleCancel = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onOpenChange(false);
  }, [onOpenChange]);

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || (/^\d+$/.test(value) && parseInt(value, 10) <= 99)) {
      setScore(value);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={phase === "recording" ? "sm:max-w-[600px] max-h-[90vh]" : "sm:max-w-[450px]"} 
        showCloseButton={phase === "ready"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {phase === "recording" ? "Record Run Results" : "Begin Run"}
          </DialogTitle>
          <DialogDescription>
            {phase === "ready" && "Start the timer when you're ready to begin your run."}
            {phase === "timing" && "Timer is running. Click Stop when you're finished."}
            {phase === "recording" && "Record all details about this run for AI analysis."}
          </DialogDescription>
        </DialogHeader>

        {/* Stopwatch Display */}
        <div className={`flex flex-col items-center ${phase === "recording" ? "py-4" : "py-8"}`}>
          <div
            className={`font-mono font-bold tracking-wider ${
              phase === "timing" ? "text-primary" : "text-foreground"
            } ${phase === "recording" ? "text-3xl" : "text-5xl"}`}
          >
            {formatTime(elapsedMs)}
          </div>

          {phase !== "recording" && (
            <div className="mt-6">
              {phase === "ready" ? (
                <Button size="lg" onClick={handleStart} className="gap-2">
                  <Play className="h-5 w-5" />
                  Start
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleStop}
                  className="gap-2"
                >
                  <Square className="h-5 w-5" />
                  Stop
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Recording Form */}
        {phase === "recording" && (
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-6">
              {/* Score */}
              <div className="space-y-2">
                <Label htmlFor="run-score">Score (0-99) *</Label>
                <Input
                  id="run-score"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Enter score"
                  value={score}
                  onChange={handleScoreChange}
                  autoFocus
                />
              </div>

              {/* General Run Info */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">General</Label>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="box-pickup"
                    checked={boxPickupSuccess}
                    onCheckedChange={(checked) => setBoxPickupSuccess(checked === true)}
                  />
                  <Label htmlFor="box-pickup" className="font-normal">Successfully picked up box</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="path-unlocked">Path Unlocked</Label>
                  <Select value={pathUnlocked} onValueChange={setPathUnlocked}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select path..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="red">Red Path</SelectItem>
                      <SelectItem value="green">Green Path</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="returned-start"
                    checked={returnedToStart}
                    onCheckedChange={(checked) => setReturnedToStart(checked === true)}
                  />
                  <Label htmlFor="returned-start" className="font-normal">Returned to starting position</Label>
                </div>
              </div>

              {/* Sections Attempted */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Sections Attempted</Label>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="target-shooting"
                    checked={attemptedTargetShooting}
                    onCheckedChange={(checked) => setAttemptedTargetShooting(checked === true)}
                  />
                  <Label htmlFor="target-shooting" className="font-normal">Target Shooting</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="obstacle-course"
                    checked={attemptedObstacleCourse}
                    onCheckedChange={(checked) => setAttemptedObstacleCourse(checked === true)}
                  />
                  <Label htmlFor="obstacle-course" className="font-normal">Obstacle Course</Label>
                </div>
              </div>

              {/* Target Shooting Details */}
              {attemptedTargetShooting && (
                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                  <Label className="text-base font-semibold text-primary">Target Shooting Details</Label>

                  <div className="space-y-2">
                    <Label htmlFor="ramp-type">Ramp Type</Label>
                    <Select value={rampType} onValueChange={setRampType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select ramp..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="straight">Straight Ramp</SelectItem>
                        <SelectItem value="curved">Curved Ramp (More Points)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="reached-center"
                      checked={reachedTargetCenter}
                      onCheckedChange={(checked) => setReachedTargetCenter(checked === true)}
                    />
                    <Label htmlFor="reached-center" className="font-normal">Reached target center (black zone)</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ball-landing">Ball Landing Zone</Label>
                    <Select value={ballLandingZone} onValueChange={setBallLandingZone}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Where did ball land?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blue">Blue Zone (Best!)</SelectItem>
                        <SelectItem value="green">Green Zone</SelectItem>
                        <SelectItem value="yellow">Yellow Zone</SelectItem>
                        <SelectItem value="red">Red Zone</SelectItem>
                        <SelectItem value="white">White Zone</SelectItem>
                        <SelectItem value="missed">Missed / Did not shoot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ball-hit-wall"
                      checked={ballHitWall}
                      onCheckedChange={(checked) => setBallHitWall(checked === true)}
                    />
                    <Label htmlFor="ball-hit-wall" className="font-normal text-destructive">Ball hit/bounced off wall (penalty)</Label>
                  </div>
                </div>
              )}

              {/* Obstacle Course Details */}
              {attemptedObstacleCourse && (
                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                  <Label className="text-base font-semibold text-primary">Obstacle Course Details</Label>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="obstacle-completed"
                      checked={obstacleCompleted}
                      onCheckedChange={(checked) => setObstacleCompleted(checked === true)}
                    />
                    <Label htmlFor="obstacle-completed" className="font-normal">Completed obstacle course</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="obstacle-issues">Issues During Obstacle Course</Label>
                    <Input
                      id="obstacle-issues"
                      placeholder="e.g., got stuck on turn 3, missed a turn..."
                      value={obstacleIssues}
                      onChange={(e) => setObstacleIssues(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Technical Issues */}
              <div className="space-y-2">
                <Label htmlFor="technical-issues">Technical Issues</Label>
                <Input
                  id="technical-issues"
                  placeholder="Any hardware/software problems..."
                  value={technicalIssues}
                  onChange={(e) => setTechnicalIssues(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="run-notes">Additional Notes</Label>
                <Textarea
                  id="run-notes"
                  placeholder="Any other observations about this run..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {phase === "recording" && (
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !score}>
              {isSaving ? "Saving..." : "Save Run"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
