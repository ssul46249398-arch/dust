// 같은 사이트의 서버 함수에서 대기질을 받아 신호등·카드·차트를 갱신합니다.
const regionSelect = document.querySelector("#region-select");
const averageTitle = document.querySelector("#summary-title");
const averageValue = document.querySelector("#average-value");
const averageNote = document.querySelector("#average-note");
const signal = document.querySelector(".air-signal");
const signalEmoji = document.querySelector("#signal-emoji");
const signalLabel = document.querySelector("#signal-label");
const healthAdvice = document.querySelector("#health-advice");
const stationCount = document.querySelector("#station-count");
const statusMessage = document.querySelector("#status-message");
const stationSearch = document.querySelector("#station-search");
const stationList = document.querySelector("#station-list");
const chartCanvas = document.querySelector("#station-chart");
const chartFallback = document.querySelector("#chart-fallback");

const gradeLabels = {
  "1": "좋음",
  "2": "보통",
  "3": "나쁨",
  "4": "매우 나쁨"
};
const signalLevels = [
  { max: 30, grade: "1", label: "좋음", emoji: "🔵", className: "good" },
  { max: 80, grade: "2", label: "보통", emoji: "🟢", className: "normal" },
  { max: 150, grade: "3", label: "나쁨", emoji: "🟠", className: "bad" },
  { max: Infinity, grade: "4", label: "매우 나쁨", emoji: "🔴", className: "very-bad" }
];
let currentStations = [];
let currentChart;
let latestRequest = 0;

function isMeasured(value) {
  return value !== undefined && value !== null && value !== "" && value !== "-";
}

function getSignalLevel(value) {
  return signalLevels.find((level) => value <= level.max);
}

function createMeasurement(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "measurement";

  const name = document.createElement("span");
  name.textContent = label;

  const result = document.createElement("strong");
  if (!isMeasured(value) || !Number.isFinite(Number(value))) {
    result.className = "unmeasured";
    result.textContent = "측정 안 됨";
  } else {
    result.textContent = value;
    const unit = document.createElement("small");
    unit.textContent = "㎍/㎥";
    result.append(unit);
  }

  wrapper.append(name, result);
  return wrapper;
}

function createStationCard(station) {
  const card = document.createElement("article");
  const grade = String(station.pm10Grade ?? "").trim();
  const knownGrade = Object.hasOwn(gradeLabels, grade);
  card.className = `station-card ${knownGrade ? `grade-${grade}` : "grade-unknown"}`;

  const heading = document.createElement("div");
  heading.className = "card-heading";

  const stationName = document.createElement("h3");
  stationName.textContent = station.stationName || "이름 없는 측정소";

  const badge = document.createElement("span");
  badge.className = "grade-label";
  badge.textContent = knownGrade ? gradeLabels[grade] : "등급 정보 없음";
  heading.append(stationName, badge);

  const measurements = document.createElement("div");
  measurements.className = "measurements";
  measurements.append(
    createMeasurement("미세먼지", station.pm10Value),
    createMeasurement("초미세먼지", station.pm25Value)
  );

  const time = document.createElement("p");
  time.className = "measured-at";
  time.textContent = `측정 시각 · ${station.dataTime || "정보 없음"}`;
  card.append(heading, measurements, time);
  return card;
}

function renderSignal(average) {
  signal.className = "air-signal";
  healthAdvice.textContent = "측정 정보를 확인할 수 없습니다.";
  if (!Number.isFinite(average)) {
    signalEmoji.textContent = "⚪";
    signalLabel.textContent = "등급 정보 없음";
    return;
  }

  const level = getSignalLevel(average);
  signal.classList.add(level.className);
  signalEmoji.textContent = level.emoji;
  signalLabel.textContent = level.label;
  healthAdvice.textContent = average > 80
    ? "미세먼지가 나쁨 수준입니다. 외출 시 마스크를 챙기세요."
    : "오늘도 대기질을 확인하고 건강하게 보내세요.";
}

