import { google } from '@ai-sdk/google';
import { streamText, tool, convertToModelMessages, UIMessage } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// Default system prompt for general Arduino coding assistant
const DEFAULT_SYSTEM_PROMPT = `You are an expert Arduino programming assistant integrated into Mission Control, an Arduino IDE. You help users write, debug, and improve their Arduino sketches.

Your capabilities:
1. Answer questions about Arduino programming, electronics, and embedded systems
2. Explain code and suggest improvements
3. Help debug compilation errors and runtime issues
4. Edit files when the user asks you to make changes
5. Read serial monitor output to debug runtime behavior (use readSerialLogs tool)
6. Verify (compile) sketches to check for errors (use verifySketch tool)
7. Upload sketches to the Arduino board (use uploadSketch tool)

When editing files:
- Use the editFile tool with a unified diff patch to make changes
- Use the listFiles tool to list the files in the project (use "./" for the project root)
- Use the readFile tool to read files not already in context
- Use the readSerialLogs tool to check what the Arduino is outputting via Serial.print()
- Always use relative paths (e.g., "./sketch.ino", "./lib/helpers.h")

When building/uploading:
- IMPORTANT: Always run verifySketch BEFORE uploadSketch to catch compilation errors early
- The verifySketch tool compiles the code but does NOT upload it - use this to check for errors
- The uploadSketch tool compiles AND uploads the code to the connected Arduino
- Both tools return the full compiler output so you can see any errors or warnings

## Unified Diff Format

When using editFile, generate a standard unified diff patch:

\`\`\`
--- a/filename
+++ b/filename
@@ -start,count +start,count @@
 context line (unchanged, prefix with single space)
-removed line (prefix with -)
+added line (prefix with +)
 context line
\`\`\`

Important diff rules:
- Include at least 3 lines of context around each change
- Context lines MUST match the actual file content exactly
- Use a single space prefix for unchanged context lines
- The line numbers in @@ don't need to be perfect - focus on correct context
- One file per editFile call - use multiple calls for multiple files
- Make minimal, focused changes

When users @mention files, their contents are provided as context with relative paths. Use these relative paths when referencing or editing files.

Be concise but helpful. Use code blocks with appropriate syntax highlighting.`;

