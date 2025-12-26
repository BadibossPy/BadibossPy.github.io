// Lyon Flood Lab — static demo app (no build tools required)
// Data is synthetic for demonstration purposes.

const lyonCenter = [45.764043, 4.835659];
let map;
let floodLayer;
let buildingsLayer;
let contoursLayer;
let measureLayer;
let damageChart;
let animationHandle = null;
let sseSource = null;
let drawControl = null;

const backendBase = localStorage.getItem('lyonBackend') || 'http://localhost:3000';
const pythonServiceBase = localStorage.getItem('pythonService') || 'http://localhost:5000';
const apiKeyParam = new URLSearchParams(location.search).get('apiKey');

// Synthetic assets: very simplified flood polygon approximations by level
// In a real app, replace with tiled depth rasters or vector depths from models
function generateFloodGeoJSON(levelCm, mitigation) {
  // Base polygon roughly following Saône and Rhône corridor
  const baseWidth = 0.005 + levelCm / 100000; // widen with level
  const attenuation = 1 - computeMitigationAttenuation(mitigation); // reduce with mitigation
  const width = baseWidth * attenuation;

  const coords = [
    [4.805, 45.800],
    [4.810, 45.790],
    [4.820, 45.780],
    [4.830, 45.772],
    [4.840, 45.765],
    [4.850, 45.758],
    [4.860, 45.750],
    [4.870, 45.742]
  ];

  const leftBank = coords.map(([lng, lat]) => [lng - width, lat + width]);
  const rightBank = coords.map(([lng, lat]) => [lng + width, lat - width]).reverse();

  const polygon = [leftBank.concat(rightBank)];
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { levelCm },
        geometry: { type: 'Polygon', coordinates: polygon }
      }
    ]
  };
}

// Deterministic PRNG (Mulberry32) for reproducible synthetic dataset
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

const seed = Number(new URLSearchParams(location.search).get('seed')) || 1337;
const rand = mulberry32(seed);

// Synthetic building centroids and baseline values (seeded)
const buildings = Array.from({ length: 400 }).map((_, i) => {
  const latJitter = (rand() - 0.5) * 0.05;
  const lngJitter = (rand() - 0.5) * 0.08;
  return {
    id: i + 1,
    lat: lyonCenter[0] + latJitter,
    lng: lyonCenter[1] + lngJitter,
    replacementCost: 100000 + rand() * 900000, // €
    isCritical: rand() < 0.06
  };
});

function computeMitigationAttenuation(m) {
  // very simplified: each measure reduces peak by a fixed fraction
  let atten = 0;
  if (m.greenRoofs) atten += 0.08;
  if (m.permeable) atten += 0.10;
  if (m.barriers) atten += 0.12;
  return Math.min(0.35, atten);
}

function depthAtPoint(point, levelCm, mitigation) {
  // Crude distance-to-centerline decay producing a pseudo depth field
  const centerline = [
    [4.835, 45.795],
    [4.835, 45.780],
    [4.835, 45.765],
    [4.835, 45.750]
  ];
  const attenuation = 1 - computeMitigationAttenuation(mitigation);
  const L = levelCm * attenuation;
  let minDist = Infinity;
  for (let i = 0; i < centerline.length; i++) {
    const [lng, lat] = centerline[i];
    const d = Math.hypot(point[0] - lat, point[1] - lng);
    if (d < minDist) minDist = d;
  }
  const depth = Math.max(0, (L / 100) - minDist * 200); // cm → m-ish scale
  return depth; // meters (synthetic)
}

function depthDamageRatio(depthMeters) {
  // Depth-damage curve (synthetic). 0 m → 0, 2 m → ~0.6, 4 m → ~0.9
  const d = Math.max(0, depthMeters);
  const ratio = 1 - Math.exp(-d * 0.8);
  return Math.min(0.95, ratio);
}

function formatEuro(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView(lyonCenter, 12.6);

  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  });
  tiles.addTo(map);

  floodLayer = L.geoJSON(null, {
    style: () => ({ color: '#58a6ff', weight: 2, fillColor: '#58a6ff', fillOpacity: 0.25 })
  }).addTo(map);

  buildingsLayer = L.layerGroup().addTo(map);
  contoursLayer = L.layerGroup().addTo(map);
  measureLayer = L.layerGroup();

  const drawItems = new L.FeatureGroup();
  map.addLayer(drawItems);
  drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      polyline: { shapeOptions: { color: '#f2cc60', weight: 3 } },
      polygon: false,
      circle: false,
      rectangle: false,
      marker: false,
      circlemarker: false
    },
    edit: { featureGroup: drawItems, remove: true }
  });
}

