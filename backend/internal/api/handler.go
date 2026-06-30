package api

import (
	"context"
	"fmt"
	"net/http"
	"time"
	"strconv"

	"github.com/gin-gonic/gin"
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
)

// Handler holds the dependencies needed by the API endpoints
type Handler struct {
	influxClient influxdb2.Client
	org          string
	bucket       string
}

// New creates and returns a new Handler
func New(influxClient influxdb2.Client, org, bucket string) *Handler {
	return &Handler{
		influxClient: influxClient,
		org:          org,
		bucket:       bucket,
	}
}

// RegisterRoutes registers all API endpoints on the given Gin router
func (h *Handler) RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		api.GET("/readings/latest", h.getLatestReading)
		api.GET("/readings", h.getReadings)
		api.GET("/health", h.health)
	}
}

// GET /api/readings/latest
// Returns the most recent reading from InfluxDB
func (h *Handler) getLatestReading(c *gin.Context) {
	query := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: -1h)
			|> filter(fn: (r) => r._measurement == "station_readings")
			|> last()
			|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
	`, h.bucket)

	result, err := h.runQuery(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GET /api/readings?from=<unix>&to=<unix>
// Returns readings within the given time range
func (h *Handler) getReadings(c *gin.Context) {
	from := c.DefaultQuery("from", fmt.Sprintf("%d", time.Now().Add(-24*time.Hour).Unix()))
	to := c.DefaultQuery("to", fmt.Sprintf("%d", time.Now().Unix()))

	// Validate that both parameters are valid Unix timestamps
	fromUnix, err := strconv.ParseInt(from, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid 'from' timestamp",
		})
		return
	}

	toUnix, err := strconv.ParseInt(to, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid 'to' timestamp",
		})
		return
	}

	// Ensure the requested time range is valid
	if fromUnix >= toUnix {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "'from' must be earlier than 'to'",
		})
		return
	}

	query := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: %s, stop: %s)
			|> filter(fn: (r) => r._measurement == "station_readings")
			|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
	`, h.bucket, from, to)

	result, err := h.runQuery(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// runQuery executes a Flux query and returns the results as a slice of maps
func (h *Handler) runQuery(ctx context.Context, query string) ([]map[string]any, error) {
	queryAPI := h.influxClient.QueryAPI(h.org)

	result, err := queryAPI.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}

	var rows []map[string]any

	for result.Next() {
		row := map[string]any{
			"time":           result.Record().Time(),
			"temperature":    result.Record().ValueByKey("temperature"),
			"humidity":       result.Record().ValueByKey("humidity"),
			"irradiance_wm2": result.Record().ValueByKey("irradiance_wm2"),
		}
		rows = append(rows, row)
	}

	if result.Err() != nil {
		return nil, fmt.Errorf("query result error: %w", result.Err())
	}

	return rows, nil
}

func (h *Handler) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}