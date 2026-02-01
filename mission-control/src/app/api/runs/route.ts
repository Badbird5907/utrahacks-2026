import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CreateRunSchema = z.object({
  startTimestamp: z.string().datetime(),
  endTimestamp: z.string().datetime(),
  score: z.number().int().min(0).max(99),
  codeHash: z.string(),
  notes: z.string(),
  
  // Competition-specific fields
  sectionsAttempted: z.array(z.string()).default([]),
  
  // Target Shooting
  rampType: z.enum(["straight", "curved"]).nullable().optional(),
  reachedTargetCenter: z.boolean().nullable().optional(),
  ballLandingZone: z.enum(["blue", "green", "yellow", "red", "white", "missed", "hit_wall"]).nullable().optional(),
  ballHitWall: z.boolean().nullable().optional(),
  
  // Obstacle Course
  obstacleCompleted: z.boolean().nullable().optional(),
  obstacleIssues: z.string().nullable().optional(),
  
  // General run info
  returnedToStart: z.boolean().default(false),
  boxPickupSuccess: z.boolean().nullable().optional(),
  pathUnlocked: z.enum(["red", "green", "none"]).nullable().optional(),
  
  // Issues
  technicalIssues: z.string().nullable().optional(),
  
  metadata: z.record(z.unknown()).optional().default({}),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Validate request body
    const parsed = CreateRunSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }

    const {
      startTimestamp,
      endTimestamp,
      score,
      codeHash,
      notes,
      sectionsAttempted,
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
      metadata,
    } = parsed.data;

    // Get the next run number (find max and increment)
    const lastRun = await prisma.runs.findFirst({
      orderBy: { number: "desc" },
      select: { number: true },
    });

    const nextNumber = lastRun ? lastRun.number + 1 : 1;

    // Create the run with all fields
    const run = await prisma.runs.create({
      data: {
        number: nextNumber,
        startTimestamp: new Date(startTimestamp),
        endTimestamp: new Date(endTimestamp),
        score,
        codeHash,
        notes,
        sectionsAttempted,
        rampType: rampType ?? null,
        reachedTargetCenter: reachedTargetCenter ?? null,
        ballLandingZone: ballLandingZone ?? null,
        ballHitWall: ballHitWall ?? null,
        obstacleCompleted: obstacleCompleted ?? null,
        obstacleIssues: obstacleIssues ?? null,
        returnedToStart,
        boxPickupSuccess: boxPickupSuccess ?? null,
        pathUnlocked: pathUnlocked === "none" ? null : pathUnlocked ?? null,
        technicalIssues: technicalIssues ?? null,
        metadata,
      },
    });

    return Response.json({ success: true, data: run });
  } catch (error: unknown) {
    console.error("Create run API error:", error);
    const message = error instanceof Error ? error.message : "An error occurred";
    return Response.json(
      { success: false, error: `Internal error: ${message}` },
      { status: 500 }
    );
  }
}

// GET endpoint to list all runs
export async function GET(): Promise<Response> {
  try {
    const runs = await prisma.runs.findMany({
      orderBy: { number: "desc" },
    });

    return Response.json({ success: true, data: runs });
  } catch (error: unknown) {
    console.error("Get runs API error:", error);
    const message = error instanceof Error ? error.message : "An error occurred";
    return Response.json(
      { success: false, error: `Internal error: ${message}` },
      { status: 500 }
    );
  }
}
