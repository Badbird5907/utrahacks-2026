import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import serial
import time
import re
import threading

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='eventlet')

# Configuration
PORT_NAME = '/dev/cu.usbmodem1401'
BAUD_RATE = 9600

# Global serial object
ser = None

def read_from_serial():
    global ser
    while True:
        try:
            if ser is None or not ser.is_open:
                try:
                    ser = serial.Serial(PORT_NAME, BAUD_RATE, timeout=1)
                    print(f"Connected to {PORT_NAME}")
                    time.sleep(2) # Wait for reboot
                except serial.SerialException:
                    time.sleep(1)
                    continue

            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                matches = re.findall(r'\d+', line)
                if matches:
                    try:
                        dist = int(matches[-1])
                        if 0 <= dist <= 500:
                            socketio.emit('sensor_data', {'distance': dist})
                            time.sleep(0.01) # Slight throttle
                    except ValueError: pass
        except Exception as e:
            print(f"Serial Error: {e}")
            if ser: ser.close()
            time.sleep(1)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    # Start background thread
    print("Starting Serial Background Thread...")
    eventlet.spawn(read_from_serial)
    
    print("Starting Web Server at http://0.0.0.0:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
