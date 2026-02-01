const fs = require('fs');
const path = require('path');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createNft, mplTokenMetadata } = require('@metaplex-foundation/mpl-token-metadata');
const { generateSigner, keypairIdentity, percentAmount } = require('@metaplex-foundation/umi');

// --- Configuration ---
const RPC_ENDPOINT = 'https://api.devnet.solana.com';
const WALLET_FILE = 'wallet.json';

async function main() {
    console.log("🌊 Connecting to Solana Devnet...");
    const umi = createUmi(RPC_ENDPOINT).use(mplTokenMetadata());

    // 1. Setup Wallet
    let keypair;
    if (fs.existsSync(WALLET_FILE)) {
        const secretKey = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
        keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
        console.log(`🔑 Loaded Wallet: ${keypair.publicKey}`);
    } else {
        console.log("⚠️  No wallet found! Creating a new one...");
        keypair = generateSigner(umi);
        fs.writeFileSync(WALLET_FILE, JSON.stringify(Array.from(keypair.secretKey)));
        console.log(`✅ Created new wallet saved to ${WALLET_FILE}`);
        console.log(`👉 PUBLIC KEY: ${keypair.publicKey}`);
        console.log("🚨 YOU MUST FUND THIS WALLET WITH SOL!");
        console.log(`   Run: solana airdrop 2 ${keypair.publicKey} --url devnet`);
        console.log("   (Or go to https://faucet.solana.com)");
        return; // Exit so user can fund
    }

    umi.use(keypairIdentity(keypair));

    // Check Balance (Roughly)
    const balance = await umi.rpc.getBalance(keypair.publicKey);
    if (balance.basisPoints < 10000000n) { // < 0.01 SOL
        console.log(`❌ Low Balance: ${Number(balance.basisPoints) / 1000000000} SOL`);
        console.log("Please airdrop some devnet SOL first.");
        return;
    }

    console.log("🎨 Minting NFT for 'spiral_art.png'...");

    // 2. Prepare Metadata
    // NOTE: In a real app, you would upload the image to IPFS/Arweave here using Irys/Bundlr.
    // For this hackathon demo, we'll use a placeholder URI or assumes it's hosted locally/somewhere.
    const uri = "https://raw.githubusercontent.com/Badbird5907/utrahacks-2026/main/NFT/spiral_art.png"; 

    const mint = generateSigner(umi);

    // 3. Mint
    console.log("🚀 Sending Transaction...");
    const { signature } = await createNft(umi, {
        mint,
        name: "Spiral Art #1",
        uri: uri,
        sellerFeeBasisPoints: percentAmount(0),
    }).sendAndConfirm(umi);

    // 4. Result
    // Deserialize signature? Umi returns connection details.
    // Usually signature is the first part of the result or we extract it.
    // createNft returns a generic result, let's just log success.
    
    console.log("\n✅ NFT MINTED SUCCESSFULLY!");
    console.log(`🆔 Mint Address: ${mint.publicKey}`);
    console.log(`🔗 Explorer: https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet`);
}

main().catch(err => {
    console.error("❌ Minting Failed:", err);
});
