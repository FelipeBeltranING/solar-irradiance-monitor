// ── Config ────────────────────────────────────────────
const API              = 'http://localhost:8080/api'
const POLL_INTERVAL_MS = 10000   // 10 s para pruebas — cambiar a 300000 en producción

// ── Thresholds ────────────────────────────────────────
const THRESHOLDS = {
  temperature: { min: -40,  max: 85,   dangerLow: 0,    warnLow: 15,  warnHigh: 40,  dangerHigh: 55   },
  humidity:    { min: 0,    max: 100,  dangerLow: null,  warnLow: 20,  warnHigh: 80,  dangerHigh: 90   },
  irradiance:  { min: 0,    max: 1200, dangerLow: null,  warnLow: 50,  warnHigh: 900, dangerHigh: 1100 }
}

// ── Theme ─────────────────────────────────────────────
function toggleTheme(checkbox) {
  const theme = checkbox.checked ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
  if (lastReading) redrawGauges()
}

// ── Date helpers ──────────────────────────────────────
// Use local timezone to get today in YYYY-MM-DD format
function todayStr() {
  const d   = new Date()
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toUnix(dateStr, timeStr) {
  return Math.floor(new Date(`${dateStr}T${timeStr}:00`).getTime() / 1000)
}

function formatTime(isoStr) {
  return new Date(isoStr).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Init ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Restore saved theme
  const saved = localStorage.getItem('theme') || 'dark'
  document.documentElement.setAttribute('data-theme', saved)

  const toggle = document.getElementById('themeToggle')
  if (toggle) toggle.checked = saved === 'light'

  // Set today's date on all date inputs using local time
  const today = todayStr()

  ;['vFromDate', 'vToDate', 'cFromDate', 'cToDate'].forEach(id => {
    document.getElementById(id).value = today
  })

  // Set default time range
  document.getElementById('vFromTime').value = '05:00'
  document.getElementById('vToTime').value   = '19:00'

  document.getElementById('cFromTime').value = '05:00'
  document.getElementById('cToTime').value   = '19:00'

  // Load live data and initial historical data
  fetchLive()
  
  fetchReadings(
  today,
  '05:00',
  today,
  '19:00'
)
.then(data => {
  console.log("TEST READINGS:", data)
})
.catch(err => {
  console.error("TEST ERROR:", err)
})

  // Refresh live readings periodically
  setInterval(fetchLive, POLL_INTERVAL_MS)
})

// ── Panel navigation ──────────────────────────────────
function showPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('panel-' + id).classList.add('active')
  btn.classList.add('active')
  if (id === 'live' && lastReading) {
    resetGauges()
    requestAnimationFrame(() => requestAnimationFrame(redrawGauges))
  }
}

// ── Status logic ──────────────────────────────────────
function getStatus(key, value) {
  const t = THRESHOLDS[key]
  if (t.dangerLow !== null && value < t.dangerLow) return 'danger'
  if (value < t.warnLow)    return key === 'temperature' ? 'warning' : 'low'
  if (value > t.dangerHigh) return 'danger'
  if (value > t.warnHigh)   return 'warning'
  return 'normal'
}

const STATUS_COLOR = { normal: '#16a34a', warning: '#d97706', danger: '#dc2626', low: '#2563eb' }
const STATUS_LABEL = { normal: 'Normal',  warning: 'Alto',    danger: 'Crítico', low: 'Bajo'   }
const STATUS_CLASS = {
  normal:  'badge-normal',
  warning: 'badge-warning',
  danger:  'badge-danger',
  low:     'badge-low'
}

function updateGauge(gaugeId, badgeId, key, value) {
  const t   = THRESHOLDS[key]
  const pct = Math.min(100, Math.max(0, ((value - t.min) / (t.max - t.min)) * 100))
  const s   = getStatus(key, value)

  const fill = document.getElementById(gaugeId)
  fill.style.width      = pct + '%'
  fill.style.background = STATUS_COLOR[s]

  const badge       = document.getElementById(badgeId)
  badge.textContent = STATUS_LABEL[s]
  badge.className   = 'badge ' + STATUS_CLASS[s]
}

