import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

/**
 * GET /api/solana/metadata/[runId]
 * 
 * Returns NFT metadata JSON for a specific run.
 * This endpoint is called by Solana/Metaplex when resolving the NFT URI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<Response> {
  try {
    const { runId } = await params;

    // Fetch the run from database
    const run = await prisma.runs.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return Response.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }

    // Calculate duration in milliseconds
    const durationMs = run.endTimestamp.getTime() - run.startTimestamp.getTime();

    // Build NFT metadata following Metaplex standard
    // https://docs.metaplex.com/programs/token-metadata/token-standard#the-non-fungible-standard
    const metadata = {
      name: `Run #${run.number}`,
      symbol: "UTRAHACKS",
      description: `UtraHacks 2026 Robotics Competition - Run #${run.number}. Score: ${run.score}/99. ${run.notes || ""}`.trim(),
      image: "https://raw.githubusercontent.com/Badbird5907/utrahacks-2026/main/NFT/spiral_art.png", // Placeholder image
      external_url: `https://utrahacks.dev/history?run=${run.number}`,
      attributes: [
        {
          trait_type: "Run Number",
          value: run.number,
        },
        {
          trait_type: "Score",
          value: run.score,
        },
        {
          trait_type: "Duration (ms)",
          value: durationMs,
        },
        {
          trait_type: "Duration",
          value: formatDuration(durationMs),
          display_type: "string",
        },
        {
          trait_type: "Timestamp",
          value: run.createdAt.toISOString(),
        },
        {
          trait_type: "Run ID",
          value: run.id,
        },
        {
          trait_type: "Code Hash",
          value: run.codeHash.slice(0, 8),
        },
        {
          trait_type: "Returned to Start",
          value: run.returnedToStart ? "Yes" : "No",
        },
        {
          trait_type: "Sections Attempted",
          value: run.sectionsAttempted.length > 0 
            ? run.sectionsAttempted.join(", ") 
            : "None",
        },
      ],
      properties: {
        category: "image",
        creators: [
          {
            address: process.env.SOLANA_WALLET_PUBLIC_KEY || "unknown",
            share: 100,
          },
        ],
      },
    };

    // Add optional attributes based on sections attempted
    if (run.sectionsAttempted.includes("target_shooting")) {
      if (run.rampType) {
        metadata.attributes.push({
          trait_type: "Ramp Type",
          value: run.rampType,
        });
      }
      if (run.ballLandingZone) {
        metadata.attributes.push({
          trait_type: "Ball Landing Zone",
          value: run.ballLandingZone,
        });
      }
    }

    if (run.sectionsAttempted.includes("obstacle_course")) {
      metadata.attributes.push({
        trait_type: "Obstacle Completed",
        value: run.obstacleCompleted ? "Yes" : "No",
      });
    }

    // Return with appropriate headers for caching
    return new Response(JSON.stringify(metadata, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable", // Cache forever (NFT metadata is immutable)
      },
    });
  } catch (error) {
    console.error("[Solana Metadata] Error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Format duration from milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
