/*
 * Forge RDE - ELEGOO Smart Robot Car V4.0 Firmware
 *
 * This sketch keeps the Forge RDE serial protocol, but the wiring and control
 * layout follow the official ELEGOO Smart Robot Car V4.0 TB6612 tutorial code.
 *
 * Supported newline-terminated commands:
 *   MOTOR <left> <right>   Set left/right side speeds (-255..255)
 *   DRIVE <fwd> <turn>     Arcade drive command (-255..255 each)
 *   SERVO <angle>          Set ultrasonic pan servo (0..180)
 *   ULTRASONIC             Read ultrasonic distance in cm
 *   IR_LINE                Read line sensors (left,center,right)
 *   IR_OBSTACLE            Compatibility shim, returns 0,0 on default V4
 *   VOLTAGE                Read battery estimate in volts
 *   STATE                  Emit a JSON state snapshot
 *   STOP                   Stop all motion
 *   PING                   Health check
 */

#include <Servo.h>

// Official ELEGOO V4 TB6612 wiring
#define PIN_MOTOR_PWMA 5
#define PIN_MOTOR_PWMB 6
#define PIN_MOTOR_AIN1 7   // Right side direction
#define PIN_MOTOR_BIN1 8   // Left side direction
#define PIN_MOTOR_STBY 3

#define PIN_ULTRASONIC_TRIG 13
#define PIN_ULTRASONIC_ECHO 12
#define PIN_SERVO_PAN 10

#define PIN_LINE_LEFT A2
#define PIN_LINE_CENTER A1
#define PIN_LINE_RIGHT A0
#define PIN_VOLTAGE A3

Servo ultrasonicServo;

String inputBuffer = "";
int leftSpeed = 0;
int rightSpeed = 0;
int servoAngle = 90;

void setup() {
  Serial.begin(115200);

  pinMode(PIN_MOTOR_PWMA, OUTPUT);
  pinMode(PIN_MOTOR_PWMB, OUTPUT);
  pinMode(PIN_MOTOR_AIN1, OUTPUT);
  pinMode(PIN_MOTOR_BIN1, OUTPUT);
  pinMode(PIN_MOTOR_STBY, OUTPUT);

  pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
  pinMode(PIN_ULTRASONIC_ECHO, INPUT);
  pinMode(PIN_LINE_LEFT, INPUT);
  pinMode(PIN_LINE_CENTER, INPUT);
  pinMode(PIN_LINE_RIGHT, INPUT);
  pinMode(PIN_VOLTAGE, INPUT);

  ultrasonicServo.attach(PIN_SERVO_PAN);
  ultrasonicServo.write(servoAngle);

  stopMotors();

  Serial.println("FORGE_ELEGOO_V4_READY");
}

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

void processCommand(String cmd) {
  cmd.trim();

  if (cmd.startsWith("MOTOR ")) {
    int firstSpace = cmd.indexOf(' ');
    int secondSpace = cmd.indexOf(' ', firstSpace + 1);
    if (secondSpace > firstSpace) {
      int left = cmd.substring(firstSpace + 1, secondSpace).toInt();
      int right = cmd.substring(secondSpace + 1).toInt();
      setMotors(left, right);
      Serial.println("OK");
      return;
    }
  }

  if (cmd.startsWith("DRIVE ")) {
    int firstSpace = cmd.indexOf(' ');
    int secondSpace = cmd.indexOf(' ', firstSpace + 1);
    if (secondSpace > firstSpace) {
      int forward = cmd.substring(firstSpace + 1, secondSpace).toInt();
      int turn = cmd.substring(secondSpace + 1).toInt();
      setMotors(forward + turn, forward - turn);
      Serial.println("OK");
      return;
    }
  }

  if (cmd.startsWith("SERVO ")) {
    servoAngle = constrain(cmd.substring(6).toInt(), 0, 180);
    ultrasonicServo.write(servoAngle);
    Serial.println("OK");
    return;
  }

  if (cmd == "ULTRASONIC") {
    Serial.println(readUltrasonicCm(), 1);
    return;
  }

  if (cmd == "IR_LINE") {
    Serial.print(analogRead(PIN_LINE_LEFT));
    Serial.print(",");
    Serial.print(analogRead(PIN_LINE_CENTER));
    Serial.print(",");
    Serial.println(analogRead(PIN_LINE_RIGHT));
    return;
  }

  if (cmd == "IR_OBSTACLE") {
    Serial.println("0,0");
    return;
  }

  if (cmd == "VOLTAGE") {
    Serial.println(readBatteryVoltage(), 2);
    return;
  }

  if (cmd == "STATE") {
    Serial.print("{\"left_speed\":");
    Serial.print(leftSpeed);
    Serial.print(",\"right_speed\":");
    Serial.print(rightSpeed);
    Serial.print(",\"servo_angle\":");
    Serial.print(servoAngle);
    Serial.print(",\"ultrasonic\":");
    Serial.print(readUltrasonicCm(), 1);
    Serial.print(",\"line\":[");
    Serial.print(analogRead(PIN_LINE_LEFT));
    Serial.print(",");
    Serial.print(analogRead(PIN_LINE_CENTER));
    Serial.print(",");
    Serial.print(analogRead(PIN_LINE_RIGHT));
    Serial.print("],\"voltage\":");
    Serial.print(readBatteryVoltage(), 2);
    Serial.println("}");
    return;
  }

  if (cmd == "STOP") {
    stopMotors();
    Serial.println("OK");
    return;
  }

  if (cmd == "PING") {
    Serial.println("PONG");
    return;
  }

  Serial.println("ERR");
}

void writeMotorChannel(uint8_t pwmPin, uint8_t dirPin, int speed) {
  int pwm = constrain(abs(speed), 0, 255);
  digitalWrite(dirPin, speed >= 0 ? HIGH : LOW);
  analogWrite(pwmPin, pwm);
}

void setMotors(int left, int right) {
  leftSpeed = constrain(left, -255, 255);
  rightSpeed = constrain(right, -255, 255);

  if (leftSpeed == 0 && rightSpeed == 0) {
    stopMotors();
    return;
  }

  digitalWrite(PIN_MOTOR_STBY, HIGH);

  // ELEGOO V4 TB6612 mapping:
  //   A channel -> right side, B channel -> left side
  writeMotorChannel(PIN_MOTOR_PWMB, PIN_MOTOR_BIN1, leftSpeed);
  writeMotorChannel(PIN_MOTOR_PWMA, PIN_MOTOR_AIN1, rightSpeed);
}

void stopMotors() {
  leftSpeed = 0;
  rightSpeed = 0;
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  digitalWrite(PIN_MOTOR_STBY, LOW);
}

float readUltrasonicCm() {
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

  long duration = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 30000);
  if (duration == 0) {
    return 150.0;
  }

  float distance = duration / 58.0;
  return constrain(distance, 0.0, 150.0);
}

float readBatteryVoltage() {
  float voltage = analogRead(PIN_VOLTAGE) * 0.0375;
  return voltage + (voltage * 0.08);
}
