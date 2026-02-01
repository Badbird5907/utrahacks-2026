"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, Trophy, Coins, Wallet, RefreshCw } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

interface LeaderboardRun {
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

interface LeaderboardData {
  runs: LeaderboardRun[];
  totalMinted: number;
  topScore: number | null;
  network: string;
  walletPublicKey: string | null;
  walletBalance: number | null;
  source: string;
}

function getRankDisplay(rank: number): { emoji: string; className: string } {
  switch (rank) {
    case 1:
      return { emoji: "🥇", className: "text-yellow-500 font-bold" };
    case 2:
      return { emoji: "🥈", className: "text-gray-400 font-bold" };
    case 3:
      return { emoji: "🥉", className: "text-amber-600 font-bold" };
    default:
      return { emoji: "", className: "text-muted-foreground" };
  }
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

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function SolLeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLeaderboard = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const response = await fetch("/api/solana/leaderboard");
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || "Failed to fetch leaderboard");
      }
    } catch (err) {
      setError("Failed to fetch leaderboard");
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading leaderboard...</div>
      </div>
    );
  }

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
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h1 className="text-xl font-semibold">Solana Leaderboard</h1>
            </div>
            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
              Devnet
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLeaderboard(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {error ? (
          <Card className="border-destructive">
            <CardContent className="py-6">
              <div className="text-center text-destructive">
                <p className="font-medium">Error loading leaderboard</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    Total NFTs Minted
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data?.totalMinted || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Top Score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {data?.topScore ?? "-"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Wallet Balance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data?.walletBalance !== null && data?.walletBalance !== undefined
                      ? `${data.walletBalance.toFixed(4)} SOL`
                      : "Not configured"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Network</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600 capitalize">
                    {data?.network || "devnet"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Wallet Info */}
            {data?.walletPublicKey && (
              <Card className="bg-muted/30">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Minting Wallet:</span>
                      <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                        {truncateAddress(data.walletPublicKey)}
                      </code>
                    </div>
                    <a
                      href={`https://explorer.solana.com/address/${data.walletPublicKey}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      View on Explorer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Leaderboard Table */}
            {!data?.runs || data.runs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <CardTitle className="mb-2">No runs minted yet</CardTitle>
                  <CardDescription>
                    Complete runs in Mission Control to mint them as NFTs on Solana.
                    <br />
                    Each completed run is automatically minted to the blockchain.
                  </CardDescription>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Rankings
                  </CardTitle>
                  <CardDescription>
                    Runs sorted by score. Each entry is an NFT on Solana Devnet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Rank</TableHead>
                        <TableHead>Run #</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>NFT Address</TableHead>
                        <TableHead className="text-right">Explorer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.runs.map((run) => {
                        const rankDisplay = getRankDisplay(run.rank);
                        return (
                          <TableRow key={run.mintAddress}>
                            <TableCell>
                              <span className={`text-lg ${rankDisplay.className}`}>
                                {rankDisplay.emoji} {run.rank}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">#{run.runNumber}</TableCell>
                            <TableCell>
                              <span
                                className={`font-bold ${
                                  run.score >= 70
                                    ? "text-green-600"
                                    : run.score >= 40
                                      ? "text-yellow-600"
                                      : "text-red-600"
                                }`}
                              >
                                {run.score}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono">{run.durationFormatted}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(run.timestamp)}
                            </TableCell>
                            <TableCell>
                              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                {truncateAddress(run.mintAddress)}
                              </code>
                            </TableCell>
                            <TableCell className="text-right">
                              <a
                                href={run.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                View
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Info about Solana */}
            <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <svg
                      viewBox="0 0 101 88"
                      className="h-8 w-8"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.310809 87.2029 0.160416 86.8659C0.0100236 86.529 -0.0359181 86.1566 0.0## 85.7945C0.0## 85.4324 0.## 85.1006 0.## 84.8343L17.## 67.4146C18.## 66.6612 19.## 66.1982 20.## 66H99.## C99.## 66 100.## 66.1074 100.## 66.3088C101.## 66.5103 101.## 66.7971 101.## 67.1341C101.## 67.471 100.## 67.8434 100.## 68.2055C100.## 68.5765 100.## 68.9094 100.## 69.## Z"
                        fill="url(#paint0_linear)"
                      />
                      <path
                        d="M83.8068 34.4146C83.4444 34.0362 83.0058 33.7345 82.5185 33.5283C82.0312 33.3221 81.5055 33.2158 80.9743 33.2161H1.93563C1.55849 33.2161 1.18957 33.3235 0.874202 33.5249C0.558829 33.7264 0.310809 34.0132 0.160416 34.3502C0.0100236 34.6871 -0.0359181 35.0595 0.0## 35.4216C0.## 35.7837 0.## 36.1155 0.## 36.3818L17.## 53.8015C18.## 54.1799 18.## 54.4816 19.## 54.6878C19.## 54.894 20.## 55.0003 20.## 55H99.## C99.## 55 100.## 54.8926 100.## 54.6912C100.## 54.4897 101.## 54.2029 101.## 53.8659C101.## 53.529 100.## 53.1566 100.## 52.7945C100.## 52.4324 100.## 52.1006 100.## 51.8343L83.## 34.4146Z"
                        fill="url(#paint1_linear)"
                      />
                      <path
                        d="M17.## 1.## C17.## 0.## 18.## 0.## 19.## 0.## C19.## 0.## 20.## 0 20.## 0H99.## C99.## 0 100.## 0.## 100.## 0.## C100.## 0.## 101.## 0.## 101.## 1.## C101.## 1.## 100.## 1.## 100.## 1.## C100.## 2.## 100.## 2.## 100.## 2.## L83.## 19.## C83.## 19.## 83.## 20.## 82.## 20.## C82.## 20.## 81.## 21 80.## 21H1.## C1.## 21 1.## 20.## 0.## 20.## C0.## 20.## 0.## 20.## 0.## 19.## C0.## 19.## 0 19.## 0.## 18.## C0.## 18.## 0.## 18.## 0.## 17.## L17.## 1.## Z"
                        fill="url(#paint2_linear)"
                      />
                      <defs>
                        <linearGradient
                          id="paint0_linear"
                          x1="91.## "
                          y1="-## "
                          x2="41.## "
                          y2="72.## "
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop stopColor="#00FFA3" />
                          <stop offset="1" stopColor="#DC1FFF" />
                        </linearGradient>
                        <linearGradient
                          id="paint1_linear"
                          x1="67.## "
                          y1="-## "
                          x2="17.## "
                          y2="## "
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop stopColor="#00FFA3" />
                          <stop offset="1" stopColor="#DC1FFF" />
                        </linearGradient>
                        <linearGradient
                          id="paint2_linear"
                          x1="79.## "
                          y1="-## "
                          x2="29.## "
                          y2="## "
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop stopColor="#00FFA3" />
                          <stop offset="1" stopColor="#DC1FFF" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                      Powered by Solana
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Each run is permanently recorded on the Solana blockchain as an NFT using the
                      Metaplex Token Metadata standard. View, verify, and share your achievements
                      on-chain.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
