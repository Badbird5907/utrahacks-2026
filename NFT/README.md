# Ultrasonic Spiral Art 🌀

Turn your hand movements into generative art! This project uses an Arduino Ultrasonic Sensor to create colorful spiral visualizations based on distance.

## 📂 The Files
- **`app.py`** (Recommended): A **Live Web Interface** that draws the spiral in real-time in your browser.
- **`main.py`**: Records a session and saves a static high-quality image (`spiral_art.png`).
- **`live_plot.py`**: Shows a raw real-time graph of the distance data.

## 🚀 Setup
1.  **Install Libraries**:
    ```bash
    pip install pyserial pillow numpy matplotlib flask flask-socketio eventlet
    ```
2.  **Connect Arduino**:
    - Plug in your Arduino via USB.
    - **Crucial**: Close the Arduino IDE Serial Monitor to avoid "Resource Busy" errors.

## 🎨 How to Run

### 1. Live Web Interface (Best Experience)
Watch the art generate live!
```bash
python3 app.py
```
Then open **[http://localhost:5000](http://localhost:5000)** in your browser.

### 2. Static Image Generator
Record a dataset and generate a finalized image file.
```bash
python3 main.py
```

## 🧠 How it Works
**How does a sensor make a spiral?**

1.  **The Canvas (Time)**: The script forces the drawing path into a **Spiral** that grows from the center outwards over time.
2.  **The Brush (Distance)**:
    - **Size**: Closer hand = Bigger dot.
    - **Color**: Distance determines the color (Red=Close, Blue=Far).

So, waving your hand creates a spiral timeline of colorful bubbles! 🫧

---
> **Troubleshooting**: If you get `[Errno 16] Resource busy`, it means another program (like the Arduino IDE or another script) is using the serial port. Close it and try again.
