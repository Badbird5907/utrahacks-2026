from flask import Flask, render_template, jsonify
import serial
import time
import threading
import os
from PIL import Image, ImageDraw
import math
import subprocess

app = Flask(__name__)

# Configuration
PORT_NAME = '/dev/cu.usbmodem2101'
BAUD_RATE = 9600
MAX_SAMPLES = 200

# Store data
latest_data = {'r': 0, 'g': 0, 'b': 0}
all_samples = []
ser = None
nft_generated = False

# ElevenLabs setup
try:
    from elevenlabs.client import ElevenLabs
    import io
    import subprocess
    ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
    elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY) if ELEVENLABS_API_KEY else None
except ImportError:
    elevenlabs_client = None

def generate_nft():
    """Generate the spiral art, announce with ElevenLabs, and mint NFT"""
    global nft_generated
    
    print("\n🎨 Generating NFT from collected samples...")
    
    # Generate spiral art
    CANVAS_SIZE = (800, 800)
    img = Image.new('RGB', CANVAS_SIZE, (10, 10, 20))
    draw = ImageDraw.Draw(img)
    
    center_x, center_y = CANVAS_SIZE[0] // 2, CANVAS_SIZE[1] // 2
    max_radius = min(CANVAS_SIZE) // 2 - 20
    
    for i, (r, g, b) in enumerate(all_samples):
        t = i / max(1, len(all_samples))
        angle = i * 0.8  # More spread out
        radius_spiral = 10 + (t * max_radius)
        
        x = center_x + math.cos(angle) * radius_spiral
        y = center_y + math.sin(angle) * radius_spiral
        
        intensity = (r + g + b) / 3
        circle_size = max(3, 15 - (intensity / 10))  # Smaller circles
        
        r_val = int(max(0, min(255, 255 - (r * 1.5))))
        g_val = int(max(0, min(255, 255 - (g * 1.5))))
        b_val = int(max(0, min(255, 255 - (b * 1.5))))
        color = (r_val, g_val, b_val)
        
        draw.ellipse(
            [x - circle_size, y - circle_size, x + circle_size, y + circle_size],
            fill=color, outline=None
        )
    
    output_filename = 'color_spiral_art.png'
    img.save(output_filename)
    print(f"✅ Saved to {output_filename}")
    
    # ElevenLabs announcement
    if elevenlabs_client:
        print("🎤 Announcing NFT generation...")
        try:
            announcement = (
                "Yooooo! Your NFT has been generated! Six, seven! Check it out! "
                "This is absolutely incredible! Your unique digital artwork has been created "
                "from the robot's color sensor data as it explored the environment. "
                "Each dot in this spiral represents a real color captured by the sensor. "
                "Six, seven, this is next level stuff! Your one-of-a-kind NFT is now being minted on the Solana blockchain. "
                "You're literally making history right now! Six, seven! Amazing work!"
            )
            audio = elevenlabs_client.text_to_speech.convert(
                voice_id="JBFqnCBsd6RMkjVDRZzb",
                text=announcement,
                model_id="eleven_multilingual_v2"
            )
            # Save and play audio
            audio_bytes = b"".join(audio)
            with open("/tmp/nft_announce.mp3", "wb") as f:
                f.write(audio_bytes)
            subprocess.run(["afplay", "/tmp/nft_announce.mp3"])
            print("✅ Announcement complete!")
        except Exception as e:
            print(f"⚠️ TTS Error: {e}")
    
    # Mint NFT
    print("\n🔮 Minting NFT on Solana...")
    try:
        subprocess.run(["node", "mint.js"], check=True)
    except Exception as e:
        print(f"⚠️ Minting skipped: {e}")
    
    nft_generated = True
    print("\n🎉 NFT COMPLETE! Check color_spiral_art.png")

def read_from_serial():
    global ser, latest_data, all_samples
    while True:
        try:
            if ser is None or not ser.is_open:
                try:
                    ser = serial.Serial(PORT_NAME, BAUD_RATE, timeout=1)
                    print(f"Connected to {PORT_NAME}")
                    time.sleep(2)
                except serial.SerialException as e:
                    print(f"Waiting for serial: {e}")
                    time.sleep(1)
                    continue

            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                if line.startswith("RGB:"):
                    try:
                        rgb_str = line.replace("RGB:", "")
                        parts = rgb_str.split(",")
                        if len(parts) == 3:
                            r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
                            latest_data = {'r': r, 'g': g, 'b': b}
                            
                            # Collect samples
                            if len(all_samples) < MAX_SAMPLES:
                                all_samples.append((r, g, b))
                                print(f"Sample {len(all_samples)}/{MAX_SAMPLES}")
                                
                                # Generate NFT when we have enough samples
                                if len(all_samples) == MAX_SAMPLES:
                                    generate_nft()
                    except ValueError:
                        pass
        except Exception as e:
            print(f"Serial Error: {e}")
            if ser:
                ser.close()
            ser = None
            time.sleep(1)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/data')
def get_data():
    return jsonify({
        **latest_data,
        'count': len(all_samples),
        'max': MAX_SAMPLES,
        'done': nft_generated
    })

@app.route('/reset')
def reset():
    global all_samples, nft_generated
    all_samples = []
    nft_generated = False
    return jsonify({'status': 'reset'})

if __name__ == '__main__':
    print("=" * 50)
    print("🎨 COLOR SENSOR NFT GENERATOR")
    print("=" * 50)
    print(f"Open http://localhost:5001 to view live drawing")
    print(f"Collecting {MAX_SAMPLES} samples then generating NFT...")
    print("=" * 50)
    
    thread = threading.Thread(target=read_from_serial, daemon=True)
    thread.start()
    
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
