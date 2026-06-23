import { MapboxOverlay } from '@deck.gl/mapbox';
import { FlowmapLayer } from '@flowmap.gl/layers';
import maplibregl from 'maplibre-gl';

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
  tooltip: document.getElementById('tooltip')
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
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-77.0428, -12.0464], // Centered on Lima, Peru
    zoom: 10.8,
    pitch: 25,
    bearing: 0
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
    layers: [],
    onClick: (info) => {
      if (!info.object) {
        console.log("Empty map clicked, clearing selection filter.");
        state.selectedLocation = null;
        updateVisualization();
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
  
  // 3. Compute stats
  const totalFlow = filteredFlows.reduce((sum, f) => sum + f.count, 0);
  const activeRoutes = filteredFlows.length;
  
  // Update stats counters
  el.statTotalFlow.textContent = Math.round(totalFlow).toLocaleString('es-PE');
  el.statActiveFlows.textContent = activeRoutes.toLocaleString('es-PE');
  
  // Update Top 3 Routes List
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
  
  // Set layer into overlay
  state.deckOverlay.setProps({
    layers: [flowmapLayer]
  });
}

// Generate the list items for top 3 routes
function updateTopRoutesList(flows) {
  // Clear list
  el.topRoutesList.innerHTML = '';
  
  // Get top 3 sorted by magnitude (since they are pre-sorted descending, just slice first 3)
  const top3 = flows.slice(0, 3);
  
  if (top3.length === 0) {
    el.topRoutesList.innerHTML = '<li>Sin rutas visibles</li>';
    return;
  }
  
  top3.forEach(flow => {
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
  const { x, y, object } = info;
  
  if (!object) {
    el.tooltip.classList.add('hidden');
    return;
  }
  
  el.tooltip.classList.remove('hidden');
  el.tooltip.style.left = `${x + 15}px`;
  el.tooltip.style.top = `${y + 15}px`;
  
  const unit = modeConfigs[state.currentMode].unit;
  
  // Case A: Hovering a Location Node
  if (object.lat !== undefined) {
    const isDistrict = state.currentLevel === 'districts';
    
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
      <div class="helper-text" style="margin-top: 6px;">Haz clic para filtrar flujos entrantes/salientes.</div>
    `;
  } 
  // Case B: Hovering a Flow Line
  else if (object.origin !== undefined) {
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
  if (object.lat !== undefined) {
    console.log("Location clicked:", object.id);
    state.selectedLocation = object.id;
    updateVisualization();
  }
  // If flow clicked, isolate by its origin
  else if (object.origin !== undefined) {
    const originId = typeof object.origin === 'object' && object.origin !== null ? object.origin.id : object.origin;
    console.log("Flow clicked, isolating origin:", originId);
    state.selectedLocation = originId;
    updateVisualization();
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
}

// Start Application
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  bindEvents();
});
