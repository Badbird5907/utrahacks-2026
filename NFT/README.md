# Ultrasonic Spiral Art & NFT Minter 🌀💎

Create generative spiral art with your hand and mint it as a Solana NFT!

## 📂 The Tools
1.  **`app.py` (Live Web App)**: Interactive web interface to watch the art growing live in your browser.
2.  **`main.py` (NFT Minter)**: Records a session, saves the image, and **automatically mints it as an NFT** on Solana Devnet.
3.  **`live_plot.py`**: A raw real-time data graph.

## 🚀 Quick Setup

### 1. Install Dependencies
You need Python and Node.js.
```bash
# Python Libraries
pip install pyserial pillow numpy matplotlib flask flask-socketio eventlet

# Node.js Libraries (for NFT minting)
cd NFT  # Make sure you are in the folder
npm install
```

### 2. Connect Arduino
- Plug it in via USB.
- **Close the Arduino IDE Serial Monitor** (or the script won't work!).

---

## 🎮 How to Use

### Option A: The Live Experience (Web App)
Best for playing around and visualizing.
```bash
python3 app.py
```
👉 Open **[http://localhost:5000](http://localhost:5000)** in your browser.

### Option B: Create & Mint NFT (The Real Deal)
1.  **Run the Minter**:
    ```bash
    python3 main.py
    ```
2.  **First Run Only**:
    - It will say "No wallet found!" and create one.
    - **Copy the Public Key** it shows.
    - Go to [Solana Faucet](https://faucet.solana.com) and airdrop yourself some Devnet SOL.
3.  **Run it again**:
    - Wave your hand to create art.
    - Wait for it to save.
    - **Boom!** It mints the NFT and gives you a link to view it on the Solana Explorer.

---

## 🧠 How it Works
**The Algorithm**:
- **Time** = The Spiral Path (growing outwards).
- **Distance** = The "Ink" (Bubble Size & Color).

**The Tech**:
- Python handles the Hardware (Serial) and Image Generation.
- Node.js (Metaplex) handles the Blockchain interaction.

---
> **Troubleshooting**:
> - `Resource busy`: Close other scripts or Arduino IDE.
> - `Low Balance`: You forgot to fund your wallet! Use the faucet.