// Competition optimization system prompt
const COMPETITION_SYSTEM_PROMPT = `You are an expert Arduino programming assistant and robotics competition coach integrated into Mission Control. Your PRIMARY GOAL is to help the team optimize their robot's performance to achieve the HIGHEST POSSIBLE SCORE in the robotics competition.

## Competition Overview

This is a robotics competition where the robot must complete various challenges on a track. The team's goal is to maximize their score through better code, strategy, and execution.

### Course Structure

**Starting the Course:**
- The robot must pick up a box located beside the blue circles on the track
- The robot carries the box to a blue circle on either the RED or GREEN path to unlock that section
- After completing a section, the robot can pick up another box on its way back to unlock another section or finish

### Section 1: Target Shooting (Red or Green Path)
1. Robot climbs either:
   - **Straight ramp** (fewer points)
   - **Curved ramp** (MORE POINTS - prefer this if reliable)
2. At the top, robot is randomly placed on a target area
3. Robot must use COLOR CUES to navigate toward the CENTER (black zone)
4. Team may re-upload code after reaching the black section
5. **Ball Shooting Challenge:**
   - A ball is at the center (black zone)
   - Robot must SHOOT/LAUNCH the ball forward
   - **Maximum points**: Ball lands in BLUE ZONE without touching walls
   - Points DECREASE the further from blue zone
   - **PENALTY**: Ball touches/bounces off wall = LOSE POINTS
6. Robot returns down the ramp, can collect second battery to unlock other section

### Section 2: Obstacle Course (Red or Green Path)  
1. Robot navigates a winding path with SHARP TURNS and OBSTACLES
2. Goal: Complete as QUICKLY and SMOOTHLY as possible
3. **FASTER completion = MORE POINTS**
4. Path leads back to main area

### Completing the Challenge
- Robot must return to ORIGINAL STARTING POSITION
- Teams may attempt either section, both, or neither
- Points awarded based on DIFFICULTY and PERFORMANCE

## Your Optimization Responsibilities

1. **Analyze Run History**: Use the \`getRuns\` tool to review past runs, scores, and notes
2. **Identify Patterns**: Look for what worked well and what caused problems
3. **Suggest Improvements**: Based on run data and code, suggest specific optimizations
4. **Code Optimization Focus Areas**:
   - COLOR SENSOR calibration for accurate zone detection
   - MOTOR CONTROL for smooth, fast movement
   - BALL LAUNCHING mechanism for consistent, powerful shots
   - PATH FOLLOWING accuracy for obstacle course speed
   - TIMING and SPEED optimization
   - ERROR RECOVERY when things go wrong

5. **Strategic Advice**:
   - Should we attempt curved ramp vs straight ramp?
   - Which section to prioritize based on current performance?
   - Trade-offs between speed and accuracy

## Your Capabilities

1. Answer questions about Arduino programming, electronics, and embedded systems
2. Explain code and suggest improvements for COMPETITION PERFORMANCE
3. Help debug compilation errors and runtime issues
4. Edit files when the user asks you to make changes
5. Read serial monitor output to debug runtime behavior (use readSerialLogs tool)
6. Verify (compile) sketches to check for errors (use verifySketch tool)
7. Upload sketches to the Arduino board (use uploadSketch tool)
8. **Review run history** to analyze performance trends (use getRuns tool)

When editing files:
- Use the editFile tool with a unified diff patch to make changes
- Use the listFiles tool to list the files in the project (use "./" for the project root)
- Use the readFile tool to read files not already in context
- Use the readSerialLogs tool to check what the Arduino is outputting via Serial.print()
- Always use relative paths (e.g., "./sketch.ino", "./lib/helpers.h")

When building/uploading:
- IMPORTANT: Always run verifySketch BEFORE uploadSketch to catch compilation errors early
- The verifySketch tool compiles the code but does NOT upload it - use this to check for errors
- The uploadSketch tool compiles AND uploads the code to the connected Arduino
- Both tools return the full compiler output so you can see any errors or warnings

## Unified Diff Format

When using editFile, generate a standard unified diff patch:

\`\`\`
--- a/filename
+++ b/filename
@@ -start,count +start,count @@
 context line (unchanged, prefix with single space)
-removed line (prefix with -)
+added line (prefix with +)
 context line
\`\`\`

Important diff rules:
- Include at least 3 lines of context around each change
- Context lines MUST match the actual file content exactly
- Use a single space prefix for unchanged context lines
- The line numbers in @@ don't need to be perfect - focus on correct context
- One file per editFile call - use multiple calls for multiple files
- Make minimal, focused changes

When users @mention files, their contents are provided as context with relative paths. Use these relative paths when referencing or editing files.

## Mindset

Always think: "How can this change help us score MORE POINTS?"
- Faster obstacle course completion = more points
- More accurate ball shooting = more points  
- Successful curved ramp = more points
- Consistent, reliable runs = more points over time

Be proactive! If you notice patterns in the run data that suggest improvements, mention them. If you see code that could be optimized for competition performance, suggest it.

Be concise but helpful. Use code blocks with appropriate syntax highlighting.`;

function buildSystemPrompt(fileContents: Record<string, string>, useCompetitionMode: boolean): string {
  const basePrompt = useCompetitionMode ? COMPETITION_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;
  
  if (Object.keys(fileContents).length === 0) {
    return basePrompt;
  }

  const fileContext = Object.entries(fileContents)
    .map(([path, content]) => {
      const fileName = path.split('/').pop() || path;
      return `### File: ${fileName}\nPath: ${path}\n\`\`\`cpp\n${content}\n\`\`\``;
    })
    .join('\n\n');

  return `${basePrompt}

## Current File Context

The user has provided the following files for context:

${fileContext}

When referencing these files, use the relative paths shown above (e.g., "./sketch.ino").`;
}

