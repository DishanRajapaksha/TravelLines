import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  Tooltip,
  useMap
} from 'react-leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';

const PRODUCT_COLORS = {
  'Reizen op Rekening Trein': '#0f766e',
  'Treinreizen': '#1f8a70',
  'Bus, Tram en Metro reizen': '#e76f51',
  'Intercity Direct Toeslag': '#a44a3f',
  'Klanten Service': '#6b7280'
};

const PRODUCT_LABELS = {
  'Reizen op Rekening Trein': 'Train (rekening)',
  'Treinreizen': 'Train (ticket)',
  'Bus, Tram en Metro reizen': 'Bus/Tram/Metro',
  'Intercity Direct Toeslag': 'Intercity Direct',
  'Klanten Service': 'Service'
};

const DEFAULT_CENTER = [52.3729, 4.8936];
const DEFAULT_ZOOM = 10;

const MAP_STYLES = {
  standard: {
    name: 'Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  voyager: {
    name: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  },
  light: {
    name: 'Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  },
  dark: {
    name: 'Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
  }
};



function parseDate(value) {
  if (!value) return null;
  const [day, month, year] = value.split('-').map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  if (!date) return '-';
  return date.toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}



function toInputDate(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    map.fitBounds(points, { padding: [50, 50] });
  }, [map, points]);
  return null;
}

