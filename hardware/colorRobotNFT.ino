// Simple color sensor output for NFT art generation
// Just outputs RGB values via Serial - no motor control

// --- Color Sensor Pin Definitions ---
const int S0 = 13;
const int S1 = 12;
const int S2 = 10;
const int S3 = 11;
const int sensorOut = 9;

void setup() {
  pinMode(S0, OUTPUT);
  pinMode(S1, OUTPUT);
  pinMode(S2, OUTPUT);
  pinMode(S3, OUTPUT);
  pinMode(sensorOut, INPUT);
  
  // Set frequency scaling to 20%
  digitalWrite(S0, HIGH);
  digitalWrite(S1, LOW);
  
  Serial.begin(9600);
}

void loop() {
  // Read RED
  digitalWrite(S2, LOW);
  digitalWrite(S3, LOW);
  int r = pulseIn(sensorOut, LOW);
  
  // Read GREEN
  digitalWrite(S2, HIGH);
  digitalWrite(S3, HIGH);
  int g = pulseIn(sensorOut, LOW);
  
  // Read BLUE
  digitalWrite(S2, LOW);
  digitalWrite(S3, HIGH);
  int b = pulseIn(sensorOut, LOW);

  // Output RGB values for Python
  Serial.print("RGB:");
  Serial.print(r);
  Serial.print(",");
  Serial.print(g);
  Serial.print(",");
  Serial.println(b);

  delay(100);
}
