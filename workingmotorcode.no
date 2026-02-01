const int IN1 = 4;
const int IN2 = 5;
const int IN3 = 6;
const int IN4 = 7;
const int ENB = 9;
const int ENA = 10;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENB, OUTPUT);
  
  Serial.begin(9600);
  Serial.println("Motor Debug Test");
  delay(2000);
}

void loop() {
  Serial.println("TEST A: ENA=255, IN1=HIGH, IN2=LOW");
  analogWrite(ENA, 255);
  analogWrite(ENB, 0);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  delay(4000);
  
  allOff();
  delay(2000);
  
  Serial.println("TEST B: ENB=255, IN3=HIGH, IN4=LOW");
  analogWrite(ENA, 0);
  analogWrite(ENB, 255);
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  delay(4000);
  
  allOff();
  delay(2000);
  
  Serial.println("TEST C: BOTH ON - ENA=255, ENB=255, all IN active");
  analogWrite(ENA, 255);
  analogWrite(ENB, 255);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  delay(4000);
  
  allOff();
  delay(3000);
  
  Serial.println("=== Next Round ===\n");
}

void allOff() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}