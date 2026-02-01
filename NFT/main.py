import serial
import numpy as np
from PIL import Image, ImageDraw
import time
import re
import math
import random

# --- Configuration ---
PORT = '/dev/cu.usbmodem1401'
BAUD_RATE = 9600
SAMPLES = 200  # 200 samples is enough for a nice spiral
CANVAS_SIZE = (800, 800)
BACKGROUND_COLOR = (10, 10, 20) # Dark Blue/Black
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
print(f"Collecting {SAMPLES} samples for Spiral Art... (Wave your hand!)")

try:
    while len(data) < SAMPLES:
        if ser.in_waiting > 0:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line: continue
            
            matches = re.findall(r'\d+', line)
            if matches:
                try:
                    dist = int(matches[-1])
                    if 0 <= dist <= 500: # Reasonable range
                        data.append(dist)
                        print(f"Sample {len(data)}/{SAMPLES}: {dist} cm")
                except ValueError: pass
except KeyboardInterrupt:
    print("\nStopping...")
finally:
    if ser.is_open: ser.close()

# --- Generate Spiral Art ---
print("Generating masterpiece...")
img = Image.new('RGB', CANVAS_SIZE, BACKGROUND_COLOR)
draw = ImageDraw.Draw(img)

center_x, center_y = CANVAS_SIZE[0] // 2, CANVAS_SIZE[1] // 2
max_radius = min(CANVAS_SIZE) // 2 - 20

for i, dist in enumerate(data):
    # Normalize progress (0 to 1)
    t = i / max(1, len(data))
    
    # Calculate spiral position
    # Angle increases with index
    angle = i * 0.5  # Adjust spacing
    
    # Radius increases with index (spiral out)
    radius_spiral = 10 + (t * max_radius)
    
    x = center_x + math.cos(angle) * radius_spiral
    y = center_y + math.sin(angle) * radius_spiral
    
    # Map sensor distance to visual properties
    # Size: Closer objects = Bigger circles
    # dist is typically 0-200cm
    circle_size = max(5, 50 - (dist / 5)) 
    
    # Color: Map distance to Hue (HSV -> RGB)
    # Simple RGB interpolation for now
    # Close (0cm) = Hot Pink, Far (200cm) = Cyan
    r_val = int(max(0, 255 - dist))
    g_val = int(min(255, dist * 2))
    b_val = 200
    color = (r_val, g_val, b_val)
    
    # Draw the blob
    draw.ellipse(
        [x - circle_size, y - circle_size, x + circle_size, y + circle_size],
        fill=color, outline=None
    )

output_filename = 'spiral_art.png'
img.save(output_filename)
# img.show() # Optional: Don't block the script with the image viewer
print(f"Saved to {output_filename}")

# --- Trigger NFT Minting ---
import subprocess
print("\n🔮 Minting NFT on Solana...")
try:
    # Check if node is installed
    subprocess.run(["node", "--version"], check=True, capture_output=True)
    # Run mint script
    subprocess.run(["node", "mint.js"], check=True)
except FileNotFoundError:
    print("❌ Node.js not found. Please install Node.js to mint NFTs.")
except subprocess.CalledProcessError as e:
    print(f"❌ Minting script failed with error: {e}")