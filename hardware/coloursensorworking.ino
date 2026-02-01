// Colour Sensor
// Pin Definitions
#define S0 13
#define S1 12
#define S2 10
#define S3 11
#define sensorOut 9

// Variables to store color frequencies
int redFrequency = 0;
int greenFrequency = 0;
int blueFrequency = 0;

void setup() {
  pinMode(S0, OUTPUT);
  pinMode(S1, OUTPUT);
  pinMode(S2, OUTPUT);
  pinMode(S3, OUTPUT);
  pinMode(sensorOut, INPUT);
  
  // Frequency Scaling to 20%
  digitalWrite(S0, HIGH);
  digitalWrite(S1, LOW);
  
  Serial.begin(9600);
}

void loop() {
  // ---------------- READ RED ----------------
  digitalWrite(S2, LOW);
  digitalWrite(S3, LOW);
  redFrequency = pulseIn(sensorOut, LOW);
  
  Serial.print("R = ");
  Serial.print(redFrequency);
  Serial.print("  ");
  delay(20); // Slightly reduced delay for smoother detection
  
  // ---------------- READ GREEN ----------------
  digitalWrite(S2, HIGH);
  digitalWrite(S3, HIGH);
  greenFrequency = pulseIn(sensorOut, LOW);
  
  Serial.print("G = ");
  Serial.print(greenFrequency);
  Serial.print("  ");
  delay(20);
 
  // ---------------- READ BLUE ----------------
  digitalWrite(S2, LOW);
  digitalWrite(S3, HIGH);
  blueFrequency = pulseIn(sensorOut, LOW);
  
  Serial.print("B = ");
  Serial.print(blueFrequency);
  Serial.print("  |  "); 

  // ---------------- DETECTION LOGIC ----------------
  
  // Logic for RED (Target Signature)
  if ((redFrequency >= 60 && redFrequency <= 77) && 
      (greenFrequency >= 114 && greenFrequency <= 132) && 
      (blueFrequency >= 100 && blueFrequency <= 116)) {
    Serial.println("DETECTED: RED");
  } 
  
  // Logic for GREEN (Target Signature)
  else if ((redFrequency >= 72 && redFrequency <= 99) && 
           (greenFrequency >= 73 && greenFrequency <= 98) && 
           (blueFrequency >= 72 && blueFrequency <= 103)) {
    Serial.println("DETECTED: GREEN");
  } 
  
  // Logic for BLUE (Target Signature)
  else if ((redFrequency >= 64 && redFrequency <= 86) && 
           (greenFrequency >= 69 && greenFrequency <= 89) && 
           (blueFrequency >= 57 && blueFrequency <= 71)) {
    Serial.println("DETECTED: BLUE");
  }
  
  // Logic for BLACK (Target Signature)
  else if ((redFrequency >= 97 && redFrequency <= 121) && 
           (greenFrequency >= 121 && greenFrequency <= 150) && 
           (blueFrequency >= 105 && blueFrequency <= 133)) {
    Serial.println("DETECTED: BLACK");
  }
  
  else {
    Serial.println("NO MATCH");
  }

  delay(100); // Overall loop stability delay
}
