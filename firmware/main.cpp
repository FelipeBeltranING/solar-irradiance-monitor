#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── Pin config ────────────────────────────────────────
#define PIN_DHT   23      // DHT22 data pin  (stand-in for BME280)
#define PIN_LDR   34      // LDR analog pin  (stand-in for BH1750)
#define DHT_TYPE  DHT22

// ─── WiFi config ───────────────────────────────────────
const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// ─── MQTT config ───────────────────────────────────────
const char* MQTT_BROKER    = "broker.hivemq.com";  // public test broker
const int   MQTT_PORT      = 1883;
const char* MQTT_TOPIC     = "solar/station01/readings";
const char* MQTT_CLIENT_ID = "esp32-solar-station-01";

// ─── Publish interval ──────────────────────────────────
const unsigned long PUBLISH_INTERVAL_MS = 300000;  // 5 minutes

// ─── Objects ───────────────────────────────────────────
DHT dht(PIN_DHT, DHT_TYPE);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ─── Data structure ────────────────────────────────────
// This struct is the contract between the sensor layer and the network layer.
// When swapping to BME280 + BH1750, only readSensors() changes — nothing else.
struct SensorReading {
  float temperature;  // °C
  float humidity;     // %
  float irradiance;   // W/m²
  time_t timestamp;   // Unix timestamp (seconds since Jan 1, 1970)
  bool valid;
};

// ─── Forward declarations ──────────────────────────────
void connectWiFi();
void connectMQTT();
SensorReading readSensors();
void publishReading(const SensorReading& reading);

// ───────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n[SYS] Solar irradiance monitor — starting up");

  // Init sensors
  pinMode(PIN_LDR, INPUT);
  dht.begin();

  // Connect to WiFi then MQTT
  connectWiFi();

  // Synchronize the ESP32 clock using NTP (UTC-5: Colombia)
  configTime(-5 * 3600, 0, "pool.ntp.org");

  // Time > January 2025
  while (time(nullptr) < 1735689600) {
    delay(100);
  }

  Serial.println("[NTP] Time synchronized");

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
}

// ───────────────────────────────────────────────────────
unsigned long lastPublish = -PUBLISH_INTERVAL_MS;

void loop() {
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // Publish at fixed interval
  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;

    SensorReading reading = readSensors();
    if (reading.valid) {
      publishReading(reading);
    } else {
      Serial.println("[SENSOR] Invalid reading — skipping publish");
    }
  }
}

// ─── WiFi ──────────────────────────────────────────────
void connectWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("[WiFi] Connected. IP: ");
  Serial.println(WiFi.localIP());
}

// ─── MQTT ──────────────────────────────────────────────
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connecting to broker...");

    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println(" connected.");
    } else {
      Serial.print(" failed (rc=");
      Serial.print(mqttClient.state());
      Serial.println("). Retrying in 3s...");
      delay(3000);
    }
  }
}

// ─── Layer 1: sensor reading ───────────────────────────
// ONLY this function changes when swapping DHT22/LDR → BME280/BH1750.
// The struct fields (temperature, humidity, irradiance) stay the same.
SensorReading readSensors() {
  SensorReading reading{};

  // Store the acquisition time (Unix timestamp)
  reading.timestamp = time(nullptr);

  // DHT22 → temperature and humidity  (stand-in for BME280)
  reading.temperature = dht.readTemperature();
  reading.humidity    = dht.readHumidity();

  // Simulated irradiance using the LDR (stand-in for BH1750)
  // LDR module in Wokwi returns inverted values (more light = lower ADC reading)
  // Therefore the map is intentionally inverted: 0→1200, 4095→0
  int raw = analogRead(PIN_LDR);
  reading.irradiance = map(raw, 0, 4095, 1200, 0);

  // A reading is valid if DHT22 returned real numbers
  reading.valid = !isnan(reading.temperature) && !isnan(reading.humidity);

  return reading;
}

// ─── Layer 2: publish ──────────────────────────────────
// This function never changes — it only works with the SensorReading struct.
void publishReading(const SensorReading& reading) {

  // Build the JSON message to be sent
  StaticJsonDocument<256> doc;
  doc["temperature"] = reading.temperature;
  doc["humidity"]    = reading.humidity;
  doc["irradiance_wm2"] = reading.irradiance;
  doc["timestamp"] = reading.timestamp;

  // Convert the JSON document into a character buffer 
  char payload[256];
  serializeJson(doc, payload);

  // Publish the serialized payload to the MQTT topic
  // Returns true if the message was accepted for transmission
  bool ok = mqttClient.publish(MQTT_TOPIC, payload);

  if (ok) {
    Serial.print("[MQTT] Published → ");
    Serial.println(payload);
  } else {
    Serial.println("[MQTT] Publish failed");
  }
}