function renderChart(items) {
  const topStations = items
    .filter((station) => isMeasured(station.pm10Value))
    .map((station) => ({ ...station, pm10Number: Number(station.pm10Value) }))
    .filter((station) => Number.isFinite(station.pm10Number))
    .sort((a, b) => b.pm10Number - a.pm10Number)
    .slice(0, 10);

  if (currentChart) {
    currentChart.destroy();
    currentChart = undefined;
  }
  chartFallback.hidden = true;
  if (topStations.length === 0) {
    chartFallback.hidden = false;
    chartFallback.textContent = "그래프에 표시할 미세먼지 측정값이 없습니다.";
    return;
  }
  if (typeof Chart !== "function") {
    chartFallback.hidden = false;
    chartFallback.textContent = "그래프를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.";
    return;
  }

  const colors = topStations.map((station) => {
    const grade = String(station.pm10Grade ?? "").trim();
    return ({
      "1": "#4386e8",
      "2": "#39a879",
      "3": "#e69b36",
      "4": "#df5a5a"
    })[grade] || "#929aaa";
  });
  currentChart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels: topStations.map((station) => station.stationName || "이름 없는 측정소"),
      datasets: [{
        data: topStations.map((station) => station.pm10Number),
        backgroundColor: colors,
        borderRadius: 7,
        barThickness: 22
      }]
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${context.parsed.x} ㎍/㎥` } }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "미세먼지 (㎍/㎥)" },
          ticks: { precision: 0 }
        },
        y: { grid: { display: false } }
      }
    }
  });
  chartCanvas.parentElement.style.height = `${Math.max(190, topStations.length * 48 + 72)}px`;
}

function renderStations(items, region) {
  currentStations = items;
  averageTitle.textContent = `${region} 평균 미세먼지`;
  stationCount.textContent = `측정소 ${items.length}곳`;
  const pm10Values = items
    .filter((item) => isMeasured(item.pm10Value))
    .map((item) => Number(item.pm10Value))
    .filter(Number.isFinite);

  if (pm10Values.length > 0) {
    const average = pm10Values.reduce((sum, value) => sum + value, 0) / pm10Values.length;
    averageValue.textContent = average.toFixed(1);
    averageNote.textContent = `측정값이 있는 ${pm10Values.length}개 측정소의 평균입니다.`;
    renderSignal(average);
  } else {
    averageValue.textContent = "측정 안 됨";
    averageNote.textContent = "평균을 계산할 수 있는 측정값이 없습니다.";
    renderSignal(NaN);
  }

  stationSearch.value = "";
  updateStationCards();
  renderChart(items);
}

function updateStationCards() {
  const query = stationSearch.value.trim().toLocaleLowerCase("ko");
  const visibleStations = currentStations.filter((station) =>
    String(station.stationName || "").toLocaleLowerCase("ko").includes(query)
  );
  const fragment = document.createDocumentFragment();
  visibleStations.forEach((station) => fragment.append(createStationCard(station)));
  stationList.replaceChildren(fragment);
  statusMessage.hidden = visibleStations.length > 0;
  statusMessage.textContent = currentStations.length === 0
    ? "표시할 측정소 정보가 없습니다."
    : "검색 결과가 없습니다.";
}

async function loadAirQuality() {
  const requestId = ++latestRequest;
  const region = regionSelect.value;
  averageTitle.textContent = `${region} 평균 미세먼지`;
  averageValue.textContent = "불러오는 중";
  averageNote.textContent = "측정소 자료를 불러오고 있습니다.";
  signal.className = "air-signal";
  signalEmoji.textContent = "⏳";
  signalLabel.textContent = "불러오는 중";
  healthAdvice.textContent = "측정 정보를 확인하고 있습니다.";
  stationCount.textContent = "";
  stationList.replaceChildren();
  currentStations = [];
  statusMessage.hidden = false;
  statusMessage.textContent = "정보를 불러오는 중입니다.";
  chartFallback.hidden = false;
  chartFallback.textContent = "그래프 자료를 불러오는 중입니다.";
  if (currentChart) {
    currentChart.destroy();
    currentChart = undefined;
  }

  try {
    const response = await fetch(`/api/dust?sido=${encodeURIComponent(region)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "대기 정보를 불러오지 못했습니다.");
    }
    if (requestId !== latestRequest) {
      return;
    }

    const rawItems = data.response?.body?.items;
    const entries = Array.isArray(rawItems) ? rawItems : rawItems?.item;
    const items = entries ? (Array.isArray(entries) ? entries : [entries]) : [];
    renderStations(items, region);
  } catch (error) {
    if (requestId !== latestRequest) {
      return;
    }
    averageValue.textContent = "오류";
    averageNote.textContent = "측정 정보를 불러오지 못했습니다.";
    signal.className = "air-signal";
    signalEmoji.textContent = "⚪";
    signalLabel.textContent = "정보 없음";
    healthAdvice.textContent = "잠시 후 다시 시도해 주세요.";
    stationCount.textContent = "";
    stationList.replaceChildren();
    statusMessage.hidden = false;
    statusMessage.textContent = error instanceof Error
      ? error.message
      : "측정 정보를 불러오지 못했습니다.";
    chartFallback.hidden = false;
    chartFallback.textContent = "그래프 자료를 표시할 수 없습니다.";
  }
}

regionSelect.addEventListener("change", loadAirQuality);
stationSearch.addEventListener("input", updateStationCards);
loadAirQuality();
