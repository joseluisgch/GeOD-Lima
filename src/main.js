import { MapboxOverlay } from '@deck.gl/mapbox';
import { FlowmapLayer } from '@flowmap.gl/layers';
import { TextLayer } from 'deck.gl';
import maplibregl from 'maplibre-gl';

// Map Base Styles (CartoDB Dark Matter & Esri World Imagery Satellite)
const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  satellite: {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, ArcGIS Online, and the GIS User Community'
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 20
      }
    ]
  }
};

// App State
const state = {
  currentMode: 'publico',      // 'publico', 'privado', 'camiones'
  currentLevel: 'districts',    // 'districts', 'zones'
  currentThreshold: 0,
  currentThickness: 1.5,
  animateParticles: true,
  colorScheme: 'Magma',
  selectedLocation: null,      // stores ID of clicked location to isolate flows
  
  // Data caches
  locations: [],
  flows: [],
  visibleFlows: [],            // stores currently filtered/visible flows for stats and tooltips
  zoneToDistrictMap: new Map(),
  zoneToNameMap: new Map(),
  
  // Map and Overlay
  map: null,
  deckOverlay: null
};

// UI Elements
const el = {
  modeSelector: document.getElementById('mode-selector'),
  levelSelector: document.getElementById('level-selector'),
  thresholdSlider: document.getElementById('threshold-slider'),
  thresholdVal: document.getElementById('threshold-val'),
  thresholdHelper: document.getElementById('threshold-helper'),
  widthSlider: document.getElementById('width-slider'),
  animateToggle: document.getElementById('animate-toggle'),
  colorSchemeSelect: document.getElementById('color-scheme'),
  
  // Stats
  statTotalFlow: document.getElementById('stat-total-flow'),
  statActiveFlows: document.getElementById('stat-active-flows'),
  statFlowUnit: document.getElementById('stat-flow-unit'),
  topRoutesList: document.getElementById('top-routes-list'),
  modeHelper: document.getElementById('mode-helper'),
  
  // Filter status
  filterStatusContainer: document.getElementById('filter-status-container'),
  filterStatusText: document.getElementById('filter-status-text'),
  btnClearFilter: document.getElementById('btn-clear-filter'),
  
  // Overlay/Tooltip
  loadingOverlay: document.getElementById('loading-overlay'),
  tooltip: document.getElementById('tooltip'),
  
  // Recording
  btnRecord: document.getElementById('btn-record'),
  recordText: document.getElementById('record-text'),
  recordHelper: document.getElementById('record-helper')
};

// Mode Configs: Display names, units, and slider ranges
const modeConfigs = {
  publico: {
    label: 'Transporte Público (viajes)',
    unit: 'viajes',
    accentColor: '#10b981',
    accentColorRgb: '16, 185, 129',
    thresholds: {
      districts: { min: 0, max: 1000, step: 10, default: 0 },
      zones: { min: 2, max: 50, step: 1, default: 2 }
    }
  },
  privado: {
    label: 'Transporte Privado/Taxi (vehículos)',
    unit: 'vehículos',
    accentColor: '#06b6d4',
    accentColorRgb: '6, 182, 212',
    thresholds: {
      districts: { min: 0, max: 200, step: 2, default: 0 },
      zones: { min: 0.5, max: 10, step: 0.2, default: 0.5 }
    }
  },
  camiones: {
    label: 'Vehículos de Carga (camiones)',
    unit: 'camiones',
    accentColor: '#f59e0b',
    accentColorRgb: '245, 158, 11',
    thresholds: {
      districts: { min: 0, max: 20, step: 0.5, default: 0 },
      zones: { min: 0.02, max: 2, step: 0.05, default: 0.02 }
    }
  }
};

