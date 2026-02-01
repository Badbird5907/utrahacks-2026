import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNft,
  mplTokenMetadata,
  fetchAllDigitalAssetByCreator,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey,
  type Umi,
  type Keypair,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";

// --- Configuration ---
const RPC_ENDPOINT = "https://api.devnet.solana.com";

// Types for run data
export interface RunData {
  id: string;
  number: number;
  startTimestamp: Date;
  endTimestamp: Date;
  score: number;
  codeHash: string;
  notes: string;
  sectionsAttempted: string[];
  returnedToStart: boolean;
  createdAt: Date;
}

export interface MintResult {
  success: boolean;
  mintAddress?: string;
  signature?: string;
  explorerUrl?: string;
  error?: string;
}

export interface LeaderboardEntry {
  mintAddress: string;
  runNumber: number;
  score: number;
  durationMs: number;
  timestamp: string;
  explorerUrl: string;
  runId: string;
}

// Singleton UMI instance
let umiInstance: Umi | null = null;
let walletKeypair: Keypair | null = null;

/**
 * Check if Solana is configured (wallet private key is set)
 */
export function isConfigured(): boolean {
  return !!process.env.SOLANA_WALLET_PRIVATE_KEY;
}

/**
 * Get the wallet public key (for querying NFTs)
 */
export function getWalletPublicKey(): string | null {
  if (!isConfigured()) return null;
  const keypair = loadWalletKeypair();
  return keypair ? keypair.publicKey.toString() : null;
}

/**
 * Load wallet keypair from environment variable
 * Supports both base58 encoded and JSON array formats
 */
function loadWalletKeypair(): Keypair | null {
  if (walletKeypair) return walletKeypair;

  const privateKeyEnv = process.env.SOLANA_WALLET_PRIVATE_KEY;
  if (!privateKeyEnv) return null;

  try {
    const umi = getUmiWithoutIdentity();
    let secretKey: Uint8Array;

    // Try to parse as JSON array first
    if (privateKeyEnv.startsWith("[")) {
      const keyArray = JSON.parse(privateKeyEnv) as number[];
      secretKey = new Uint8Array(keyArray);
    } else {
      // Assume base58 encoded
      secretKey = base58.serialize(privateKeyEnv);
    }

    walletKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    return walletKeypair;
  } catch (error) {
    console.error("[Solana] Failed to load wallet keypair:", error);
    return null;
  }
}

/**
 * Get UMI instance without identity (for key generation)
 */
function getUmiWithoutIdentity(): Umi {
  return createUmi(RPC_ENDPOINT).use(mplTokenMetadata());
}

/**
 * Get configured UMI instance with wallet identity
 */
function getUmi(): Umi | null {
  if (umiInstance) return umiInstance;

  const keypair = loadWalletKeypair();
  if (!keypair) {
    console.error("[Solana] No wallet configured");
    return null;
  }

  umiInstance = createUmi(RPC_ENDPOINT)
    .use(mplTokenMetadata())
    .use(keypairIdentity(keypair));

  return umiInstance;
}

/**
 * Generate a new wallet and return the keys
 * Useful for initial setup
 */
export function generateNewWallet(): {
  publicKey: string;
  privateKeyBase58: string;
  privateKeyArray: number[];
} {
  const umi = getUmiWithoutIdentity();
  const keypair = generateSigner(umi);

  return {
    publicKey: keypair.publicKey.toString(),
    privateKeyBase58: base58.deserialize(keypair.secretKey)[0],
    privateKeyArray: Array.from(keypair.secretKey),
  };
}

/**
 * Check wallet balance
 */
export async function getWalletBalance(): Promise<number | null> {
  const umi = getUmi();
  if (!umi) return null;

  try {
    const balance = await umi.rpc.getBalance(umi.identity.publicKey);
    // Convert lamports to SOL
    return Number(balance.basisPoints) / 1_000_000_000;
  } catch (error) {
    console.error("[Solana] Failed to get balance:", error);
    return null;
  }
}

/**
 * Mint a run as an NFT
 */
export async function mintRunNFT(
  run: RunData,
  metadataUri: string
): Promise<MintResult> {
  const umi = getUmi();
  if (!umi) {
    return { success: false, error: "Solana wallet not configured" };
  }

  try {
    // Check balance first
    const balance = await umi.rpc.getBalance(umi.identity.publicKey);
    if (balance.basisPoints < BigInt(10_000_000)) {
      // < 0.01 SOL
      return {
        success: false,
        error: `Insufficient balance: ${Number(balance.basisPoints) / 1_000_000_000} SOL. Need at least 0.01 SOL.`,
      };
    }

    // Generate a new mint account
    const mint = generateSigner(umi);

    // Create the NFT
    console.log(`[Solana] Minting NFT for Run #${run.number}...`);

    const result = await createNft(umi, {
      mint,
      name: `Run #${run.number}`,
      symbol: "UTRAHACKS",
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0),
    }).sendAndConfirm(umi);

    const mintAddress = mint.publicKey.toString();
    const explorerUrl = `https://explorer.solana.com/address/${mintAddress}?cluster=devnet`;

    console.log(`[Solana] NFT minted successfully: ${mintAddress}`);

    return {
      success: true,
      mintAddress,
      signature: base58.deserialize(result.signature)[0],
      explorerUrl,
    };
  } catch (error) {
    console.error("[Solana] Minting failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown minting error",
    };
  }
}

/**
 * Fetch all run NFTs minted by our wallet
 * Returns leaderboard entries sorted by score (highest first)
 */
export async function fetchRunNFTs(): Promise<LeaderboardEntry[]> {
  const umi = getUmi();
  if (!umi) {
    console.error("[Solana] Wallet not configured for fetching NFTs");
    return [];
  }

  try {
    // Fetch all digital assets created by our wallet
    const assets = await fetchAllDigitalAssetByCreator(
      umi,
      umi.identity.publicKey
    );

    const entries: LeaderboardEntry[] = [];

    for (const asset of assets) {
      // Only process our UTRAHACKS NFTs
      if (asset.metadata.symbol !== "UTRAHACKS") continue;

      try {
        // Fetch the metadata JSON from the URI
        const metadataResponse = await fetch(asset.metadata.uri);
        if (!metadataResponse.ok) continue;

        const metadata = await metadataResponse.json();

        // Extract attributes
        const attributes = metadata.attributes || [];
        const getAttr = (name: string) =>
          attributes.find(
            (a: { trait_type: string; value: unknown }) => a.trait_type === name
          )?.value;

        const entry: LeaderboardEntry = {
          mintAddress: asset.publicKey.toString(),
          runNumber: getAttr("Run Number") || 0,
          score: getAttr("Score") || 0,
          durationMs: getAttr("Duration (ms)") || 0,
          timestamp: getAttr("Timestamp") || "",
          runId: getAttr("Run ID") || "",
          explorerUrl: `https://explorer.solana.com/address/${asset.publicKey.toString()}?cluster=devnet`,
        };

        entries.push(entry);
      } catch (err) {
        // Skip assets with invalid metadata
        console.warn(
          `[Solana] Failed to parse metadata for ${asset.publicKey}:`,
          err
        );
      }
    }

    // Sort by score (highest first)
    entries.sort((a, b) => b.score - a.score);

    return entries;
  } catch (error) {
    console.error("[Solana] Failed to fetch NFTs:", error);
    return [];
  }
}
