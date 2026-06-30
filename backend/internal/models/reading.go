package models

// SensorReading represents a single measurement from the monitoring station.
// Field names match the JSON payload published by the ESP32 firmware.

type SensorReading struct {
	Temperature float64 `json:"temperature"`
	Humidity    float64 `json:"humidity"`
	IrradianceWm2 float64 `json:"irradiance_wm2"`
	Timestamp int64 `json:"timestamp"`
}