// Initialize Map and Deck.gl
function initMap() {
  console.log("Initializing map...");
  
  state.map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLES.dark,
    center: [-77.0428, -12.0464], // Centered on Lima, Peru
    zoom: 10.8,
    pitch: 25,
    bearing: 0,
    preserveDrawingBuffer: true
  });

  // Add zoom and rotation controls
  state.map.addControl(new maplibregl.NavigationControl(), 'top-right');

  // Add mouseleave listener to hide tooltip when cursor leaves map area
  document.getElementById('map').addEventListener('mouseleave', () => {
    el.tooltip.classList.add('hidden');
  });

  // Initialize DeckGL Overlay
  state.deckOverlay = new MapboxOverlay({
    interleaved: false, // Render in separate canvas overlay for compatibility
    glOptions: {
      preserveDrawingBuffer: true
    },
    layers: [],
    onClick: (info) => {
      if (!info.object) {
        console.log("Empty map clicked, clearing selection filter.");
        state.selectedLocation = null;
        updateVisualization();
        
        // Close sidebar on mobile when clicking empty space on map
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      }
    }
  });

  state.map.addControl(state.deckOverlay);

  // Load initial data once map load finishes
  state.map.on('load', () => {
    console.log("Map loaded, loading initial dataset...");
    updateSliderRange();
    loadData();
  });
}

// Update threshold slider parameters dynamically based on current mode and level
function updateSliderRange() {
  const config = modeConfigs[state.currentMode].thresholds[state.currentLevel];
  
  el.thresholdSlider.min = config.min;
  el.thresholdSlider.max = config.max;
  el.thresholdSlider.step = config.step;
  
  // Set default slider value
  if (state.currentThreshold < config.min || state.currentThreshold > config.max) {
    state.currentThreshold = config.default;
  }
  el.thresholdSlider.value = state.currentThreshold;
  el.thresholdVal.textContent = state.currentThreshold.toLocaleString('es-PE', {
    minimumFractionDigits: state.currentLevel === 'zones' && state.currentMode === 'camiones' ? 2 : 1
  });
  
  // Update unit label in stats
  el.statFlowUnit.textContent = modeConfigs[state.currentMode].unit;
  el.modeHelper.textContent = modeConfigs[state.currentMode].label;
}

// Fetch and load datasets
async function loadData() {
  el.loadingOverlay.classList.remove('hidden');
  
  const mode = state.currentMode;
  const level = state.currentLevel;
  
  const baseUrl = import.meta.env.BASE_URL || '/';
  const locationsFile = `${baseUrl}data/locations_${level}.json`;
  const flowsFile = `${baseUrl}data/flows_${level}_${mode}.json`;
  
  try {
    console.log(`Loading locations from: ${locationsFile}`);
    const locRes = await fetch(locationsFile);
    state.locations = await locRes.json();
    
    console.log(`Loading flows from: ${flowsFile}`);
    const flowRes = await fetch(flowsFile);
    state.flows = await flowRes.json();
    
    console.log(`Loaded ${state.locations.length} locations and ${state.flows.length} flows.`);
    
    // Clear mappings
    state.zoneToDistrictMap.clear();
    state.zoneToNameMap.clear();
    
    // Build quick maps if zone-level
    if (level === 'zones') {
      state.locations.forEach(loc => {
        state.zoneToDistrictMap.set(loc.id, loc.district);
        state.zoneToNameMap.set(loc.id, loc.name);
      });
    }
    
    // Update theme accents in CSS based on mode
    const modeConfig = modeConfigs[mode];
    document.documentElement.style.setProperty('--active-accent', modeConfig.accentColor);
    document.documentElement.style.setProperty('--active-accent-rgb', modeConfig.accentColorRgb);
    
    // Apply changes
    updateVisualization();
  } catch (error) {
    console.error("Error loading mobility datasets:", error);
    alert("Hubo un error cargando los datos de movilidad. Por favor, recarga la página.");
  } finally {
    el.loadingOverlay.classList.add('hidden');
  }
}

