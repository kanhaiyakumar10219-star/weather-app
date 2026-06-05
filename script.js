/* =========================================================
   ClimateVision Pro - script.js
   Works with the provided index.html + style.css files.
   Add your OpenWeatherMap API key below.
========================================================= */

'use strict';

// 1) API CONFIGURATION
const API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY'; // Replace this with your OpenWeatherMap key
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';
const AUTO_REFRESH_SECONDS = 600;

// 2) APP STATE
let currentCity = 'Mumbai';
let currentWeather = null;
let currentForecast = null;
let currentAQI = null;
let weatherChart = null;
let refreshTimer = null;
let countdownTimer = null;
let countdownValue = AUTO_REFRESH_SECONDS;
let compareCities = JSON.parse(localStorage.getItem('cv_compare') || '[]');
let favoriteCities = JSON.parse(localStorage.getItem('cv_favorites') || '[]');
let recentSearches = JSON.parse(localStorage.getItem('cv_history') || '[]');

// 3) DOM SHORTCUT
const $ = (id) => document.getElementById(id);

// 4) DEMO DATA - app still runs before API key is added
const demoWeather = {
  name: 'Mumbai',
  sys: { country: 'IN', sunrise: 1717459000, sunset: 1717506500 },
  timezone: 19800,
  dt: Math.floor(Date.now() / 1000),
  weather: [{ id: 800, main: 'Clear', description: 'clear sky' }],
  main: { temp: 31, feels_like: 35, temp_min: 28, temp_max: 33, humidity: 68, pressure: 1010 },
  wind: { speed: 4.2, deg: 250 },
  visibility: 8000,
  coord: { lat: 19.076, lon: 72.8777 }
};

function createDemoForecast() {
  const list = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 1; i <= 40; i++) {
    const temp = 28 + Math.sin(i / 3) * 4 + Math.random();
    list.push({
      dt: now + i * 10800,
      main: {
        temp,
        temp_min: temp - 1.5,
        temp_max: temp + 1.5,
        humidity: 55 + Math.round(Math.random() * 25)
      },
      wind: { speed: 2 + Math.random() * 4 },
      weather: [{ id: i % 7 === 0 ? 500 : i % 4 === 0 ? 802 : 800, main: i % 7 === 0 ? 'Rain' : 'Clear', description: i % 7 === 0 ? 'light rain' : 'clear sky' }],
      pop: Math.random() * 0.5
    });
  }
  return { list, city: { timezone: 19800 } };
}

// 5) BASIC HELPERS
function hasApiKey() {
  return API_KEY && API_KEY !== 'YOUR_OPENWEATHERMAP_API_KEY';
}

function weatherEmoji(id) {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  if (id === 801) return '🌤️';
  if (id === 802) return '⛅';
  return '☁️';
}

function weatherBodyClass(main) {
  const value = (main || '').toLowerCase();
  if (value.includes('rain') || value.includes('drizzle')) return 'weather-rain';
  if (value.includes('thunder')) return 'weather-storm';
  if (value.includes('snow')) return 'weather-snow';
  if (value.includes('clear')) return 'weather-clear';
  return 'weather-default';
}

function windDirection(deg = 0) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatTime(unix, tzOffset = 0) {
  const d = new Date((unix + tzOffset) * 1000);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatDate(unix, tzOffset = 0) {
  const d = new Date((unix + tzOffset) * 1000);
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('fade-out'), 2800);
  setTimeout(() => toast.remove(), 3200);
}

function setLoading(isLoading) {
  if ($('skeletonHero')) $('skeletonHero').style.display = isLoading ? 'flex' : 'none';
  if ($('heroContent')) $('heroContent').style.display = isLoading ? 'none' : 'flex';
}