function renderBuildings(levelCm, mitigation) {
  buildingsLayer.clearLayers();
  let affectedCount = 0;
  let criticalCount = 0;
  let totalDamage = 0;

  for (const b of buildings) {
    const depth = depthAtPoint([b.lat, b.lng], levelCm, mitigation);
    const affected = depth > 0.05;
    const ratio = affected ? depthDamageRatio(depth) : 0;
    const damage = b.replacementCost * ratio;
    totalDamage += damage;
    if (affected) affectedCount += 1;
    if (affected && b.isCritical) criticalCount += 1;

    const color = !affected ? '#7ee787' : b.isCritical ? '#ff7b72' : '#f2cc60';
    const radius = Math.max(3, Math.min(10, depth * 3 + 3));
    const marker = L.circleMarker([b.lat, b.lng], {
      radius,
      color: '#000',
      weight: 1,
      fillColor: color,
      fillOpacity: 0.9
    });
    marker.bindTooltip(`ID #${b.id}<br/>Depth: ${depth.toFixed(2)} m<br/>Damage: ${formatEuro(damage)}`, { sticky: true });
    marker.on('click', () => showImageModal(b.lat, b.lng, depth, damage, b.isCritical));
    buildingsLayer.addLayer(marker);
  }

  // KPI updates
  document.getElementById('kpiTotalDamage').textContent = formatEuro(totalDamage);
  document.getElementById('kpiBuildings').textContent = affectedCount.toString();
  document.getElementById('kpiCritical').textContent = criticalCount.toString();

  // ROI block (toy numbers)
  updateRoiBackend();

  return totalDamage;
}

function setRoi(key, cost, avoided) {
  document.getElementById(`roiCost${key}`).textContent = formatEuro(cost);
  document.getElementById(`roiAvoid${key}`).textContent = formatEuro(avoided);
  const bc = cost > 0 ? (avoided / cost).toFixed(2) : '0.0';
  document.getElementById(`roiBC${key}`).textContent = bc;
}

async function updateRoiBackend() {
  try {
    const m = getMitigationState();
    const url = new URL(`${backendBase}/api/roi-ead`);
    url.searchParams.set('gr', m.greenRoofs ? '1' : '0');
    url.searchParams.set('pp', m.permeable ? '1' : '0');
    url.searchParams.set('tb', m.barriers ? '1' : '0');
    url.searchParams.set('horizon', '30');
    url.searchParams.set('rate', '0.03');
    if (apiKeyParam) url.searchParams.set('apiKey', apiKeyParam);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error('roi-ead failed');
    const data = await res.json();
    const costGreen = 2_000_000;
    const costPerm = 3_500_000;
    const costBarr = 1_500_000;
    const share = (flag, total) => flag ? total : 0;
    setRoi('Green', costGreen, share(m.greenRoofs, data.npvAvoided * 0.35));
    setRoi('Perm', costPerm, share(m.permeable, data.npvAvoided * 0.40));
    setRoi('Barr', costBarr, share(m.barriers, data.npvAvoided * 0.25));
  } catch {
    const totalDamage = parseFloat((document.getElementById('kpiTotalDamage').textContent || '0').replace(/[^0-9.-]+/g, '')) || 0;
    const avoidedGreen = totalDamage * 0.08;
    const avoidedPerm = totalDamage * 0.10;
    const avoidedBarr = totalDamage * 0.12;
    setRoi('Green', 2_000_000, avoidedGreen);
    setRoi('Perm', 3_500_000, avoidedPerm);
    setRoi('Barr', 1_500_000, avoidedBarr);
  }
}

function renderFlood(levelCm, mitigation) {
  const gj = generateFloodGeoJSON(levelCm, mitigation);
  floodLayer.clearLayers();
  floodLayer.addData(gj);
}

function initChart() {
  const ctx = document.getElementById('damageChart');
  damageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Res', 'Comm', 'Infra', 'Public'],
      datasets: [
        { label: 'Damage (€)', data: [0, 0, 0, 0], backgroundColor: ['#58a6ff', '#f2cc60', '#ff7b72', '#7ee787'] }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: (v) => formatEuro(v) } }
      }
    }
  });
}

function updateChart(totalDamage) {
  // split into categories with arbitrary shares
  const res = totalDamage * 0.45;
  const com = totalDamage * 0.30;
  const inf = totalDamage * 0.20;
  const pub = totalDamage * 0.05;
  damageChart.data.datasets[0].data = [res, com, inf, pub];
  damageChart.update();
}