export async function POST(req: Request) {
  try {
    const { 
      messages, 
      fileContents = {}, 
      competitionMode = false 
    }: { 
      messages: UIMessage[], 
      fileContents?: Record<string, string>,
      competitionMode?: boolean
    } = await req.json();

    const systemPrompt = buildSystemPrompt(fileContents, competitionMode);

    const result = streamText({
      model: google('gemini-3-pro-preview'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'low', // for demo reasons
            includeThoughts: true,
          }
        }
      },
      tools: {
        editFile: tool({
          description: 'Edit a file by providing a unified diff patch. Generate a standard unified diff format showing the changes to make. Include 3+ lines of context for reliable matching. The patch will be applied by a specialized model that can handle minor context variations.',
          inputSchema: z.object({
            filePath: z.string().describe('The relative path of the file to edit (e.g., "./sketch.ino", "./lib/helpers.h")'),
            patch: z.string().describe('A unified diff patch starting with --- a/filename and +++ b/filename, followed by hunks with @@ line markers. Include context lines (prefixed with space), removed lines (prefixed with -), and added lines (prefixed with +).'),
            description: z.string().describe('A brief description of what this edit does'),
          }),
        }),
        listFiles: tool({
          description: 'List the files in the project',
          inputSchema: z.object({
            path: z.string().describe('The relative path to list files from (use "./" for project root)'),
          }),
        }),
        readFile: tool({
          description: 'Read the contents of a file in the project. Use this when you need to see file contents that were not @mentioned by the user.',
          inputSchema: z.object({
            filePath: z.string().describe('The relative path of the file to read (e.g., "./sketch.ino")'),
          }),
        }),
        readSerialLogs: tool({
          description: 'Read the recent serial monitor logs from the Arduino. Use this to see what the Arduino is outputting via Serial.print() statements. This is useful for debugging runtime behavior, checking sensor readings, or understanding what the Arduino is doing.',
          inputSchema: z.object({
            limit: z.number().optional().describe('Maximum number of log lines to return (default: 50, max: 500)'),
          }),
        }),
        verifySketch: tool({
          description: 'Verify (compile) the Arduino sketch to check for errors. This does NOT upload to the board. Use this to check if code compiles correctly. IMPORTANT: Always run this before uploadSketch to catch compilation errors early. Returns the full compiler output.',
          inputSchema: z.object({}),
        }),
        uploadSketch: tool({
          description: 'Compile and upload the Arduino sketch to the connected board. This will compile the code and flash it to the Arduino. IMPORTANT: Always run verifySketch first to check for compilation errors before uploading. Returns the full compiler/upload output.',
          inputSchema: z.object({}),
        }),
        getRuns: tool({
          description: `Get the history of timed competition runs from the database. Each run contains detailed competition data including:
- Basic: run number, score (0-99), duration, timestamps, code hash, notes
- Sections attempted: target_shooting, obstacle_course
- Target Shooting: ramp type (straight/curved), reached center, ball landing zone, wall hit
- Obstacle Course: completed, issues encountered
- General: returned to start, box pickup success, path unlocked, technical issues

Use this to analyze past performance, identify patterns, and suggest specific improvements. The runs are ordered by run number descending (newest first).`,
          inputSchema: z.object({
            limit: z.number().optional().describe('Maximum number of runs to return (default: 10, max: 100)'),
          }),
          execute: async ({ limit = 10 }) => {
            const runs = await prisma.runs.findMany({
              orderBy: { number: 'desc' },
              take: Math.min(limit, 100),
            });
            
            // Calculate duration for each run and format for better readability
            const formattedRuns = runs.map(run => {
              const durationMs = new Date(run.endTimestamp).getTime() - new Date(run.startTimestamp).getTime();
              const durationSeconds = Math.floor(durationMs / 1000);
              const minutes = Math.floor(durationSeconds / 60);
              const seconds = durationSeconds % 60;
              
              return {
                runNumber: run.number,
                score: run.score,
                duration: `${minutes}m ${seconds}s`,
                durationMs,
                
                // Sections attempted
                sectionsAttempted: run.sectionsAttempted,
                
                // Target Shooting details
                targetShooting: run.sectionsAttempted.includes('target_shooting') ? {
                  rampType: run.rampType,
                  reachedCenter: run.reachedTargetCenter,
                  ballLandingZone: run.ballLandingZone,
                  ballHitWall: run.ballHitWall,
                } : null,
                
                // Obstacle Course details
                obstacleCourse: run.sectionsAttempted.includes('obstacle_course') ? {
                  completed: run.obstacleCompleted,
                  issues: run.obstacleIssues,
                } : null,
                
                // General run info
                returnedToStart: run.returnedToStart,
                boxPickupSuccess: run.boxPickupSuccess,
                pathUnlocked: run.pathUnlocked,
                technicalIssues: run.technicalIssues,
                
                notes: run.notes,
                codeHash: run.codeHash.substring(0, 8) + '...', // Shortened for readability
                createdAt: run.createdAt,
              };
            });
            
            // Calculate detailed statistics
            const targetShootingRuns = runs.filter(r => r.sectionsAttempted.includes('target_shooting'));
            const obstacleRuns = runs.filter(r => r.sectionsAttempted.includes('obstacle_course'));
            const curvedRampRuns = targetShootingRuns.filter(r => r.rampType === 'curved');
            const blueZoneHits = targetShootingRuns.filter(r => r.ballLandingZone === 'blue');
            const wallHits = targetShootingRuns.filter(r => r.ballHitWall === true);
            const completedObstacles = obstacleRuns.filter(r => r.obstacleCompleted === true);
            
            return {
              totalRuns: runs.length,
              runs: formattedRuns,
              summary: runs.length > 0 ? {
                bestScore: Math.max(...runs.map(r => r.score)),
                averageScore: Math.round(runs.reduce((sum, r) => sum + r.score, 0) / runs.length),
                fastestRunMs: Math.min(...runs.map(r => new Date(r.endTimestamp).getTime() - new Date(r.startTimestamp).getTime())),
                returnedToStartRate: `${runs.filter(r => r.returnedToStart).length}/${runs.length}`,
              } : null,
              targetShootingStats: targetShootingRuns.length > 0 ? {
                attempts: targetShootingRuns.length,
                curvedRampAttempts: curvedRampRuns.length,
                reachedCenterRate: `${targetShootingRuns.filter(r => r.reachedTargetCenter).length}/${targetShootingRuns.length}`,
                blueZoneHits: blueZoneHits.length,
                wallHitPenalties: wallHits.length,
                ballLandingDistribution: {
                  blue: targetShootingRuns.filter(r => r.ballLandingZone === 'blue').length,
                  green: targetShootingRuns.filter(r => r.ballLandingZone === 'green').length,
                  yellow: targetShootingRuns.filter(r => r.ballLandingZone === 'yellow').length,
                  red: targetShootingRuns.filter(r => r.ballLandingZone === 'red').length,
                  white: targetShootingRuns.filter(r => r.ballLandingZone === 'white').length,
                  missed: targetShootingRuns.filter(r => r.ballLandingZone === 'missed').length,
                },
              } : null,
              obstacleCourseStats: obstacleRuns.length > 0 ? {
                attempts: obstacleRuns.length,
                completionRate: `${completedObstacles.length}/${obstacleRuns.length}`,
                commonIssues: obstacleRuns
                  .filter(r => r.obstacleIssues)
                  .map(r => r.obstacleIssues),
              } : null,
            };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
