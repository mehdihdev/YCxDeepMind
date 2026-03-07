/*
 * Forge RDE - ELEGOO Smart Car V4.0 Firmware
 *
 * Serial protocol for communication with car_server.py
 * Handles: Motor control, servo, ultrasonic, IR sensors
 *
 * Commands (newline terminated):
 *   MOTOR <left> <right>  - Set motor speeds (-255 to 255)
 *   SERVO <angle>         - Set ultrasonic servo (0-180)
 *   ULTRASONIC            - Read ultrasonic distance (returns cm)
 *   IR_LINE               - Read line sensors (returns l,c,r)
 *   IR_OBSTACLE           - Read obstacle sensors (returns l,r)
 *   STATE                 - Get full state JSON
 *   STOP                  - Emergency stop
 */

#include <Servo.h>

// ============== PIN DEFINITIONS ==============
// Motor Driver (L298N)
#define ENA 5     // Left motors enable (PWM)
#define ENB 6     // Right motors enable (PWM)
#define IN1 7     // Left motors direction
#define IN2 8     // Left motors direction
#define IN3 9     // Right motors direction
#define IN4 10    // Right motors direction

// Ultrasonic Sensor (HC-SR04)
#define TRIG_PIN 12
#define ECHO_PIN 13

// Ultrasonic Servo
#define SERVO_PIN 3

// IR Line Tracking Sensors
#define IR_LINE_LEFT A0
#define IR_LINE_CENTER A1
#define IR_LINE_RIGHT A2

// IR Obstacle Sensors
#define IR_OBSTACLE_LEFT 2
#define IR_OBSTACLE_RIGHT 4

// ============== GLOBALS ==============
Servo ultrasonicServo;

int leftSpeed = 0;
int rightSpeed = 0;
int servoAngle = 90;

String inputBuffer = "";

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);

  // Motor pins
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // Ultrasonic pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // IR obstacle pins
  pinMode(IR_OBSTACLE_LEFT, INPUT);
  pinMode(IR_OBSTACLE_RIGHT, INPUT);

  // Servo
  ultrasonicServo.attach(SERVO_PIN);
  ultrasonicServo.write(90);

  // Stop motors
  stopMotors();

  Serial.println("ELEGOO Car Ready");
}

// ============== MAIN LOOP ==============
void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
    }
  }
}

// ============== COMMAND PROCESSING ==============
void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd.startsWith("MOTOR ")) {
    // MOTOR <left> <right>
    int firstSpace = cmd.indexOf(' ');
    int secondSpace = cmd.indexOf(' ', firstSpace + 1);

    if (secondSpace > firstSpace) {
      leftSpeed = cmd.substring(firstSpace + 1, secondSpace).toInt();
      rightSpeed = cmd.substring(secondSpace + 1).toInt();
      setMotors(leftSpeed, rightSpeed);
      Serial.println("OK");
    }
  }
  else if (cmd.startsWith("SERVO ")) {
    // SERVO <angle>
    servoAngle = cmd.substring(6).toInt();
    servoAngle = constrain(servoAngle, 0, 180);
    ultrasonicServo.write(servoAngle);
    Serial.println("OK");
  }
  else if (cmd == "ULTRASONIC") {
    float distance = readUltrasonic();
    Serial.println(distance);
  }
  else if (cmd == "IR_LINE") {
    int left = analogRead(IR_LINE_LEFT);
    int center = analogRead(IR_LINE_CENTER);
    int right = analogRead(IR_LINE_RIGHT);
    Serial.print(left);
    Serial.print(",");
    Serial.print(center);
    Serial.print(",");
    Serial.println(right);
  }
  else if (cmd == "IR_OBSTACLE") {
    int left = digitalRead(IR_OBSTACLE_LEFT);
    int right = digitalRead(IR_OBSTACLE_RIGHT);
    Serial.print(left);
    Serial.print(",");
    Serial.println(right);
  }
  else if (cmd == "STATE") {
    Serial.print("{\"left_speed\":");
    Serial.print(leftSpeed);
    Serial.print(",\"right_speed\":");
    Serial.print(rightSpeed);
    Serial.print(",\"servo_angle\":");
    Serial.print(servoAngle);
    Serial.print(",\"ultrasonic\":");
    Serial.print(readUltrasonic());
    Serial.println("}");
  }
  else if (cmd == "STOP") {
    stopMotors();
    Serial.println("OK");
  }
  else {
    Serial.println("OK");
  }
}

// ============== MOTOR CONTROL ==============
void setMotors(int left, int right) {
  // Left motors
  if (left > 0) {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
    analogWrite(ENA, constrain(left, 0, 255));
  } else if (left < 0) {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
    analogWrite(ENA, constrain(-left, 0, 255));
  } else {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
    analogWrite(ENA, 0);
  }

  // Right motors
  if (right > 0) {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
    analogWrite(ENB, constrain(right, 0, 255));
  } else if (right < 0) {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
    analogWrite(ENB, constrain(-right, 0, 255));
  } else {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, LOW);
    analogWrite(ENB, 0);
  }
}

void stopMotors() {
  leftSpeed = 0;
  rightSpeed = 0;
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

// ============== ULTRASONIC SENSOR ==============
float readUltrasonic() {
  // Send trigger pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Read echo
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout

  if (duration == 0) {
    return 400.0; // Max distance if no echo
  }

  // Calculate distance in cm
  float distance = duration * 0.034 / 2.0;
  return constrain(distance, 0, 400);
}
