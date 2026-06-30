package influx

import(

	"context"
	"fmt"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"github.com/FelipeBeltranING/solar-irradiance-monitor/backend/internal/models"
)

// Client wraps the InfluxDB connection and write API
type Client struct {
	client influxdb2.Client
	writeAPI api.WriteAPIBlocking
	org string
	bucket string
}

// New creates and returns a new InfluxDB client
func New(url, token, org, bucket string) *Client {
	c := influxdb2.NewClient(url, token)
	writeAPI := c.WriteAPIBlocking(org, bucket)

	return &Client{
		client:   c,
		writeAPI: writeAPI,
		org:      org,
		bucket:   bucket,
	}
}

// RawClient exposes the underlying InfluxDB client for use by the API layer
func (c *Client) RawClient() influxdb2.Client {
	return c.client
}

// WriteReading saves a SensorReading to InfluxDB
func (c *Client) WriteReading(reading models.SensorReading) error {
	point := influxdb2.NewPointWithMeasurement("station_readings").
		AddTag("station_id", "station01").
		AddField("temperature", reading.Temperature).
		AddField("humidity", reading.Humidity).
		AddField("irradiance_wm2", reading.IrradianceWm2).
		SetTime(time.Unix(reading.Timestamp, 0))

	if err := c.writeAPI.WritePoint(context.Background(), point); err != nil {
		return fmt.Errorf("failed to write point: %w", err)
	}

	return nil
}

// Close closes the InfluxDB connection
func (c *Client) Close() {
	c.client.Close()
}