import serial
import numpy as np
from PIL import Image, ImageDraw
import time
import re
import math
import random
import os
from elevenlabs.client import ElevenLabs
from elevenlabs import play

# --- ElevenLabs Configuration ---
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
client = ElevenLabs(api_key=ELEVENLABS_API_KEY) if ELEVENLABS_API_KEY else None

# --- Configuration ---
PORT = '/dev/cu.usbmodem2101'
BAUD_RATE = 9600
SAMPLES = 200  # 200 samples for spiral art
CANVAS_SIZE = (800, 800)
BACKGROUND_COLOR = (10, 10, 20)  # Dark Blue/Black
# ---------------------

try:
    ser = serial.Serial(PORT, BAUD_RATE, timeout=1)
    time.sleep(3)
except serial.SerialException as e:
    print(f"Error: {e}")
    if "Resource busy" in str(e):
        print("!! CLOSE ARDUINO SERIAL MONITOR !!")
    exit(1)

data = []
print(f"Collecting {SAMPLES} RGB samples for Spiral Art... (Let the robot explore!)")

try:
    while len(data) < SAMPLES:
        if ser.in_waiting > 0:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line: continue
            
            # Parse RGB values from "RGB:r,g,b" format
            if line.startswith("RGB:"):
                try:
                    rgb_str = line.replace("RGB:", "")
                    parts = rgb_str.split(",")
                    if len(parts) == 3:
                        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
                        data.append((r, g, b))
                        print(f"Sample {len(data)}/{SAMPLES}: R={r}, G={g}, B={b}")
                except ValueError:
                    pass
except KeyboardInterrupt:
    print("\nStopping...")
finally:
    if ser.is_open: ser.close()

# --- Generate Spiral Art from Color Data ---
print("Generating masterpiece from color sensor data...")
img = Image.new('RGB', CANVAS_SIZE, BACKGROUND_COLOR)
draw = ImageDraw.Draw(img)

center_x, center_y = CANVAS_SIZE[0] // 2, CANVAS_SIZE[1] // 2
max_radius = min(CANVAS_SIZE) // 2 - 20

for i, (r, g, b) in enumerate(data):
    # Normalize progress (0 to 1)
    t = i / max(1, len(data))
    
    # Calculate spiral position
    angle = i * 0.5
    radius_spiral = 10 + (t * max_radius)
    
    x = center_x + math.cos(angle) * radius_spiral
    y = center_y + math.sin(angle) * radius_spiral
    
    # Map sensor values to visual properties
    # Lower pulse values = stronger color detection
    # Typical range is 5-50 for colors
    intensity = (r + g + b) / 3
    circle_size = max(5, 40 - (intensity / 2))
    
    # Map raw sensor values to RGB (invert since lower = brighter)
    max_val = 100  # Approximate max sensor value
    r_val = int(max(0, min(255, 255 - (r * 2.5))))
    g_val = int(max(0, min(255, 255 - (g * 2.5))))
    b_val = int(max(0, min(255, 255 - (b * 2.5))))
    color = (r_val, g_val, b_val)
    
    # Draw the blob
    draw.ellipse(
        [x - circle_size, y - circle_size, x + circle_size, y + circle_size],
        fill=color, outline=None
    )

output_filename = 'color_spiral_art.png'
img.save(output_filename)
print(f"Saved to {output_filename}")

# --- ElevenLabs TTS Announcement ---
if client:
    print("🎤 Announcing NFT generation...")
    try:
        announcement = (
            "Your NFT is generated! Check it out! "
            "This is so cool, your unique digital artwork has been created "
            "from the robot's color sensor as it explored the environment. "
            "This one-of-a-kind piece is ready to be minted on the blockchain. Amazing work!"
        )
        audio = client.text_to_speech.convert(
            voice_id="JBFqnCBsd6RMkjVDRZzb",
            text=announcement,
            model_id="eleven_multilingual_v2"
        )
        play(audio)
        print("✅ Announcement complete!")
    except Exception as e:
        print(f"⚠️ TTS Error: {e}")
else:
    print("💡 Tip: Set ELEVENLABS_API_KEY environment variable to enable voice announcements!")

# --- Trigger NFT Minting ---
import subprocess
print("\n🔮 Minting NFT on Solana...")
try:
    subprocess.run(["node", "--version"], check=True, capture_output=True)
    subprocess.run(["node", "mint.js"], check=True)
except FileNotFoundError:
    print("❌ Node.js not found. Please install Node.js to mint NFTs.")
except subprocess.CalledProcessError as e:
    print(f"❌ Minting script failed with error: {e}")
