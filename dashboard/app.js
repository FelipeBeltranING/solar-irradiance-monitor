// ── Config ────────────────────────────────────────────
const API = 'http://localhost:8080/api'

const THRESHOLDS = {
  temperature: { min: -40, max: 85,   normal: [15, 35],  warning: [35, 50]  },
  humidity:    { min: 0,   max: 100,  normal: [30, 70],  warning: [70, 90]  },
  irradiance:  { min: 0,   max: 1200, normal: [200, 800], warning: [800, 1000] }
}

// ── Panel navigation ──────────────────────────────────
function showPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('panel-' + id).classList.add('active')
  btn.classList.add('active')
}

// ── Date helpers ──────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function toUnix(dateStr, timeStr) {
  return Math.floor(new Date(`${dateStr}T${timeStr}:00`).getTime() / 1000)
}

function formatTime(isoStr) {
  return new Date(isoStr).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
}

// ── Init ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const today = todayStr()
  ;['vFromDate', 'vToDate', 'cFromDate', 'cToDate'].forEach(id => {
    document.getElementById(id).value = today
  })
  fetchLive()
  setInterval(fetchLive, 300000)
})

// ── Status helpers ────────────────────────────────────
function getStatus(key, value) {
  const t = THRESHOLDS[key]
  if (key === 'irradiance' && value < t.normal[0]) return 'low'
  if (value > t.warning[1]) return 'danger'
  if (value > t.normal[1]) return 'warning'
  if (value < t.normal[0]) return 'danger'
  return 'normal'
}

const STATUS_COLOR = {
  normal:  '#16a34a',
  warning: '#d97706',
  danger:  '#dc2626',
  low:     '#2563eb'
}

const STATUS_LABEL = {
  normal:  'Normal',
  warning: 'Alto',
  danger:  'Crítico',
  low:     'Bajo'
}

const STATUS_CLASS = {
  normal:  'badge-normal',
  warning: 'badge-warning',
  danger:  'badge-danger',
  low:     'badge-low'
}

function updateGauge(gaugeId, badgeId, key, value) {
  const t = THRESHOLDS[key]
  const pct = Math.min(100, Math.max(0, ((value - t.min) / (t.max - t.min)) * 100))
  const status = getStatus(key, value)

  const fill = document.getElementById(gaugeId)
  fill.style.width = pct + '%'
  fill.style.background = STATUS_COLOR[status]

  const badge = document.getElementById(badgeId)
  badge.textContent = STATUS_LABEL[status]
  badge.className = 'badge ' + STATUS_CLASS[status]
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

// ── Live fetch ────────────────────────────────────────
async function fetchLive() {
  const connDot   = document.getElementById('connDot')
  const connLabel = document.getElementById('connLabel')

  try {
    const res = await fetch(`${API}/readings/latest`)
    if (!res.ok) throw new Error()
    const data = await res.json()

    if (!data || data.length === 0) {
      connDot.className = 'conn-dot online'
      connLabel.textContent = 'Sin lecturas aún'
      return
    }

    const r    = data[0]
    const temp = r.temperature    ?? 0
    const hum  = r.humidity       ?? 0
    const irr  = r.irradiance_wm2 ?? 0

    document.getElementById('liveTemp').textContent = temp.toFixed(1)
    document.getElementById('liveHum').textContent  = hum.toFixed(1)
    document.getElementById('liveIrr').textContent  = irr.toFixed(0)
    document.getElementById('lastUpdate').textContent =
      'Última lectura: ' + formatTime(r.time)

    updateGauge('gaugeTemp', 'badgeTemp', 'temperature', temp)
    updateGauge('gaugeHum',  'badgeHum',  'humidity',    hum)
    updateGauge('gaugeIrr',  'badgeIrr',  'irradiance',  irr)
    updateStationBar(temp, hum, irr)

    connDot.className = 'conn-dot online'
    connLabel.textContent = 'Conectado'

  } catch {
    connDot.className = 'conn-dot offline'
    connLabel.textContent = 'Sin conexión'
  }
}

// ── Shared data store ─────────────────────────────────
let sharedData = []

async function fetchReadings(fromDate, fromTime, toDate, toTime) {
  const from = toUnix(fromDate, fromTime)
  const to   = toUnix(toDate, toTime)
  const res  = await fetch(`${API}/readings?from=${from}&to=${to}`)
  if (!res.ok) throw new Error('Error al consultar el servidor')
  return await res.json()
}

function syncFilters(source) {
  const fields = ['FromDate', 'FromTime', 'ToDate', 'ToTime']
  const other  = source === 'v' ? 'c' : 'v'
  fields.forEach(f => {
    document.getElementById(other + f).value =
      document.getElementById(source + f).value
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
    renderTable(sharedData)
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
    renderCharts(sharedData)
  } catch (e) {
    alert(e.message)
  }
}

const CHART_DEFAULTS = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 11 } },
      grid:  { color: '#f1f5f9' }
    },
    y: {
      ticks: { color: '#94a3b8', font: { size: 11 } },
      grid:  { color: '#f1f5f9' }
    }
  }
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy()
    delete chartInstances[id]
  }
}

function makeChart(id, label, data, labels, color) {
  destroyChart(id)
  const ctx = document.getElementById(id).getContext('2d')
  chartInstances[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color + '18',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: true
      }]
    },
    options: CHART_DEFAULTS
  })
}

function renderCharts(data) {
  if (!data || data.length === 0) return

  const labels = data.map(r => formatTime(r.time))
  const temps  = data.map(r => r.temperature    ?? 0)
  const hums   = data.map(r => r.humidity       ?? 0)
  const irrs   = data.map(r => r.irradiance_wm2 ?? 0)

  if (chartMode === 'split') {
    makeChart('chartTemp', 'Temperatura (°C)',    temps, labels, '#f59e0b')
    makeChart('chartHum',  'Humedad (%)',          hums,  labels, '#3b82f6')
    makeChart('chartIrr',  'Irradiancia (W/m²)',   irrs,  labels, '#10b981')
    return
  }

  destroyChart('chartAll')
  const ctx = document.getElementById('chartAll').getContext('2d')
  chartInstances['chartAll'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Temperatura (°C)',    data: temps, borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 2, tension: 0.35, pointRadius: 2, yAxisID: 'y'  },
        { label: 'Humedad (%)',          data: hums,  borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2, tension: 0.35, pointRadius: 2, yAxisID: 'y'  },
        { label: 'Irradiancia (W/m²)',   data: irrs,  borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 2, tension: 0.35, pointRadius: 2, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#64748b', boxWidth: 10, font: { size: 11 } } }
      },
      scales: {
        x:  { ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        y:  { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, position: 'left'  },
        y1: { ticks: { color: '#10b981', font: { size: 11 } }, grid: { drawOnChartArea: false }, position: 'right' }
      }
    }
  })
}