function updateStationBar(temp, hum, irr) {
  const statuses = [
    getStatus('temperature', temp),
    getStatus('humidity', hum),
    getStatus('irradiance', irr)
  ]
  const dot = document.getElementById('stationDot')
  const msg = document.getElementById('stationMsg')

  if (statuses.includes('danger')) {
    dot.style.background = '#dc2626'
    msg.textContent = 'Condición crítica detectada — revisa los valores'
  } else if (statuses.includes('warning')) {
    dot.style.background = '#d97706'
    msg.textContent = 'Condición elevada — monitoreo recomendado'
  } else if (statuses.every(s => s === 'low')) {
    dot.style.background = '#2563eb'
    msg.textContent = 'Irradiancia baja — posiblemente nublado'
  } else {
    dot.style.background = '#16a34a'
    msg.textContent = 'Todas las condiciones dentro del rango normal'
  }
}

// ── Gauge animation helpers ───────────────────────────
let lastReading = null

function resetGauges() {
  ;['gaugeTemp', 'gaugeHum', 'gaugeIrr'].forEach(id => {
    const el = document.getElementById(id)
    el.style.transition = 'none'
    el.style.width      = '0%'
  })
}

function redrawGauges() {
  if (!lastReading) return
  ;['gaugeTemp', 'gaugeHum', 'gaugeIrr'].forEach(id => {
    document.getElementById(id).style.transition = ''
  })
  updateGauge('gaugeTemp', 'badgeTemp', 'temperature', lastReading.temp)
  updateGauge('gaugeHum',  'badgeHum',  'humidity',    lastReading.hum)
  updateGauge('gaugeIrr',  'badgeIrr',  'irradiance',  lastReading.irr)
}

// ── Live fetch ────────────────────────────────────────
async function fetchLive() {
  const connDot   = document.getElementById('connDot')
  const connLabel = document.getElementById('connLabel')
  try {
    const res = await fetch(`${API}/readings/latest`)
    if (!res.ok) throw new Error()
    const data = await res.json()

    if (!data || data.length === 0) {
      connDot.className     = 'conn-dot online'
      connLabel.textContent = 'Sin lecturas aún'
      return
    }

    const r    = data[0]
    const temp = r.temperature    ?? 0
    const hum  = r.humidity       ?? 0
    const irr  = r.irradiance_wm2 ?? 0

    lastReading = { temp, hum, irr }

    document.getElementById('liveTemp').textContent   = temp.toFixed(1)
    document.getElementById('liveHum').textContent    = hum.toFixed(1)
    document.getElementById('liveIrr').textContent    = irr.toFixed(0)
    document.getElementById('lastUpdate').textContent = 'Última lectura: ' + formatTime(r.time)

    updateGauge('gaugeTemp', 'badgeTemp', 'temperature', temp)
    updateGauge('gaugeHum',  'badgeHum',  'humidity',    hum)
    updateGauge('gaugeIrr',  'badgeIrr',  'irradiance',  irr)
    updateStationBar(temp, hum, irr)

    connDot.className     = 'conn-dot online'
    connLabel.textContent = 'Conectado'

  } catch {
    connDot.className     = 'conn-dot offline'
    connLabel.textContent = 'Sin conexión'
  }
}

// ── Shared data + filter sync ─────────────────────────
let sharedData = []

async function fetchReadings(fromDate, fromTime, toDate, toTime) {
  const res = await fetch(
    `${API}/readings?from=${toUnix(fromDate, fromTime)}&to=${toUnix(toDate, toTime)}`
  )
  if (!res.ok) throw new Error('Error al consultar el servidor')
  return await res.json()
}

// ── Initial historical data load ───────────────────────
async function loadInitialData() {
  try {
    const today = todayStr()

    sharedData = await fetchReadings(
      today,
      '05:00',
      today,
      '19:00'
    )

    // Render table and charts with the default range
    renderTable(sharedData)
    renderCharts(sharedData)

  } catch (e) {
    console.error('Error loading initial data:', e)
  }
}

function syncFilters(source) {
  const other = source === 'v' ? 'c' : 'v'
  ;['FromDate', 'FromTime', 'ToDate', 'ToTime'].forEach(f => {
    document.getElementById(other + f).value = document.getElementById(source + f).value
  })
}

// ── Values panel ──────────────────────────────────────
async function queryData() {
  syncFilters('v')

  try {
    sharedData = await fetchReadings(
      document.getElementById('vFromDate').value,
      document.getElementById('vFromTime').value,
      document.getElementById('vToDate').value,
      document.getElementById('vToTime').value
    )

    // Update table and charts using the same dataset
    renderTable(sharedData)
    renderCharts(sharedData)

  } catch (e) {
    alert(e.message)
  }
}

