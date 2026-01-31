import serial
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import re
import time
import collections

# --- Configuration ---
PORT = '/dev/cu.usbmodem1401'
BAUD_RATE = 9600
MAX_HISTORY = 100
# ---------------------

# Setup Serial
try:
    ser = serial.Serial(PORT, BAUD_RATE, timeout=0.1)
    time.sleep(2)
    ser.reset_input_buffer()
except Exception as e:
    print(f"Error: {e}")
    print("Ensure Arduino is connected and Serial Monitor is CLOSED.")
    exit(1)

# Setup Plot
data_buffer = collections.deque([0] * MAX_HISTORY, maxlen=MAX_HISTORY)
fig, ax = plt.subplots(figsize=(10, 6))
line, = ax.plot([], [], lw=2, color='#00ff00')

# Style
ax.set_facecolor('#000000')
fig.patch.set_facecolor('#111111')
ax.spines['bottom'].set_color('white')
ax.spines['top'].set_color('white') 
ax.spines['right'].set_color('white')
ax.spines['left'].set_color('white')
ax.tick_params(axis='x', colors='white')
ax.tick_params(axis='y', colors='white')
ax.yaxis.label.set_color('white')
ax.xaxis.label.set_color('white')
ax.title.set_color('white')

ax.set_ylim(0, 200) # Assuming 0-200cm range
ax.set_xlim(0, MAX_HISTORY)
ax.set_title("Live Ultrasonic Sensor Data")
ax.set_ylabel("Distance (cm)")
ax.set_xlabel("Time")
ax.grid(True, linestyle='--', alpha=0.3)

def update(frame):
    # Read all available data to flush buffer and get latest
    while ser.in_waiting > 0:
        try:
            line_str = ser.readline().decode('utf-8', errors='ignore').strip()
            matches = re.findall(r'\d+', line_str)
            if matches:
                dist = int(matches[-1])
                if 0 <= dist <= 500:
                    data_buffer.append(dist)
        except: pass
    
    # Update line data
    line.set_data(range(len(data_buffer)), data_buffer)
    return line,

# Start Animation
try:
    print("Starting Live Plot... Close the window to stop.")
    ani = FuncAnimation(fig, update, interval=50, blit=True, cache_frame_data=False)
    plt.show()
except KeyboardInterrupt:
    print("Stopping...")
finally:
    if ser.is_open: ser.close()