// Filter, calculate stats, and update FlowmapLayer
function updateVisualization() {
  const level = state.currentLevel;
  const threshold = state.currentThreshold;
  const selected = state.selectedLocation;
  
  // 1. Filter flows by threshold
  let filteredFlows = state.flows.filter(f => f.count >= threshold);
  
  // 2. Filter flows by selected location (clic isolate)
  if (selected !== null) {
    const selStr = String(selected);
    filteredFlows = filteredFlows.filter(f => String(f.origin) === selStr || String(f.dest) === selStr);
    
    if (level === 'districts') {
      el.filterStatusText.textContent = `Filtro Distrito: ${selected}`;
    } else {
      const zoneName = state.zoneToNameMap.get(Number(selected)) || state.zoneToNameMap.get(selected) || `Zona ${selected}`;
      el.filterStatusText.textContent = `Filtro: ${zoneName}`;
    }
    el.filterStatusContainer.classList.remove('hidden');
  } else {
    el.filterStatusContainer.classList.add('hidden');
  }
  
  // Save currently visible flows in state for stats and tooltips
  state.visibleFlows = filteredFlows;
  
  // Calculate active flow volume per location node for label offsetting
  const nodeFlows = new Map();
  filteredFlows.forEach(f => {
    nodeFlows.set(f.origin, (nodeFlows.get(f.origin) || 0) + f.count);
    nodeFlows.set(f.dest, (nodeFlows.get(f.dest) || 0) + f.count);
  });

  state.locations.forEach(loc => {
    loc.activeFlow = nodeFlows.get(loc.id) || 0;
  });

  const activeFlowValues = state.locations.map(l => l.activeFlow);
  const maxActiveFlow = activeFlowValues.length > 0 ? Math.max(...activeFlowValues) : 1;
  
  // 3. Compute stats
  const totalFlow = filteredFlows.reduce((sum, f) => sum + f.count, 0);
  const activeRoutes = filteredFlows.length;
  
  // Update stats counters
  el.statTotalFlow.textContent = Math.round(totalFlow).toLocaleString('es-PE');
  el.statActiveFlows.textContent = activeRoutes.toLocaleString('es-PE');
  
  // Update Top 5 Routes List
  updateTopRoutesList(filteredFlows);
  
  // 4. Instantiate FlowmapLayer
  console.log(`Rendering flowmap with ${activeRoutes} visible flows...`);
  
  const flowmapLayer = new FlowmapLayer({
    id: 'flowmap-layer',
    data: {
      locations: state.locations,
      flows: filteredFlows
    },
    getLocationId: l => l.id,
    getLocationLat: l => l.lat,
    getLocationLon: l => l.lon,
    getFlowOriginId: f => f.origin,
    getFlowDestId: f => f.dest,
    getFlowMagnitude: f => f.count,
    
    // Disable clustering to map exact transit zones and resolve ID mismatches
    clusteringEnabled: false,
    
    // Aesthetic Styling
    darkMode: true,
    colorScheme: state.colorScheme,
    flowLineThicknessScale: state.currentThickness,
    flowLinesRenderingMode: state.animateParticles ? 'animated-straight' : 'straight',
    
    // Interaction
    pickable: true,
    onHover: handleHover,
    onClick: handleClick,
    
    // Highlight
    highlightColor: '#ff2d55',
    
    // Fading styling when focused
    fadeEnabled: true,
    fadeOpacity: 0.15,
  });
  
  const textLayer = new TextLayer({
    id: 'text-layer',
    data: state.locations,
    getPosition: l => [l.lon, l.lat],
    getText: l => state.currentLevel === 'districts' ? l.name : String(l.id),
    fontFamily: 'Outfit, system-ui, sans-serif',
    fontWeight: 600,
    getSize: state.currentLevel === 'districts' ? 12 : 9,
    getColor: [255, 255, 255, 230],
    outlineWidth: 3,
    outlineColor: [12, 15, 22, 255],
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom', // Place text above the offset coordinate
    getPixelOffset: l => {
      const val = l.activeFlow || 0;
      const maxVal = maxActiveFlow || 1;
      const isDistrict = state.currentLevel === 'districts';
      
      // Calculate dynamic radius matching flowmap.gl visual scaling
      // Min radius for districts is 8px, max is 28px. For zones, min is 4px, max is 16px.
      const minR = isDistrict ? 8 : 4;
      const maxR = isDistrict ? 28 : 16;
      const r = val > 0 ? minR + (maxR - minR) * Math.sqrt(val / maxVal) : minR;
      
      // Offset vertically Y upward (negative) by radius + 6px padding
      return [0, -(r + 6)];
    },
    minZoom: state.currentLevel === 'districts' ? 0 : 12.5,
    updateTriggers: {
      getText: [state.currentLevel],
      getSize: [state.currentLevel],
      getPixelOffset: [state.currentLevel, maxActiveFlow]
    }
  });

  // Set layers into overlay
  state.deckOverlay.setProps({
    layers: [flowmapLayer, textLayer]
  });
}

