package mqtt

import (
	"encoding/json"
	"fmt"
	"log"

	paho "github.com/eclipse/paho.mqtt.golang"
	"github.com/FelipeBeltranING/solar-irradiance-monitor/backend/internal/models"
)

// OnReadingReceived is a function called every time a new reading arrives
type OnReadingReceived func(reading models.SensorReading)

// Subscriber handles the MQTT connection and message processing
type Subscriber struct {
	client paho.Client
	topic  string
}

// New creates and returns a new MQTT Subscriber
func New(broker, clientID, topic string, onReading OnReadingReceived) (*Subscriber, error) {
	opts := paho.NewClientOptions()

	opts.AddBroker(broker)
	opts.SetClientID(clientID)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)

	opts.SetOnConnectHandler(func(_ paho.Client) {
    	log.Println("[MQTT] Connected to broker")
	})

	opts.SetConnectionLostHandler(func(_ paho.Client, err error) {
    	log.Printf("[MQTT] Connection lost: %v", err)
	})

	client := paho.NewClient(opts)

	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return nil, fmt.Errorf("failed to connect to broker: %w", token.Error())
	}

	sub := &Subscriber{client: client, topic: topic}

	if err := sub.subscribe(onReading); err != nil {
		return nil, err
	}

	return sub, nil
}

// subscribe registers the message handler for the MQTT topic
func (s *Subscriber) subscribe(onReading OnReadingReceived) error {
	handler := func(_ paho.Client, msg paho.Message) {
		var reading models.SensorReading

		if err := json.Unmarshal(msg.Payload(), &reading); err != nil {
			log.Printf("[MQTT] Failed to parse payload: %v\n", err)
			return
		}

		log.Printf("[MQTT] Reading received → temp: %.1f°C | humidity: %.1f%% | irradiance: %.1f W/m²\n",
			reading.Temperature, reading.Humidity, reading.IrradianceWm2)

		if onReading != nil {
   			onReading(reading)
		}
	}

	token := s.client.Subscribe(s.topic, 0, handler)
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("failed to subscribe to topic %s: %w", s.topic, token.Error())
	}

	log.Printf("[MQTT] Subscribed to topic: %s\n", s.topic)
	return nil
}

// Disconnect closes the MQTT connection 
func (s *Subscriber) Disconnect() {
	s.client.Disconnect(250)
	log.Println("[MQTT] Disconnected from broker")
}