import { prisma } from "@/lib/prisma";
import { fetchRunNFTs, isConfigured, getWalletPublicKey, getWalletBalance } from "@/lib/solana";

export interface LeaderboardRun {
  rank: number;
  runNumber: number;
  score: number;
  durationMs: number;
  durationFormatted: string;
  timestamp: string;
  mintAddress: string;
  explorerUrl: string;
  runId: string;
}

/**
 * GET /api/solana/leaderboard
 * 
 * Fetches all runs that have been minted as NFTs on Solana.
 * Returns them sorted by score (highest first) with rank.
 * 
 * Query params:
 * - source: "blockchain" | "database" (default: "database")
 *   - "blockchain": Fetch directly from Solana (slower, but verifies on-chain data)
 *   - "database": Fetch from MongoDB where solanaMintAddress is set (faster)
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || "database";

    let runs: LeaderboardRun[] = [];

    if (source === "blockchain") {
      // Fetch from blockchain - slower but verifies on-chain
      if (!isConfigured()) {
        return Response.json(
          { success: false, error: "Solana wallet not configured" },
          { status: 503 }
        );
      }

      const nfts = await fetchRunNFTs();
      
      runs = nfts.map((nft, index) => ({
        rank: index + 1,
        runNumber: nft.runNumber,
        score: nft.score,
        durationMs: nft.durationMs,
        durationFormatted: formatDuration(nft.durationMs),
        timestamp: nft.timestamp,
        mintAddress: nft.mintAddress,
        explorerUrl: nft.explorerUrl,
        runId: nft.runId,
      }));
    } else {
      // Fetch from database - faster
      const dbRuns = await prisma.runs.findMany({
        where: {
          solanaMintAddress: { not: null },
        },
        orderBy: { score: "desc" },
      });

      runs = dbRuns.map((run, index) => {
        const durationMs = run.endTimestamp.getTime() - run.startTimestamp.getTime();
        return {
          rank: index + 1,
          runNumber: run.number,
          score: run.score,
          durationMs,
          durationFormatted: formatDuration(durationMs),
          timestamp: run.createdAt.toISOString(),
          mintAddress: run.solanaMintAddress!,
          explorerUrl: `https://explorer.solana.com/address/${run.solanaMintAddress}?cluster=devnet`,
          runId: run.id,
        };
      });
    }

    // Get wallet info for display
    const walletPublicKey = getWalletPublicKey();
    const walletBalance = isConfigured() ? await getWalletBalance() : null;

    return Response.json({
      success: true,
      data: {
        runs,
        totalMinted: runs.length,
        topScore: runs.length > 0 ? runs[0].score : null,
        network: "devnet",
        walletPublicKey,
        walletBalance,
        source,
      },
    });
  } catch (error) {
    console.error("[Solana Leaderboard] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, error: `Internal error: ${message}` },
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
