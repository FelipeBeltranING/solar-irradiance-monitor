package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/FelipeBeltranING/solar-irradiance-monitor/backend/internal/api"
	"github.com/FelipeBeltranING/solar-irradiance-monitor/backend/internal/influx"
	"github.com/FelipeBeltranING/solar-irradiance-monitor/backend/internal/models"
	"github.com/FelipeBeltranING/solar-irradiance-monitor/backend/internal/mqtt"
)

// ─── Configuration ──────────────────────────────────────
const (
	MQTTBroker   = "tcp://broker.hivemq.com:1883"
	MQTTClientID = "go-backend-solar-station"
	MQTTTopic    = "solar/station01/readings"

	InfluxURL    = "http://localhost:8086"
	InfluxOrg    = "solar-project"
	InfluxBucket = "readings"

	ServerPort = ":8080"
)

func main() {
	// ─── Sensitive config from environment variables ────
	influxToken := os.Getenv("INFLUX_TOKEN")
	if influxToken == "" {
		log.Fatal("[SYS] INFLUX_TOKEN environment variable is not set")
	}

	// ─── InfluxDB client ────────────────────────────────
	influxClient := influx.New(InfluxURL, influxToken, InfluxOrg, InfluxBucket)
	defer influxClient.Close()

	// ─── MQTT subscriber ────────────────────────────────
	// Store every reading received from MQTT into InfluxDB
	subscriber, err := mqtt.New(MQTTBroker, MQTTClientID, MQTTTopic, func(reading models.SensorReading) {
		if err := influxClient.WriteReading(reading); err != nil {
			log.Printf("[INFLUX] Failed to write reading: %v", err)
		}
	})
	if err != nil {
		log.Fatalf("[MQTT] Failed to start subscriber: %v", err)
	}
	defer subscriber.Disconnect()

	// ─── REST API (Gin) ─────────────────────────────────
	router := gin.Default()

	//router.Static("/", "../dashboard")

	apiHandler := api.New(influxClient.RawClient(), InfluxOrg, InfluxBucket)
	apiHandler.RegisterRoutes(router)

	log.Printf("[SYS] Server running on %s", ServerPort)
	log.Printf("[SYS] Dashboard available at http://localhost%s", ServerPort)

	if err := router.Run(ServerPort); err != nil {
		log.Fatalf("[SYS] Server failed: %v", err)
	}
}