function renderTable(data) {
  const tbody = document.getElementById('tableBody')
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No hay datos para el rango seleccionado.</td></tr>'
    return
  }
  tbody.innerHTML = [...data].reverse().map(r => `
    <tr>
      <td>${formatTime(r.time)}</td>
      <td>${(r.temperature    ?? 0).toFixed(1)}</td>
      <td>${(r.humidity       ?? 0).toFixed(1)}</td>
      <td>${(r.irradiance_wm2 ?? 0).toFixed(0)}</td>
    </tr>
  `).join('')
}

// ── Charts panel ──────────────────────────────────────
let chartMode = 'split'
const chartInstances = {}

function setChartMode(mode) {
  chartMode = mode
  document.getElementById('chartsSplit').style.display  = mode === 'split'  ? 'grid' : 'none'
  document.getElementById('chartsMerged').style.display = mode === 'merged' ? 'block' : 'none'
  document.getElementById('btnSplit').classList.toggle('active',  mode === 'split')
  document.getElementById('btnMerged').classList.toggle('active', mode === 'merged')
  if (sharedData.length > 0) renderCharts(sharedData)
}

async function queryCharts() {
  syncFilters('c')

  try {
    sharedData = await fetchReadings(
      document.getElementById('cFromDate').value,
      document.getElementById('cFromTime').value,
      document.getElementById('cToDate').value,
      document.getElementById('cToTime').value
    )

    // Update charts and table using the same dataset
    renderCharts(sharedData)
    renderTable(sharedData)

  } catch (e) {
    alert(e.message)
  }
}

// Obtain CSS variable values for chart styling
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function baseScales(extra = {}) {
  return {
    x: {
      ticks: { color: cssVar('--chart-tick'), maxTicksLimit: 8, font: { size: 13 } },
      grid:  { color: cssVar('--chart-grid') },
      ...extra.x
    },
    y: {
      ticks: { color: cssVar('--chart-tick'), font: { size: 13 } },
      grid:  { color: cssVar('--chart-grid') },
      ...extra.y
    },
    ...extra
  }
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id] }
}

function makeChart(id, label, data, labels, color) {
  destroyChart(id)
  chartInstances[id] = new Chart(document.getElementById(id).getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label, data,
        borderColor: color, backgroundColor: color + '18',
        borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6,
        tension: 0.4, fill: true
      }]
    },
    options: {
      responsive: true,
      animation: { duration: 500, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false } },
      scales: baseScales()
    }
  })
}

function renderCharts(data) {
  if (!data || data.length === 0) return

  const labels = data.map(r => formatTime(r.time))
  const temps  = data.map(r => r.temperature    ?? 0)
  const hums   = data.map(r => r.humidity       ?? 0)
  const irrs   = data.map(r => r.irradiance_wm2 ?? 0)

  if (chartMode === 'split') {
    makeChart('chartIrr',  'Irradiancia (W/m²)',   irrs,  labels, '#10b981')
    makeChart('chartTemp', 'Temperatura (°C)',   temps, labels, '#f59e0b')
    makeChart('chartHum',  'Humedad (%)',          hums,  labels, '#3b82f6')
    return
  }

  destroyChart('chartAll')
  chartInstances['chartAll'] = new Chart(document.getElementById('chartAll').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Temperatura (°C)',   data: temps, borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.4, pointRadius: 3, yAxisID: 'y'  },
        { label: 'Humedad (%)',         data: hums,  borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.4, pointRadius: 3, yAxisID: 'y'  },
        { label: 'Irradiancia (W/m²)',  data: irrs,  borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.4, pointRadius: 3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      animation: { duration: 500, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: cssVar('--muted'), boxWidth: 12, font: { size: 16 } }
        }
      },
      scales: {
        x:  { ticks: { color: cssVar('--chart-tick'), maxTicksLimit: 8, font: { size: 14 } }, grid: { color: cssVar('--chart-grid') } },
        y:  { ticks: { color: cssVar('--chart-tick'), font: { size: 14 } }, grid: { color: cssVar('--chart-grid') }, position: 'left'  },
        y1: { ticks: { color: '#10b981', font: { size: 14 } }, grid: { drawOnChartArea: false }, position: 'right' }
      } 
    }
  })
}