function App() {
  const [rows, setRows] = useState([]);
  const [coords, setCoords] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [productsInitialized, setProductsInitialized] = useState(false);
  const [dateStart, setDateStart] = useState(null);
  const [dateEnd, setDateEnd] = useState(null);
  const [search, setSearch] = useState('');
  const [includeNonTrips, setIncludeNonTrips] = useState(false);
  const [minRouteCount, setMinRouteCount] = useState(1);
  const [showRoutes, setShowRoutes] = useState(true);
  const [mapStyle, setMapStyle] = useState('voyager');
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [csvRes, coordsRes] = await Promise.all([
          fetch('data/trips.csv'),
          fetch('data/stopCoords.json')
        ]);

        if (!csvRes.ok) {
          throw new Error('Failed to load trips CSV.');
        }
        if (!coordsRes.ok) {
          throw new Error('Failed to load stop coordinates.');
        }

        const csvText = await csvRes.text();
        const parsed = Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true
        });

        const coordsJson = await coordsRes.json();
        setRows(parsed.data || []);
        setCoords(coordsJson.stops || {});
      } catch (err) {
        setError(err.message || 'Failed to load data.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const trips = useMemo(() => {
    return rows
      .map((row, index) => {
        const date = parseDate(row['Datum']);
        return {
          id: `${row['Datum']}-${row['Check in']}-${index}`,
          date,
          dateLabel: row['Datum'],
          checkIn: row['Check in'],
          checkOut: row['Check uit'],
          from: row['Vertrek'] || '',
          to: row['Bestemming'] || '',
          transactie: row['Transactie'],
          product: row['Product'],
          class: row['Kl'],
          note: row['Opmerking'] || ''
        };
      })
      .filter((trip) => trip.date);
  }, [rows]);

  const allProducts = useMemo(() => {
    const set = new Set();
    trips.forEach((trip) => {
      if (trip.product) set.add(trip.product);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  useEffect(() => {
    if (allProducts.length && !productsInitialized) {
      setSelectedProducts(new Set(allProducts));
      setProductsInitialized(true);
    }
  }, [allProducts, productsInitialized]);

  const dataRange = useMemo(() => {
    if (!trips.length) return { min: null, max: null };
    const dates = trips.map((trip) => trip.date);
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    return { min, max };
  }, [trips]);

  useEffect(() => {
    if (!dataRange.min || !dataRange.max) return;
    if (!dateStart) setDateStart(dataRange.min);
    if (!dateEnd) setDateEnd(dataRange.max);
  }, [dataRange, dateStart, dateEnd]);

  const filteredTrips = useMemo(() => {
    const query = search.trim().toLowerCase();
    return trips.filter((trip) => {
      if (!includeNonTrips && trip.transactie !== 'Reis') return false;
      if (selectedProducts.size === 0) return false;
      if (!selectedProducts.has(trip.product)) return false;
      if (dateStart && trip.date < dateStart) return false;
      if (dateEnd && trip.date > dateEnd) return false;
      if (query) {
        const match = `${trip.from} ${trip.to}`.toLowerCase();
        if (!match.includes(query)) return false;
      }
      return true;
    });
  }, [trips, includeNonTrips, selectedProducts, dateStart, dateEnd, search]);

  const analytics = useMemo(() => {
    const routeMap = new Map();
    const stopMap = new Map();
    const productMap = new Map();
    const missing = new Set();

    filteredTrips.forEach((trip) => {
      productMap.set(trip.product, (productMap.get(trip.product) || 0) + 1);

      if (trip.transactie !== 'Reis') return;
      if (!trip.from || !trip.to) return;

      const fromCoord = coords[trip.from];
      const toCoord = coords[trip.to];

      if (!fromCoord) missing.add(trip.from);
      if (!toCoord) missing.add(trip.to);

      if (!fromCoord || !toCoord) return;

      const routeKey = `${trip.from} -> ${trip.to}`;
      const route = routeMap.get(routeKey) || {
        from: trip.from,
        to: trip.to,
        fromCoord,
        toCoord,
        count: 0,
        products: new Map(),
        dates: []
      };
      route.count += 1;
      route.products.set(trip.product, (route.products.get(trip.product) || 0) + 1);
      route.dates.push(trip.date);
      routeMap.set(routeKey, route);

      stopMap.set(trip.from, (stopMap.get(trip.from) || 0) + 1);
      stopMap.set(trip.to, (stopMap.get(trip.to) || 0) + 1);
    });

    const routes = Array.from(routeMap.values()).sort((a, b) => b.count - a.count);
    const stops = Array.from(stopMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        coord: coords[name]
      }))
      .sort((a, b) => b.count - a.count);

    const products = Array.from(productMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      routes,
      stops,
      products,
      missing: Array.from(missing).sort((a, b) => a.localeCompare(b))
    };
  }, [filteredTrips, coords]);

  const routeThreshold = Math.max(1, minRouteCount);
  const visibleRoutes = analytics.routes.filter((route) => route.count >= routeThreshold);

  const maxRouteCount = analytics.routes.length
    ? Math.max(...analytics.routes.map((route) => route.count))
    : 1;
  const visibleMaxRouteCount = visibleRoutes.length
    ? Math.max(...visibleRoutes.map((route) => route.count))
    : 1;

  const stopCounts = analytics.stops.map((stop) => stop.count);
  const maxStopCount = stopCounts.length ? Math.max(...stopCounts) : 1;

  const boundsPoints = analytics.stops
    .filter((stop) => stop.coord)
    .map((stop) => [stop.coord.lat, stop.coord.lng]);

  const filteredCount = filteredTrips.length;
  const tripCount = filteredTrips.filter((trip) => trip.transactie === 'Reis').length;
  const uniqueStops = analytics.stops.length;
  const uniqueRoutes = analytics.routes.length;
  const topStop = analytics.stops[0];
  const dateSpanLabel = dataRange.min && dataRange.max
    ? `${formatDate(dataRange.min)} to ${formatDate(dataRange.max)}`
    : '-';

  function toggleProduct(product) {
    const next = new Set(selectedProducts);
    if (next.has(product)) {
      next.delete(product);
    } else {
      next.add(product);
    }
    setSelectedProducts(next);
  }

  function clearProducts() {
    setSelectedProducts(new Set());
  }

  function selectAllProducts() {
    setSelectedProducts(new Set(allProducts));
  }

  if (loading) {
    return (
      <div className="app loading">
        <div className="loader">
          <div className="pulse" />
          <p>Loading travel history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app loading">
        <div className="loader">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${!sidebarVisible ? 'ui-hidden' : ''}`}>
      <div className="map-background">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map" zoomControl={false}>
          <TileLayer
            attribution={MAP_STYLES[mapStyle].attribution}
            url={MAP_STYLES[mapStyle].url}
          />

          {boundsPoints.length > 0 && <FitBounds points={boundsPoints} />}

          {showRoutes && visibleRoutes.map((route) => {
            const weight = 1.5 + (route.count / visibleMaxRouteCount) * 5;
            const dominant = Array.from(route.products.entries()).sort((a, b) => b[1] - a[1])[0];
            const color = PRODUCT_COLORS[dominant?.[0]] || '#0f766e';
            return (
              <Polyline
                key={`${route.from}-${route.to}`}
                positions={[
                  [route.fromCoord.lat, route.fromCoord.lng],
                  [route.toCoord.lat, route.toCoord.lng]
                ]}
                pathOptions={{
                  color,
                  weight,
                  opacity: 0.65
                }}
              >
                <Tooltip sticky>
                  {`${route.from} -> ${route.to} - ${route.count} trips`}
                </Tooltip>
              </Polyline>
            );
          })}

          {analytics.stops.map((stop) => {
            if (!stop.coord) return null;
            const radius = 4 + (stop.count / maxStopCount) * 8;
            return (
              <CircleMarker
                key={stop.name}
                center={[stop.coord.lat, stop.coord.lng]}
                radius={radius}
                pathOptions={{
                  color: '#0f766e',
                  weight: 1,
                  fillColor: '#e76f51',
                  fillOpacity: 0.65
                }}
              >
                <Popup>
                  <strong>{stop.name}</strong>
                  <div>{stop.count} check-ins</div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <button
        className={`ui-toggle ${!sidebarVisible ? 'active' : ''}`}
        onClick={() => setSidebarVisible(!sidebarVisible)}
        title={sidebarVisible ? "Hide UI" : "Show UI"}
      >
        {sidebarVisible ? '✕' : '☰'}
      </button>

      <main className="content">
        <aside className="sidebar">
          <header className="hero panel">
            <div className="hero-text">
              <h1>Travel Lines</h1>
              <p className="subhead">
                {tripCount} trips / {uniqueStops} stops
              </p>
            </div>
          </header>

          <div className="panel filters">
            <div className="panel-header">
              <h2>Filters</h2>
            </div>
            <div className="field">
              <label htmlFor="search">Search stops</label>
              <input
                id="search"
                type="search"
                list="stop-options"
                value={search}
                placeholder="Try: Amsterdam..."
                onChange={(event) => setSearch(event.target.value)}
              />
              <datalist id="stop-options">
                {Object.keys(coords).sort().map(stopName => (
                  <option key={stopName} value={stopName} />
                ))}
              </datalist>
            </div>

            <div className="field range">
              <label>Date range</label>
              <div className="range-inputs">
                <input
                  type="date"
                  value={toInputDate(dateStart)}
                  onChange={(event) =>
                    setDateStart(event.target.value ? new Date(event.target.value) : null)
                  }
                />
                <input
                  type="date"
                  value={toInputDate(dateEnd)}
                  onChange={(event) =>
                    setDateEnd(event.target.value ? new Date(event.target.value) : null)
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>Style & Map</label>
              <select
                className="style-select"
                value={mapStyle}
                onChange={(e) => setMapStyle(e.target.value)}
              >
                {Object.entries(MAP_STYLES).map(([key, style]) => (
                  <option key={key} value={key}>{style.name}</option>
                ))}
              </select>
            </div>

            <div className="field toggles">
              <label>
                <input
                  type="checkbox"
                  checked={showRoutes}
                  onChange={(event) => setShowRoutes(event.target.checked)}
                />
                Show routes
              </label>
            </div>

            <div className="field">
              <label>Min trips: {minRouteCount}</label>
              <input
                type="range"
                min="1"
                max={Math.max(1, maxRouteCount)}
                value={minRouteCount}
                onChange={(event) => setMinRouteCount(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label>Products</label>
              <div className="products-grid">
                {allProducts.map((product) => (
                  <button
                    key={product}
                    className={`product-chip ${selectedProducts.has(product) ? 'active' : ''}`}
                    onClick={() => toggleProduct(product)}
                  >
                    <span
                      className="swatch"
                      style={{ background: PRODUCT_COLORS[product] || '#94a3b8' }}
                    />
                    {PRODUCT_LABELS[product] || product}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="panel summary collapsible">
            <h2>Breakdown</h2>
            <div className="bars">
              {analytics.products.slice(0, 5).map((product, index) => (
                <div
                  key={product.name}
                  className="bar"
                  style={{ '--delay': `${index * 60}ms` }}
                >
                  <div className="bar-info">
                    <span>{PRODUCT_LABELS[product.name] || product.name}</span>
                    <strong>{product.count}</strong>
                  </div>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${(product.count / filteredCount) * 100 || 0}%`,
                        background: PRODUCT_COLORS[product.name] || '#94a3b8'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel list collapsible">
            <h2>Top routes</h2>
            <div className="list-items">
              {visibleRoutes.slice(0, 5).map((route, index) => {
                const dominant = Array.from(route.products.entries()).sort((a, b) => b[1] - a[1])[0];
                const color = PRODUCT_COLORS[dominant?.[0]] || '#94a3b8';
                return (
                  <div key={`${route.from}-${route.to}`} className="list-item" style={{ '--delay': `${index * 70}ms` }}>
                    <div className="item-content">
                      <span className="title">{`${route.from} → ${route.to}`}</span>
                      <span className="meta">{route.count} trips</span>
                    </div>
                    <span className="dot" style={{ background: color }} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel stats-grid">
            <div className="stat">
              <span>Total Trips</span>
              <strong>{tripCount}</strong>
            </div>
            <div className="stat">
              <span>Unique Stops</span>
              <strong>{uniqueStops}</strong>
            </div>
            <div className="stat">
              <span>Routes</span>
              <strong>{visibleRoutes.length}</strong>
            </div>

          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