function getMitigationState() {
  return {
    greenRoofs: document.getElementById('mitGreenRoofs').checked,
    permeable: document.getElementById('mitPermeable').checked,
    barriers: document.getElementById('mitBarriers').checked
  };
}

function syncURL(levelCm) {
  const m = getMitigationState();
  const params = new URLSearchParams();
  params.set('level', String(levelCm));
  params.set('gr', m.greenRoofs ? '1' : '0');
  params.set('pp', m.permeable ? '1' : '0');
  params.set('tb', m.barriers ? '1' : '0');
  if (seed) params.set('seed', String(seed));
  const url = `${location.pathname}?${params.toString()}`;
  history.replaceState({}, '', url);
}

function readURL() {
  const p = new URLSearchParams(location.search);
  const level = Number(p.get('level')) || 120;
  const m = {
    greenRoofs: p.get('gr') === '1',
    permeable: p.get('pp') === '1',
    barriers: p.get('tb') === '1'
  };
  return { level, m };
}

function shareLink() {
  navigator.clipboard.writeText(location.href).then(() => {
    const btn = document.getElementById('btnShare');
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = old), 1200);
  });
}

function exportReport() {
  const kpi = {
    total: document.getElementById('kpiTotalDamage').textContent,
    buildings: document.getElementById('kpiBuildings').textContent,
    critical: document.getElementById('kpiCritical').textContent
  };
  const roi = {
    green: {
      cost: document.getElementById('roiCostGreen').textContent,
      avoided: document.getElementById('roiAvoidGreen').textContent,
      bc: document.getElementById('roiBCGreen').textContent
    },
    permeable: {
      cost: document.getElementById('roiCostPerm').textContent,
      avoided: document.getElementById('roiAvoidPerm').textContent,
      bc: document.getElementById('roiBCPerm').textContent
    },
    barriers: {
      cost: document.getElementById('roiCostBarr').textContent,
      avoided: document.getElementById('roiAvoidBarr').textContent,
      bc: document.getElementById('roiBCBarr').textContent
    }
  };
  const blob = new Blob([JSON.stringify({ kpi, roi }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lyon-flood-report.json';
  a.click();
}

async function pingServer() {
  const badge = document.getElementById('serverStatus');
  if (!badge) return;
  try {
    const res = await fetch(`${backendBase}/health`, { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    badge.textContent = 'Server: online';
    badge.style.color = '#7ee787';
  } catch (e) {
    badge.textContent = 'Server: offline (local mode)';
    badge.style.color = '#ff7b72';
  }
}

async function exportReportWithBackend() {
  const slider = document.getElementById('levelSlider');
  const level = Number(slider.value);
  const m = getMitigationState();
  try {
    const url = new URL(`${backendBase}/api/report.pdf`);
    url.searchParams.set('level', String(level));
    url.searchParams.set('gr', m.greenRoofs ? '1' : '0');
    url.searchParams.set('pp', m.permeable ? '1' : '0');
    url.searchParams.set('tb', m.barriers ? '1' : '0');
    if (apiKeyParam) url.searchParams.set('apiKey', apiKeyParam);
    const a = document.createElement('a');
    a.href = url.toString();
    a.target = '_blank';
    a.click();
  } catch (e) {
    exportReport();
  }
}

function toggleLiveStream() {
  const btn = document.getElementById('btnLive');
  if (sseSource) {
    sseSource.close();
    sseSource = null;
    if (btn) btn.textContent = 'Live stream';
    return;
  }
  const slider = document.getElementById('levelSlider');
  const m = getMitigationState();
  const url = new URL(`${backendBase}/api/simulate/stream`);
  url.searchParams.set('start', slider.value);
  url.searchParams.set('end', '300');
  url.searchParams.set('step', '3');
  url.searchParams.set('gr', m.greenRoofs ? '1' : '0');
  url.searchParams.set('pp', m.permeable ? '1' : '0');
  url.searchParams.set('tb', m.barriers ? '1' : '0');
  if (apiKeyParam) url.searchParams.set('apiKey', apiKeyParam);
  try {
    sseSource = new EventSource(url.toString());
  } catch (e) {
    alert('Live stream not supported in this context.');
    return;
  }
  if (btn) btn.textContent = 'Stop stream';
  sseSource.addEventListener('progress', (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      const level = Number(payload.level);
      document.getElementById('levelSlider').value = String(level);
      document.getElementById('levelValue').textContent = String(level);
      renderAll();
    } catch {}
  });
  sseSource.addEventListener('done', () => {
    if (btn) btn.textContent = 'Live stream';
    sseSource?.close();
    sseSource = null;
  });
  sseSource.onerror = () => {
    if (btn) btn.textContent = 'Live stream';
    sseSource?.close();
    sseSource = null;
  };
}

function animateScenario() {
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
    return;
  }
  const slider = document.getElementById('levelSlider');
  let t = Number(slider.value);
  function step() {
    t += 3;
    if (t > Number(slider.max)) t = Number(slider.min);
    slider.value = String(t);
    document.getElementById('levelValue').textContent = String(t);
    renderAll();
    animationHandle = requestAnimationFrame(step);
  }
  animationHandle = requestAnimationFrame(step);
}

function renderAll() {
  const slider = document.getElementById('levelSlider');
  const level = Number(slider.value);
  const m = getMitigationState();
  document.getElementById('levelValue').textContent = String(level);
  renderFlood(level, m);
  const total = renderBuildings(level, m);
  updateChart(total);
  syncURL(level);
}

function attachUI() {
  const slider = document.getElementById('levelSlider');
  const select = document.getElementById('scenarioSelect');
  document.getElementById('mitGreenRoofs').addEventListener('change', renderAll);
  document.getElementById('mitPermeable').addEventListener('change', renderAll);
  document.getElementById('mitBarriers').addEventListener('change', renderAll);
  slider.addEventListener('input', renderAll);
  select.addEventListener('change', () => {
    const map = { '10': 60, '50': 100, '100': 140 };
    if (select.value in map) {
      slider.value = String(map[select.value]);
      renderAll();
    }
  });
  document.getElementById('btnPlay').addEventListener('click', animateScenario);
  const btnLive = document.getElementById('btnLive');
  if (btnLive) btnLive.addEventListener('click', toggleLiveStream);
  document.getElementById('btnReset').addEventListener('click', () => {
    slider.value = '120';
    document.getElementById('mitGreenRoofs').checked = false;
    document.getElementById('mitPermeable').checked = false;
    document.getElementById('mitBarriers').checked = false;
    renderAll();
  });
  document.getElementById('btnShare').addEventListener('click', shareLink);
  document.getElementById('btnExport').addEventListener('click', exportReportWithBackend);
  document.getElementById('btnContours').addEventListener('click', toggleContours);
  document.getElementById('btnMeasure').addEventListener('click', toggleMeasureTool);
  document.getElementById('btnProfile').addEventListener('click', showDepthProfile);
  
  const modal = document.getElementById('imageModal');
  const closeModal = document.querySelector('.modal-close');
  closeModal.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

function initFromURL() {
  const { level, m } = readURL();
  document.getElementById('levelSlider').value = String(level);
  document.getElementById('mitGreenRoofs').checked = m.greenRoofs;
  document.getElementById('mitPermeable').checked = m.permeable;
  document.getElementById('mitBarriers').checked = m.barriers;
}

function generateSyntheticSatellite(lat, lng, width = 300, height = 200) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const noise = (Math.sin(x * 0.1) + Math.cos(y * 0.1)) * 30;
      const base = 60 + noise;
      
      if ((x + y) % 40 < 20) {
        data[i] = base + 40;
        data[i + 1] = base + 60;
        data[i + 2] = base + 20;
      } else {
        data[i] = base + 20;
        data[i + 1] = base + 30;
        data[i + 2] = base + 15;
      }
      data[i + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function generateFloodOverlay(depth, width = 300, height = 200) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
  const alpha = Math.min(0.8, depth * 0.4);
  gradient.addColorStop(0, `rgba(88, 166, 255, ${alpha})`);
  gradient.addColorStop(1, `rgba(88, 166, 255, ${alpha * 0.3})`);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  if (depth > 0.5) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    for (let i = 0; i < 5; i++) {
      const y = (height / 6) * (i + 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
  
  return canvas;
}

async function showImageModal(lat, lng, depth, damage, isCritical) {
  const modal = document.getElementById('imageModal');
  const beforeCanvas = document.getElementById('beforeCanvas');
  const afterCanvas = document.getElementById('afterCanvas');
  
  document.getElementById('modalTitle').textContent = isCritical ? 'Critical Infrastructure Analysis' : 'Flood Impact Analysis';
  document.getElementById('modalCoords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById('modalDepth').textContent = `${depth.toFixed(2)} m`;
  document.getElementById('modalVelocity').textContent = `${(depth * 0.8).toFixed(1)} m/s`;
  
  const nearbyBuildings = buildings.filter(b => 
    Math.hypot(b.lat - lat, b.lng - lng) < 0.01
  ).length;
  document.getElementById('modalBuildings').textContent = nearbyBuildings.toString();
  
  modal.style.display = 'block';
  
  try {
    const response = await fetch(`${pythonServiceBase}/api/generate-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, depth })
    });
    
    if (response.ok) {
      const data = await response.json();
      const beforeImg = new Image();
      const afterImg = new Image();
      
      beforeImg.onload = () => {
        const beforeCtx = beforeCanvas.getContext('2d');
        beforeCtx.drawImage(beforeImg, 0, 0, beforeCanvas.width, beforeCanvas.height);
      };
      
      afterImg.onload = () => {
        const afterCtx = afterCanvas.getContext('2d');
        afterCtx.drawImage(afterImg, 0, 0, afterCanvas.width, afterCanvas.height);
      };
      
      beforeImg.src = data.before_image;
      afterImg.src = data.after_image;
    } else {
      throw new Error('Python service unavailable');
    }
  } catch (error) {
    const beforeCtx = beforeCanvas.getContext('2d');
    const afterCtx = afterCanvas.getContext('2d');
    
    const satelliteImg = generateSyntheticSatellite(lat, lng);
    beforeCtx.drawImage(satelliteImg, 0, 0, beforeCanvas.width, beforeCanvas.height);
    
    afterCtx.drawImage(satelliteImg, 0, 0, afterCanvas.width, afterCanvas.height);
    const floodOverlay = generateFloodOverlay(depth);
    afterCtx.drawImage(floodOverlay, 0, 0, afterCanvas.width, afterCanvas.height);
  }
}

async function toggleContours() {
  const btn = document.getElementById('btnContours');
  if (contoursLayer.getLayers().length > 0) {
    contoursLayer.clearLayers();
    btn.textContent = 'Depth contours';
    return;
  }
  
  btn.textContent = 'Generating...';
  const slider = document.getElementById('levelSlider');
  const level = Number(slider.value);
  
  try {
    const response = await fetch(`${pythonServiceBase}/api/depth-contours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        level,
        bounds: [[45.75, 4.82], [45.78, 4.86]]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const colors = ['#58a6ff', '#f2cc60', '#ff7b72', '#7ee787'];
      
      data.contours.forEach((contour, i) => {
        if (contour.coordinates.length > 3) {
          const polygon = L.polygon(contour.coordinates, {
            color: colors[Math.floor(contour.level * 2) % colors.length],
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '5, 5'
          });
          polygon.bindTooltip(`${contour.level}m depth contour`);
          contoursLayer.addLayer(polygon);
        }
      });
      btn.textContent = 'Hide contours';
    } else {
      throw new Error('Service unavailable');
    }
  } catch (error) {
    const levels = [0.5, 1.0, 1.5, 2.0];
    const colors = ['#58a6ff', '#f2cc60', '#ff7b72', '#7ee787'];
    
    levels.forEach((level, i) => {
      const contour = L.polygon([
        [[45.75, 4.82], [45.75, 4.86], [45.78, 4.86], [45.78, 4.82]]
      ], {
        color: colors[i],
        weight: 2,
        fillOpacity: 0.1,
        dashArray: '5, 5'
      });
      contour.bindTooltip(`${level}m depth contour`);
      contoursLayer.addLayer(contour);
    });
    btn.textContent = 'Hide contours';
  }
}

function toggleMeasureTool() {
  const btn = document.getElementById('btnMeasure');
  if (map.hasLayer(measureLayer)) {
    map.removeLayer(measureLayer);
    map.removeControl(drawControl);
    btn.textContent = 'Measure tool';
  } else {
    map.addLayer(measureLayer);
    map.addControl(drawControl);
    btn.textContent = 'Stop measuring';
  }
}

function showDepthProfile() {
  const centerline = [[45.75, 4.83], [45.76, 4.84], [45.77, 4.85], [45.78, 4.86]];
  const slider = document.getElementById('levelSlider');
  const level = Number(slider.value);
  const mitigation = getMitigationState();
  
  const profileData = centerline.map((point, i) => {
    const depth = depthAtPoint(point, level, mitigation);
    return { x: i * 100, y: depth };
  });
  
  const existingChart = Chart.getChart('damageChart');
  if (existingChart) {
    existingChart.data.labels = profileData.map(p => `${p.x}m`);
    existingChart.data.datasets[0] = {
      label: 'Depth (m)',
      data: profileData.map(p => p.y),
      backgroundColor: '#58a6ff',
      borderColor: '#58a6ff',
      type: 'line'
    };
    existingChart.update();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initMap();
  initChart();
  attachUI();
  initFromURL();
  renderAll();
  pingServer();
});


