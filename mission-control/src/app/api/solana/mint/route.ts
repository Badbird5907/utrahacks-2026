import { prisma } from "@/lib/prisma";
import { mintRunNFT, isConfigured, type RunData } from "@/lib/solana";
import { z } from "zod";
import { headers } from "next/headers";

const MintRequestSchema = z.object({
  runId: z.string(),
});

/**
 * POST /api/solana/mint
 * 
 * Mints a run as an NFT on Solana Devnet.
 * Updates the run record with the mint address on success.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    // Check if Solana is configured
    if (!isConfigured()) {
      return Response.json(
        { success: false, error: "Solana wallet not configured. Set SOLANA_WALLET_PRIVATE_KEY in .env" },
        { status: 503 }
      );
    }

    const body = await req.json();

    // Validate request
    const parsed = MintRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request: runId is required" },
        { status: 400 }
      );
    }

    const { runId } = parsed.data;

    // Fetch the run from database
    const run = await prisma.runs.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return Response.json(
        { success: false, error: "Run not found" },
        { status: 404 }
      );
    }

    // Check if already minted
    if (run.solanaMintAddress) {
      return Response.json({
        success: true,
        alreadyMinted: true,
        mintAddress: run.solanaMintAddress,
        explorerUrl: `https://explorer.solana.com/address/${run.solanaMintAddress}?cluster=devnet`,
      });
    }

    // Build the metadata URI - use the API route
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:4667";
    const protocol = headersList.get("x-forwarded-proto") || "http";
    const metadataUri = `${protocol}://${host}/api/solana/metadata/${runId}`;

    // Prepare run data for minting
    const runData: RunData = {
      id: run.id,
      number: run.number,
      startTimestamp: run.startTimestamp,
      endTimestamp: run.endTimestamp,
      score: run.score,
      codeHash: run.codeHash,
      notes: run.notes,
      sectionsAttempted: run.sectionsAttempted,
      returnedToStart: run.returnedToStart,
      createdAt: run.createdAt,
    };

    // Mint the NFT
    console.log(`[Solana Mint] Minting NFT for run ${runId}...`);
    const result = await mintRunNFT(runData, metadataUri);

    if (!result.success) {
      console.error(`[Solana Mint] Failed to mint run ${runId}:`, result.error);
      return Response.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // Update the run record with the mint address
    await prisma.runs.update({
      where: { id: runId },
      data: { solanaMintAddress: result.mintAddress },
    });

    console.log(`[Solana Mint] Successfully minted run ${runId}: ${result.mintAddress}`);

    return Response.json({
      success: true,
      mintAddress: result.mintAddress,
      signature: result.signature,
      explorerUrl: result.explorerUrl,
    });
  } catch (error) {
    console.error("[Solana Mint] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, error: `Internal error: ${message}` },
      { status: 500 }
    );
  }
}