// Generate the list items for top 5 routes
function updateTopRoutesList(flows) {
  // Clear list
  el.topRoutesList.innerHTML = '';
  
  // Get top 5 sorted by magnitude (since they are pre-sorted descending, just slice first 5)
  const top5 = flows.slice(0, 5);
  
  if (top5.length === 0) {
    el.topRoutesList.innerHTML = '<li>Sin rutas visibles</li>';
    return;
  }
  
  top5.forEach(flow => {
    let originName = flow.origin;
    let destName = flow.dest;
    
    if (state.currentLevel === 'zones') {
      originName = state.zoneToNameMap.get(flow.origin) || `Zona ${flow.origin}`;
      destName = state.zoneToNameMap.get(flow.dest) || `Zona ${flow.dest}`;
    }
    
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="route-names">
        <span class="route-od" title="${originName} ➔ ${destName}">${originName} ➔ ${destName}</span>
      </div>
      <span class="route-count">${flow.count.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</span>
    `;
    el.topRoutesList.appendChild(li);
  });
}

// Handle Map Interaction: Hover Tooltip
function handleHover(info) {
  if (!info || !info.object) {
    el.tooltip.classList.add('hidden');
    return;
  }
  
  const { x, y, object } = info;
  
  el.tooltip.classList.remove('hidden');
  el.tooltip.style.left = `${x + 15}px`;
  el.tooltip.style.top = `${y + 15}px`;
  
  const unit = modeConfigs[state.currentMode].unit;
  
  // Case A: Hovering a Location Node
  if (object.type === 'location' || object.lat !== undefined || (object.id && !object.origin)) {
    const isDistrict = state.currentLevel === 'districts';
    const locIdStr = String(object.id);
    
    // Calculate incoming and outgoing sum from current visible flows
    let totalIncoming = 0;
    let totalOutgoing = 0;
    if (state.visibleFlows) {
      for (const f of state.visibleFlows) {
        if (String(f.dest) === locIdStr) {
          totalIncoming += f.count;
        }
        if (String(f.origin) === locIdStr) {
          totalOutgoing += f.count;
        }
      }
    }
    
    el.tooltip.innerHTML = `
      <div class="tooltip-title">${isDistrict ? 'Distrito' : 'Zona de Movilidad'}</div>
      <div class="tooltip-row">
        <span>Nombre:</span>
        <span class="tooltip-value">${object.name}</span>
      </div>
      ${object.district ? `
      <div class="tooltip-row">
        <span>Distrito:</span>
        <span class="tooltip-value">${object.district}</span>
      </div>` : ''}
      <div class="tooltip-row" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px; margin-top: 4px;">
        <span>Flujo Recibido:</span>
        <span class="tooltip-value">${Math.round(totalIncoming).toLocaleString('es-PE')} ${unit}</span>
      </div>
      <div class="tooltip-row">
        <span>Flujo Enviado:</span>
        <span class="tooltip-value">${Math.round(totalOutgoing).toLocaleString('es-PE')} ${unit}</span>
      </div>
      <div class="helper-text" style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">Haz clic para filtrar flujos entrantes/salientes.</div>
    `;
  } 
  // Case B: Hovering a Flow Line
  else if (object.type === 'flow' || object.origin !== undefined) {
    const originLabel = typeof object.origin === 'object' && object.origin !== null ? object.origin.name : object.origin;
    const destLabel = typeof object.dest === 'object' && object.dest !== null ? object.dest.name : object.dest;
    
    el.tooltip.innerHTML = `
      <div class="tooltip-title">Ruta de Flujo</div>
      <div class="tooltip-row">
        <span>Origen:</span>
        <span class="tooltip-value">${originLabel}</span>
      </div>
      <div class="tooltip-row">
        <span>Destino:</span>
        <span class="tooltip-value">${destLabel}</span>
      </div>
      <div class="tooltip-row" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; margin-top: 4px;">
        <span>Volumen:</span>
        <span class="tooltip-value" style="font-size: 1rem;">${object.count.toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${unit}</span>
      </div>
    `;
  }
}

// Handle Map Interaction: Click to Isolate/Filter
function handleClick(info) {
  const { object } = info;
  
  if (!object) {
    // Click on empty map area clears the selection filter
    console.log("Empty map clicked, clearing selection filter.");
    state.selectedLocation = null;
    updateVisualization();
    return;
  }
  
  // If location clicked, isolate it
  if (object.type === 'location' || object.lat !== undefined || (object.id && !object.origin)) {
    console.log("Location clicked:", object.id);
    state.selectedLocation = object.id;
    updateVisualization();
  }
  // If flow clicked, isolate by its origin
  else if (object.type === 'flow' || object.origin !== undefined) {
    const originId = typeof object.origin === 'object' && object.origin !== null ? object.origin.id : object.origin;
    console.log("Flow clicked, isolating origin:", originId);
    state.selectedLocation = originId;
    updateVisualization();
  }
}

// Screen Recording Variables & Logic
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let animationFrameId = null;

function toggleControlsDisable(disabled) {
  const elementsToToggle = [
    el.modeSelector,
    el.levelSelector,
    el.thresholdSlider,
    el.widthSlider,
    el.animateToggle,
    el.colorSchemeSelect
  ];
  
  elementsToToggle.forEach(element => {
    if (!element) return;
    if (disabled) {
      element.style.pointerEvents = 'none';
      element.style.opacity = '0.5';
    } else {
      element.style.pointerEvents = 'auto';
      element.style.opacity = '1';
    }
  });
}

function resetRecordingUI() {
  if (el.btnRecord) {
    el.btnRecord.classList.remove('recording');
    const dot = el.btnRecord.querySelector('.record-dot-icon');
    if (dot) dot.textContent = '🔴';
  }
  if (el.recordText) el.recordText.textContent = 'Grabar Video Corto';
  if (el.recordHelper) el.recordHelper.textContent = 'Genera un video .mp4 de la animación (máx. 30s).';
  toggleControlsDisable(false);
}

function startRecording() {
  recordedChunks = [];
  recordingSeconds = 0;
  
  // Find all canvases inside map container
  const canvases = Array.from(document.querySelectorAll('#map canvas'));
  if (canvases.length === 0) {
    console.error("No canvases found in map container.");
    alert("Error: No se encontró el lienzo del mapa para grabar.");
    return;
  }
  
  let stream;
  
  if (canvases.length === 1) {
    // Standard capture if interleaved is true (one canvas)
    stream = canvases[0].captureStream(30); // 30 FPS
  } else {
    // If interleaved is false, we have two canvases (MapLibre and deck.gl).
    // We must merge them into a combined canvas in real time.
    const recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = canvases[0].width;
    recordingCanvas.height = canvases[0].height;
    const ctx = recordingCanvas.getContext('2d');
    
    function drawMergedFrame() {
      ctx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
      canvases.forEach(canvas => {
        ctx.drawImage(canvas, 0, 0, recordingCanvas.width, recordingCanvas.height);
      });
      animationFrameId = requestAnimationFrame(drawMergedFrame);
    }
    drawMergedFrame();
    
    stream = recordingCanvas.captureStream(30); // 30 FPS
  }
  
  // Check browser MIME type compatibility for MP4 and WebM
  const types = [
    { mime: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', ext: 'mp4' },
    { mime: 'video/mp4; codecs=h264', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm; codecs=vp9', ext: 'webm' },
    { mime: 'video/webm; codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];
  
  let selectedType = null;
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type.mime)) {
      selectedType = type;
      break;
    }
  }
  
  if (!selectedType) {
    selectedType = { mime: '', ext: 'webm' };
  }
  
  console.log(`Recording using MIME type: "${selectedType.mime}" (Extension: .${selectedType.ext})`);
  
  try {
    const options = selectedType.mime ? { mimeType: selectedType.mime } : {};
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (err) {
    console.error("Failed to create MediaRecorder with selected MIME type, falling back:", err);
    mediaRecorder = new MediaRecorder(stream);
    selectedType = { mime: mediaRecorder.mimeType, ext: mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm' };
  }
  
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };
  
  mediaRecorder.onstop = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    
    const blob = new Blob(recordedChunks, { type: selectedType.mime || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const mode = state.currentMode;
    const level = state.currentLevel;
    a.download = `lima-movilidad-${mode}-${level}-${dateStr}.${selectedType.ext}`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    resetRecordingUI();
  };
  
  mediaRecorder.start();
  
  if (el.btnRecord) {
    el.btnRecord.classList.add('recording');
    const dot = el.btnRecord.querySelector('.record-dot-icon');
    if (dot) dot.textContent = '⏹️';
  }
  if (el.recordText) el.recordText.textContent = 'Detener Grabación (00:00)';
  if (el.recordHelper) el.recordHelper.textContent = 'Grabando animación... los controles están temporalmente bloqueados.';
  
  toggleControlsDisable(true);
  
  recordingTimer = setInterval(() => {
    recordingSeconds++;
    const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
    const secs = String(recordingSeconds % 60).padStart(2, '0');
    if (el.recordText) el.recordText.textContent = `Detener Grabación (${mins}:${secs})`;
    
    if (recordingSeconds >= 30) {
      stopRecording();
    }
  }, 1000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

// Bind UI Event Listeners
function bindEvents() {
  // Mode Selector (Public, Private, Cargo)
  el.modeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.classList.contains('active')) return;
    
    // Update active visual state
    el.modeSelector.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    state.currentMode = btn.dataset.mode;
    state.selectedLocation = null; // Clear filter
    
    updateSliderRange();
    loadData();
  });

  // Level Selector (Districts vs Zones)
  el.levelSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.classList.contains('active')) return;
    
    // Update active visual state
    el.levelSelector.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    state.currentLevel = btn.dataset.level;
    state.selectedLocation = null; // Clear filter
    
    updateSliderRange();
    loadData();
  });

  // Threshold Slider
  el.thresholdSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.currentThreshold = val;
    
    const precision = state.currentLevel === 'zones' && state.currentMode === 'camiones' ? 2 : 1;
    el.thresholdVal.textContent = val.toLocaleString('es-PE', { minimumFractionDigits: precision });
    updateVisualization();
  });

  // Line Width Slider
  el.widthSlider.addEventListener('input', (e) => {
    state.currentThickness = parseFloat(e.target.value);
    updateVisualization();
  });

  // Particle Animation Toggle
  el.animateToggle.addEventListener('change', (e) => {
    state.animateParticles = e.target.checked;
    updateVisualization();
  });

  // Color Scheme Dropdown
  el.colorSchemeSelect.addEventListener('change', (e) => {
    state.colorScheme = e.target.value;
    updateVisualization();
  });

  // Clear Click-to-Isolate Filter Button
  el.btnClearFilter.addEventListener('click', () => {
    state.selectedLocation = null;
    updateVisualization();
  });

  // Keypress event for Escape key to clear selection filter
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selectedLocation !== null) {
      console.log("Escape pressed, clearing selection filter.");
      state.selectedLocation = null;
      updateVisualization();
    }
  });

  // Mobile Sidebar Toggle and Close
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const closeBtn = document.getElementById('sidebar-close');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }

  // 3D Isometric / 2D flat view toggle
  const btn3D = document.getElementById('btn-3d-toggle');
  if (btn3D) {
    btn3D.addEventListener('click', () => {
      const currentPitch = state.map.getPitch();
      if (currentPitch > 10) {
        // Change to 2D flat view
        state.map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
        btn3D.textContent = '🧊';
        btn3D.title = 'Cambiar a perspectiva 3D';
        btn3D.classList.remove('active');
      } else {
        // Change to 3D isometric view
        state.map.easeTo({ pitch: 55, bearing: -15, duration: 800 });
        btn3D.textContent = '🗺️';
        btn3D.title = 'Cambiar a plano 2D';
        btn3D.classList.add('active');
      }
    });
  }

  // Satellite / Dark map base toggle
  const btnSatellite = document.getElementById('btn-satellite-toggle');
  if (btnSatellite) {
    btnSatellite.addEventListener('click', () => {
      const isSatellite = btnSatellite.classList.contains('active');
      if (isSatellite) {
        // Change to Dark Mode map style
        state.map.setStyle(MAP_STYLES.dark);
        btnSatellite.classList.remove('active');
        btnSatellite.title = 'Activar mapa satelital';
      } else {
        // Change to Satellite map style
        state.map.setStyle(MAP_STYLES.satellite);
        btnSatellite.classList.add('active');
        btnSatellite.title = 'Activar mapa oscuro';
      }
    });
  }

  // Screen recording toggle listener
  if (el.btnRecord) {
    el.btnRecord.addEventListener('click', () => {
      const isRecording = el.btnRecord.classList.contains('recording');
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }
}

// Start Application
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  bindEvents();
});