function setAlert(message, type = 'info') {
  const container = $('alertsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!message) return;
  const div = document.createElement('div');
  div.className = `alert-banner alert-${type}`;
  div.innerHTML = `<span class="alert-icon">⚠️</span><span class="alert-text">${message}</span><button class="alert-close" aria-label="Close alert">×</button>`;
  div.querySelector('button').onclick = () => div.remove();
  container.appendChild(div);
}

// 6) API FUNCTIONS
async function getWeatherByCity(city) {
  if (!hasApiKey()) return demoWeather;
  const url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('City not found or API key problem.');
  return res.json();
}

async function getWeatherByCoords(lat, lon) {
  if (!hasApiKey()) return { ...demoWeather, name: 'Your Location' };
  const url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Unable to fetch location weather.');
  return res.json();
}

async function getForecast(lat, lon) {
  if (!hasApiKey()) return createDemoForecast();
  const url = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Unable to fetch forecast.');
  return res.json();
}

async function getAQI(lat, lon) {
  if (!hasApiKey()) return { list: [{ main: { aqi: 2 } }] };
  const url = `${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { list: [{ main: { aqi: 0 } }] };
  return res.json();
}

async function getSuggestions(query) {
  if (!query || query.length < 2) return [];
  if (!hasApiKey()) {
    const demo = ['Mumbai', 'Delhi', 'Rajkot', 'Surat', 'Vadodara', 'London', 'New York', 'Tokyo', 'Paris'];
    return demo.filter(c => c.toLowerCase().includes(query.toLowerCase())).map(name => ({ name, country: '' }));
  }
  const url = `${GEO_URL}/direct?q=${encodeURIComponent(query)}&limit=6&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

// 7) RENDER FUNCTIONS
function renderCurrentWeather(data, forecast, aqi) {
  const weather = data.weather[0];
  const emoji = weatherEmoji(weather.id);
  const tz = data.timezone || 0;

  document.body.className = weatherBodyClass(weather.main);
  $('heroCity').textContent = data.name || '--';
  $('heroCountry').textContent = data.sys?.country || '--';
  $('heroDatetime').textContent = formatDate(data.dt || Date.now() / 1000, tz);
  $('heroTemp').textContent = `${Math.round(data.main.temp)}°`;
  $('heroIcon').textContent = emoji;
  $('heroBigIcon').textContent = emoji;
  $('heroDesc').textContent = weather.description;
  $('heroFeels').textContent = `${Math.round(data.main.feels_like)}°C`;
  $('heroHigh').textContent = `${Math.round(data.main.temp_max)}°C`;
  $('heroLow').textContent = `${Math.round(data.main.temp_min)}°C`;

  $('statHumidity').textContent = `${data.main.humidity}%`;
  $('statHumidityDesc').textContent = data.main.humidity > 70 ? 'High humidity' : data.main.humidity < 35 ? 'Dry air' : 'Comfortable';
  $('statWind').textContent = `${data.wind.speed} m/s`;
  $('statWindDir').textContent = `Direction ${windDirection(data.wind.deg)} (${data.wind.deg || 0}°)`;
  $('statPressure').textContent = `${data.main.pressure} hPa`;
  $('statPressureDesc').textContent = data.main.pressure < 1000 ? 'Low pressure' : data.main.pressure > 1020 ? 'High pressure' : 'Normal pressure';
  $('statVisibility').textContent = `${((data.visibility || 0) / 1000).toFixed(1)} km`;
  $('statVisibilityDesc').textContent = (data.visibility || 0) >= 8000 ? 'Clear view' : 'Reduced visibility';
  $('statSunrise').textContent = formatTime(data.sys.sunrise, tz);
  $('statSunset').textContent = formatTime(data.sys.sunset, tz);
  $('statLocalTime').textContent = formatTime(Math.floor(Date.now() / 1000), tz);
  $('statTimezone').textContent = `UTC${tz >= 0 ? '+' : ''}${(tz / 3600).toFixed(1)}`;

  renderAQI(aqi);
  renderHourly(forecast, tz);
  renderDaily(forecast, tz);
  renderChart(forecast, 'temperature');
  renderMiniBars(data);

  const temp = data.main.temp;
  if (temp >= 40) setAlert('Extreme heat warning. Stay hydrated and avoid direct sun.', 'warning');
  else if (weather.main === 'Thunderstorm') setAlert('Thunderstorm alert. Stay indoors if possible.', 'severe');
  else setAlert('', 'info');
}

function renderAQI(aqiData) {
  const aqi = aqiData?.list?.[0]?.main?.aqi || 0;
  const labels = ['Unknown', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
  const classes = ['', 'aqi-good', 'aqi-fair', 'aqi-moderate', 'aqi-poor', 'aqi-very-poor'];
  $('statAQI').textContent = aqi || '--';
  $('statAQILabel').textContent = labels[aqi] || 'Unknown';
  $('aqiBar').style.width = `${Math.min(aqi * 20, 100)}%`;
  $('aqiCard').className = `stat-card glass-card aqi-card ${classes[aqi] || ''}`;
}

function renderHourly(forecast, tz) {
  const wrap = $('hourlyScroll');
  wrap.innerHTML = '';
  (forecast.list || []).slice(0, 12).forEach((item, index) => {
    const div = document.createElement('div');
    div.className = `hour-item ${index === 0 ? 'active' : ''}`;
    div.setAttribute('role', 'listitem');
    div.innerHTML = `
      <div class="hour-time">${formatTime(item.dt, tz)}</div>
      <div class="hour-icon">${weatherEmoji(item.weather[0].id)}</div>
      <div class="hour-temp">${Math.round(item.main.temp)}°</div>
      <div class="hour-rain">${Math.round((item.pop || 0) * 100)}%</div>`;
    wrap.appendChild(div);
  });
}

function renderDaily(forecast, tz) {
  const byDay = {};
  (forecast.list || []).forEach(item => {
    const d = new Date((item.dt + tz) * 1000).toISOString().slice(0, 10);
    byDay[d] ||= [];
    byDay[d].push(item);
  });
  const grid = $('forecastGrid');
  grid.innerHTML = '';
  Object.values(byDay).slice(0, 5).forEach(items => {
    const temps = items.map(i => i.main.temp);
    const mid = items[Math.floor(items.length / 2)];
    const card = document.createElement('article');
    card.className = 'forecast-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="forecast-day">${formatDate(mid.dt, tz).split(',')[0]}</div>
      <div class="forecast-icon">${weatherEmoji(mid.weather[0].id)}</div>
      <div class="forecast-desc">${mid.weather[0].description}</div>
      <div class="forecast-temps"><span class="forecast-high">${Math.round(Math.max(...temps))}°</span><span class="forecast-low">${Math.round(Math.min(...temps))}°</span></div>
      <div class="forecast-rain">Rain ${Math.round(Math.max(...items.map(i => i.pop || 0)) * 100)}%</div>`;
    grid.appendChild(card);
  });
}

function renderChart(forecast, type = 'temperature') {
  const canvas = $('weatherChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const items = (forecast.list || []).slice(0, 8);
  const labels = items.map(i => formatTime(i.dt, forecast.city?.timezone || 0));
  const map = {
    temperature: { label: 'Temperature °C', data: items.map(i => Math.round(i.main.temp)) },
    humidity: { label: 'Humidity %', data: items.map(i => i.main.humidity) },
    wind: { label: 'Wind m/s', data: items.map(i => Number(i.wind.speed.toFixed(1))) }
  };
  if (weatherChart) weatherChart.destroy();
  weatherChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: map[type].label,
        data: map[type].data,
        tension: 0.35,
        fill: true,
        borderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') } } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted') }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted') }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
}

function renderMiniBars(data) {
  $('miniHumidity').innerHTML = `<div style="height:6px;border-radius:20px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${data.main.humidity}%;height:100%;background:var(--accent-cyan)"></div></div>`;
  const windWidth = Math.min(data.wind.speed * 8, 100);
  $('miniWind').innerHTML = `<div style="height:6px;border-radius:20px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${windWidth}%;height:100%;background:var(--accent-teal)"></div></div>`;
}

function renderHistory() {
  const chips = $('historyChips');
  chips.innerHTML = '';
  $('historyEmpty').style.display = recentSearches.length ? 'none' : 'block';
  recentSearches.forEach(city => {
    const chip = document.createElement('button');
    chip.className = 'history-chip';
    chip.innerHTML = `<span>↻</span>${city}`;
    chip.onclick = () => loadCity(city);
    chips.appendChild(chip);
  });
}

function renderFavorites() {
  const grid = $('favoritesGrid');
  grid.innerHTML = '';
  $('favoritesEmpty').style.display = favoriteCities.length ? 'none' : 'block';
  favoriteCities.forEach(city => {
    const card = document.createElement('div');
    card.className = 'fav-card';
    card.innerHTML = `<button class="fav-remove" aria-label="Remove favorite">×</button><div class="fav-card-city">${city}</div><div class="fav-card-country">Saved city</div><div class="fav-card-row"><span class="fav-card-icon">⭐</span><span class="fav-card-temp">Open</span></div><div class="fav-card-desc">Click to view weather</div>`;
    card.onclick = (e) => { if (!e.target.classList.contains('fav-remove')) loadCity(city); };
    card.querySelector('.fav-remove').onclick = (e) => {
      e.stopPropagation();
      favoriteCities = favoriteCities.filter(c => c !== city);
      localStorage.setItem('cv_favorites', JSON.stringify(favoriteCities));
      renderFavorites();
    };
    grid.appendChild(card);
  });
}

function renderCompare() {
  const grid = $('compareGrid');
  grid.innerHTML = '';
  $('compareEmpty').style.display = compareCities.length ? 'none' : 'block';
  compareCities.forEach(item => {
    const d = item.data;
    const card = document.createElement('div');
    card.className = 'compare-card';
    card.innerHTML = `<button class="compare-remove" aria-label="Remove">×</button><div class="compare-card-city">${d.name}</div><div class="compare-card-country">${d.sys.country}</div><div class="compare-card-temp">${Math.round(d.main.temp)}°</div><div class="compare-card-desc">${d.weather[0].description}</div><div class="compare-card-meta"><span>💧 <strong>${d.main.humidity}%</strong></span><span>💨 <strong>${d.wind.speed} m/s</strong></span></div>`;
    card.querySelector('.compare-remove').onclick = () => {
      compareCities = compareCities.filter(c => c.name !== item.name);
      localStorage.setItem('cv_compare', JSON.stringify(compareCities));
      renderCompare();
    };
    grid.appendChild(card);
  });
}

// 8) CORE LOADERS
async function loadCity(city) {
  try {
    setLoading(true);
    currentCity = city.trim();
    currentWeather = await getWeatherByCity(currentCity);
    const { lat, lon } = currentWeather.coord;
    currentForecast = await getForecast(lat, lon);
    currentAQI = await getAQI(lat, lon);
    renderCurrentWeather(currentWeather, currentForecast, currentAQI);
    addHistory(currentWeather.name);
    setLoading(false);
    startAutoRefresh();
    if (!hasApiKey()) showToast('Demo mode: add OpenWeatherMap API key in script.js for live data.', 'warning');
  } catch (err) {
    setLoading(false);
    showToast(err.message, 'error');
  }
}

async function loadByLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported in this browser.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      setLoading(true);
      const { latitude, longitude } = pos.coords;
      currentWeather = await getWeatherByCoords(latitude, longitude);
      currentForecast = await getForecast(currentWeather.coord.lat, currentWeather.coord.lon);
      currentAQI = await getAQI(currentWeather.coord.lat, currentWeather.coord.lon);
      currentCity = currentWeather.name;
      renderCurrentWeather(currentWeather, currentForecast, currentAQI);
      addHistory(currentCity);
      setLoading(false);
      startAutoRefresh();
    } catch (err) {
      setLoading(false);
      showToast(err.message, 'error');
    }
  }, () => showToast('Location permission denied.', 'error'));
}

function addHistory(city) {
  recentSearches = [city, ...recentSearches.filter(c => c.toLowerCase() !== city.toLowerCase())].slice(0, 8);
  localStorage.setItem('cv_history', JSON.stringify(recentSearches));
  renderHistory();
}

// 9) SEARCH AND EVENTS
function setupSearch() {
  const input = $('searchInput');
  const suggestions = $('searchSuggestions');
  let searchTimeout = null;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    $('searchClear').style.display = q ? 'flex' : 'none';
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      suggestions.innerHTML = '';
      if (q.length < 2) { suggestions.style.display = 'none'; return; }
      const results = await getSuggestions(q);
      results.forEach(item => {
        const li = document.createElement('li');
        li.className = 'suggestion-item';
        li.innerHTML = `📍 ${item.name}${item.state ? ', ' + item.state : ''}${item.country ? ' · ' + item.country : ''}`;
        li.onclick = () => { input.value = item.name; suggestions.style.display = 'none'; loadCity(item.name); };
        suggestions.appendChild(li);
      });
      suggestions.style.display = results.length ? 'block' : 'none';
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      suggestions.style.display = 'none';
      loadCity(input.value.trim());
    }
  });

  $('searchClear').onclick = () => { input.value = ''; $('searchClear').style.display = 'none'; suggestions.style.display = 'none'; input.focus(); };
  document.addEventListener('click', (e) => { if (!$('searchBar').contains(e.target)) suggestions.style.display = 'none'; });
}

function setupButtons() {
  $('locationBtn').onclick = loadByLocation;
  $('refreshBtn').onclick = () => { $('refreshBtn').classList.add('spinning'); loadCity(currentCity).finally(() => setTimeout(() => $('refreshBtn').classList.remove('spinning'), 700)); };
  $('themeToggle').onclick = () => {
    const html = document.documentElement;
    const next = html.dataset.theme === 'light' ? 'dark' : 'light';
    html.dataset.theme = next;
    localStorage.setItem('cv_theme', next);
    const moon = document.querySelector('.icon-moon');
    const sun = document.querySelector('.icon-sun');
    if (moon && sun) { moon.style.display = next === 'light' ? 'none' : 'block'; sun.style.display = next === 'light' ? 'block' : 'none'; }
    if (currentForecast) renderChart(currentForecast, document.querySelector('.chart-tab.active')?.dataset.chart || 'temperature');
  };
  $('addFavoriteBtn').onclick = () => {
    if (!currentCity) return;
    if (!favoriteCities.includes(currentCity)) favoriteCities.unshift(currentCity);
    favoriteCities = favoriteCities.slice(0, 10);
    localStorage.setItem('cv_favorites', JSON.stringify(favoriteCities));
    renderFavorites();
    showToast(`${currentCity} added to favorites.`, 'success');
  };
  $('clearHistoryBtn').onclick = () => { recentSearches = []; localStorage.removeItem('cv_history'); renderHistory(); };
  $('compareAddBtn').onclick = addCompareCity;
  $('compareInput').addEventListener('keydown', e => { if (e.key === 'Enter') addCompareCity(); });
  document.querySelectorAll('.chart-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.chart-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      if (currentForecast) renderChart(currentForecast, btn.dataset.chart);
    };
  });
}

async function addCompareCity() {
  const city = $('compareInput').value.trim();
  if (!city) return;
  if (compareCities.length >= 4) { showToast('Maximum 4 cities can be compared.', 'warning'); return; }
  try {
    const data = await getWeatherByCity(city);
    if (!compareCities.some(c => c.name.toLowerCase() === data.name.toLowerCase())) {
      compareCities.push({ name: data.name, data });
      localStorage.setItem('cv_compare', JSON.stringify(compareCities));
      renderCompare();
    }
    $('compareInput').value = '';
  } catch (err) { showToast(err.message, 'error'); }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  clearInterval(countdownTimer);
  countdownValue = AUTO_REFRESH_SECONDS;
  refreshTimer = setInterval(() => loadCity(currentCity), AUTO_REFRESH_SECONDS * 1000);
  countdownTimer = setInterval(() => {
    countdownValue -= 1;
    if (countdownValue <= 0) countdownValue = AUTO_REFRESH_SECONDS;
    const min = String(Math.floor(countdownValue / 60)).padStart(2, '0');
    const sec = String(countdownValue % 60).padStart(2, '0');
    if ($('refreshCountdown')) $('refreshCountdown').textContent = `${min}:${sec}`;
  }, 1000);
}

function setupCanvas() {
  const canvas = $('weatherCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const drops = [];
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 70; i++) drops.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 2 + 0.5, s: Math.random() * 0.5 + 0.2 });
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = document.documentElement.dataset.theme === 'light' ? 'rgba(41,121,255,.18)' : 'rgba(0,229,255,.18)';
    drops.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      p.y -= p.s; p.x += Math.sin(p.y * 0.01) * 0.15;
      if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
    });
    requestAnimationFrame(animate);
  }
  animate();
}

// 10) INIT
function init() {
  const savedTheme = localStorage.getItem('cv_theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  setupCanvas();
  setupSearch();
  setupButtons();
  renderHistory();
  renderFavorites();
  renderCompare();
  loadCity(currentCity);
}

document.addEventListener('DOMContentLoaded', init);
