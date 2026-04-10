const STORAGE_KEY = "masters-saturday-charge-state-v1";
const SETTINGS_KEY = "masters-saturday-charge-settings-v1";
const SALARY_CAP = 100;
const ROSTER_SIZE = 5;
const AUTO_REFRESH_MS = 60_000;

const DEFAULT_HOLE_VALUES = {
  1: 0.236,
  2: -0.23,
  3: 0.071,
  4: 0.282,
  5: 0.267,
  6: 0.135,
  7: 0.156,
  8: -0.187,
  9: 0.133,
  10: 0.296,
  11: 0.303,
  12: 0.267,
  13: -0.225,
  14: 0.162,
  15: -0.219,
  16: 0.138,
  17: 0.164,
  18: 0.232,
};

const SAMPLE_DATA = {
  sourceLabel: "Using bundled sample data",
  holeValues: DEFAULT_HOLE_VALUES,
  players: [
    { id: "mcilroy", name: "Rory McIlroy", currentScore: -8, currentHole: 14, finished: false },
    { id: "scheffler", name: "Scottie Scheffler", currentScore: -7, currentHole: 13, finished: false },
    { id: "fitzpatrick", name: "Matt Fitzpatrick", currentScore: -6, currentHole: 12, finished: false },
    { id: "dechambeau", name: "Bryson DeChambeau", currentScore: -5, currentHole: 15, finished: false },
    { id: "rahm", name: "Jon Rahm", currentScore: -5, currentHole: 11, finished: false },
    { id: "homa", name: "Max Homa", currentScore: -4, currentHole: 16, finished: false },
    { id: "a-berg", name: "Ludvig Aberg", currentScore: -4, currentHole: 10, finished: false },
    { id: "matsuyama", name: "Hideki Matsuyama", currentScore: -3, currentHole: 18, finished: true },
    { id: "fleetwood", name: "Tommy Fleetwood", currentScore: -2, currentHole: 13, finished: false },
    { id: "young", name: "Cameron Young", currentScore: -1, currentHole: 18, finished: true },
    { id: "day", name: "Jason Day", currentScore: -1, currentHole: 9, finished: false },
    { id: "harman", name: "Brian Harman", currentScore: 0, currentHole: 12, finished: false },
  ],
};

const state = {
  players: [],
  holeValues: { ...DEFAULT_HOLE_VALUES },
  pars: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4],
  selectedIds: [],
  locked: false,
  lockedAt: null,
  lockedRosterSnapshot: {},
  lastUpdated: null,
  endpoint: "./live.json",
  warning: "",
  sourceLabel: "Using bundled sample data",
  searchTerm: "",
};

const elements = {
  pageShell: document.getElementById("page-shell"),
  budgetTotal: document.getElementById("budget-total"),
  budgetUsed: document.getElementById("budget-used"),
  budgetRemaining: document.getElementById("budget-remaining"),
  rosterCount: document.getElementById("roster-count"),
  rosterHeading: document.getElementById("roster-heading"),
  lockStatus: document.getElementById("lock-status"),
  lastUpdated: document.getElementById("last-updated"),
  playerSearch: document.getElementById("player-search"),
  rosterList: document.getElementById("roster-list"),
  teamScore: document.getElementById("team-score"),
  lockButton: document.getElementById("lock-button"),
  lockMessage: document.getElementById("lock-message"),
  refreshButton: document.getElementById("refresh-button"),
  resetButton: document.getElementById("reset-button"),
  tableBody: document.getElementById("player-table-body"),
  endpointInput: document.getElementById("endpoint-input"),
  saveEndpointButton: document.getElementById("save-endpoint-button"),
  dataSourceLabel: document.getElementById("data-source-label"),
  dataWarning: document.getElementById("data-warning"),
};

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "--";
  }
  if (score === 0) {
    return "E";
  }
  return score > 0 ? `+${score}` : `${score}`;
}

function formatMoney(value) {
  return `$${value}`;
}

function getRemainingHoles(player) {
  if (Array.isArray(player.remainingHoles)) {
    return player.remainingHoles;
  }

  if (player.finished || player.currentHole >= 18) {
    return [];
  }

  const currentHole = Math.max(0, Number(player.currentHole) || 0);
  const holes = [];
  for (let hole = currentHole + 1; hole <= 18; hole += 1) {
    holes.push(hole);
  }
  return holes;
}

function getExpectedRemainingValue(player, holeValues) {
  const remainingHoles = getRemainingHoles(player);
  return remainingHoles.reduce((sum, hole) => sum + Number(holeValues[hole] || 0), 0);
}

function enrichPlayer(player, holeValues) {
  const expectedRemaining = getExpectedRemainingValue(player, holeValues);
  const expectedScore = Number((player.currentScore + expectedRemaining).toFixed(2));
  const price = Math.round(4 + 13 * (1.105 ** (-expectedScore)));

  return {
    ...player,
    remainingHoles: getRemainingHoles(player),
    expectedRemaining,
    expectedScore,
    price,
  };
}

function loadStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Array.isArray(saved.selectedIds)) {
      state.selectedIds = saved.selectedIds;
    }
    if (typeof saved.locked === "boolean") {
      state.locked = saved.locked;
    }
    if (saved.lockedAt) {
      state.lockedAt = saved.lockedAt;
    }
    if (saved.lockedRosterSnapshot && typeof saved.lockedRosterSnapshot === "object") {
      state.lockedRosterSnapshot = saved.lockedRosterSnapshot;
    }
  } catch (error) {
    console.warn("Could not load saved state", error);
  }

  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof settings.endpoint === "string") {
      state.endpoint = settings.endpoint;
    }
  } catch (error) {
    console.warn("Could not load settings", error);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedIds: state.selectedIds,
      locked: state.locked,
      lockedAt: state.lockedAt,
      lockedRosterSnapshot: state.lockedRosterSnapshot,
    }),
  );
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      endpoint: state.endpoint,
    }),
  );
}

async function fetchLiveData() {
  if (!state.endpoint) {
    return {
      ...SAMPLE_DATA,
      sourceLabel: "Using bundled sample data",
    };
  }

  const response = await fetch(state.endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Live data request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.players)) {
    throw new Error("Endpoint must return a JSON object with a players array");
  }

  return {
    sourceLabel: `Live endpoint: ${state.endpoint}`,
    holeValues: payload.holeValues || DEFAULT_HOLE_VALUES,
    pars: payload.pars,
    players: payload.players,
  };
}

async function refreshData() {
  try {
    const payload = await fetchLiveData();
    state.warning = "";
    state.sourceLabel = payload.sourceLabel;
    state.holeValues = { ...DEFAULT_HOLE_VALUES, ...(payload.holeValues || {}) };
    state.pars = Array.isArray(payload.pars) && payload.pars.length ? payload.pars : state.pars;
    state.players = payload.players
      .map((player) => normalizePlayer(player))
      .map((player) => enrichPlayer(player, state.holeValues))
      .sort((a, b) => a.expectedScore - b.expectedScore || a.name.localeCompare(b.name));
  } catch (error) {
    console.error(error);
    state.warning = `${error.message}. Falling back to bundled sample data.`;
    state.sourceLabel = "Using bundled sample data";
    state.holeValues = { ...DEFAULT_HOLE_VALUES };
    state.pars = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
    state.players = SAMPLE_DATA.players
      .map(normalizePlayer)
      .map((player) => enrichPlayer(player, state.holeValues))
      .sort((a, b) => a.expectedScore - b.expectedScore || a.name.localeCompare(b.name));
  }

  state.lastUpdated = new Date();
  render();
}

function normalizePlayer(player) {
  return {
    id: String(player.id),
    name: player.name,
    currentScore: Number(player.currentScore),
    currentHole: Number(player.currentHole || 0),
    finished: Boolean(player.finished),
    position: player.position || "",
    thru: player.thru || "",
    currentRound: player.currentRound || null,
    roundScores: Array.isArray(player.roundScores) ? player.roundScores : [],
    remainingHoles: Array.isArray(player.remainingHoles) ? player.remainingHoles.map(Number) : undefined,
  };
}

function buildScorecardMarkup(player) {
  if (!state.locked || !Array.isArray(player.roundScores) || !player.roundScores.length) {
    return "";
  }

  const renderSegment = (start, end, label) => {
    const cells = [];
    for (let hole = start; hole <= end; hole += 1) {
      const par = state.pars[hole - 1];
      const score = player.roundScores[hole - 1];
      let tone = "pending";
      let shapeClass = "";
      if (score !== null && score !== undefined) {
        const delta = score - par;
        if (delta <= -2) {
          tone = "eagle";
          shapeClass = "score-mark-double-circle";
        } else if (delta === -1) {
          tone = "birdie";
          shapeClass = "score-mark-circle";
        } else if (delta === 0) {
          tone = "par";
        } else if (delta === 1) {
          tone = "bogey";
          shapeClass = "score-mark-square";
        } else {
          tone = "double";
          shapeClass = "score-mark-double-square";
        }
      }
      cells.push(`
        <div class="score-hole score-hole-${tone}">
          <span class="score-hole-number">${hole}</span>
          <strong class="score-mark ${shapeClass}">${score ?? "-"}</strong>
        </div>
      `);
    }
    return `
      <div class="scorecard-segment">
        <span class="scorecard-label">${label}</span>
        <div class="scorecard-grid">${cells.join("")}</div>
      </div>
    `;
  };

  return `<div class="scorecard">${renderSegment(1, 9, "OUT")}${renderSegment(10, 18, "IN")}</div>`;
}

function getSelectedPlayers() {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  return state.selectedIds
    .map((id) => byId.get(id))
    .filter(Boolean);
}

function getLockedPrice(player) {
  return state.lockedRosterSnapshot[player.id]?.price ?? player.price;
}

function getSpent() {
  return getSelectedPlayers().reduce((sum, player) => sum + (state.locked ? getLockedPrice(player) : player.price), 0);
}

function canAddPlayer(playerId) {
  return !state.locked && !state.selectedIds.includes(playerId) && state.selectedIds.length < ROSTER_SIZE;
}

function togglePlayer(playerId) {
  if (state.locked) {
    return;
  }

  if (state.selectedIds.includes(playerId)) {
    state.selectedIds = state.selectedIds.filter((id) => id !== playerId);
  } else if (state.selectedIds.length < ROSTER_SIZE) {
    state.selectedIds = [...state.selectedIds, playerId];
  }

  saveState();
  render();
}

function removePlayer(playerId) {
  if (state.locked) {
    return;
  }

  state.selectedIds = state.selectedIds.filter((id) => id !== playerId);
  saveState();
  render();
}

function lockRoster() {
  const spent = getSpent();
  if (state.selectedIds.length !== ROSTER_SIZE || spent > SALARY_CAP) {
    return;
  }

  const selectedPlayers = getSelectedPlayers();
  state.lockedRosterSnapshot = Object.fromEntries(
    selectedPlayers.map((player) => [
      player.id,
      {
        price: player.price,
        expectedScore: player.expectedScore,
        lockedAt: new Date().toISOString(),
      },
    ]),
  );
  state.locked = true;
  state.lockedAt = new Date().toISOString();
  saveState();
  render();
}

function resetRoster() {
  state.selectedIds = [];
  state.locked = false;
  state.lockedAt = null;
  state.lockedRosterSnapshot = {};
  saveState();
  render();
}

function getTeamScore() {
  const selected = getSelectedPlayers();
  if (!selected.length) {
    return null;
  }

  return selected.reduce((sum, player) => sum + player.currentScore, 0);
}

function renderRoster() {
  const selected = getSelectedPlayers();
  elements.rosterList.innerHTML = "";

  if (!selected.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No golfers selected yet.";
    elements.rosterList.appendChild(empty);
    return;
  }

  selected.forEach((player) => {
    const item = document.createElement("li");
    item.className = "roster-item";

    const main = document.createElement("div");
    main.className = "roster-main";
    const displayPrice = state.locked ? getLockedPrice(player) : player.price;
    const thruLabel = player.finished ? "F" : player.currentHole || "--";
    const positionLabel = player.position || "--";
    main.innerHTML = `
      <span class="roster-name">${player.name}</span>
      <span class="roster-meta">${state.locked ? "" : "Selected golfer"}</span>
      <div class="roster-metrics">
        <div>
          <span>Score</span>
          <strong>${formatScore(player.currentScore)}</strong>
        </div>
        <div>
          <span>Thru</span>
          <strong>${thruLabel}</strong>
        </div>
        <div>
          <span>Position</span>
          <strong>${positionLabel}</strong>
        </div>
        <div>
          <span>Price</span>
          <strong>${formatMoney(displayPrice)}</strong>
        </div>
      </div>
      ${buildScorecardMarkup(player)}
    `;

    item.appendChild(main);

    if (!state.locked) {
      const removeButton = document.createElement("button");
      removeButton.className = "chip-button remove";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => removePlayer(player.id));
      item.appendChild(removeButton);
    }

    elements.rosterList.appendChild(item);
  });
}

function renderBoard() {
  const selectedSet = new Set(state.selectedIds);
  elements.tableBody.innerHTML = "";

  const normalizedSearch = state.searchTerm.trim().toLowerCase();
  const visiblePlayers = normalizedSearch
    ? state.players.filter((player) => player.name.toLowerCase().includes(normalizedSearch))
    : state.players;

  visiblePlayers.forEach((player) => {
    const card = document.createElement("article");
    card.className = `player-card ${selectedSet.has(player.id) ? "is-selected" : ""}`;
    const displayPrice = state.locked && selectedSet.has(player.id) ? getLockedPrice(player) : player.price;
    card.innerHTML = `
      <div class="player-card-head">
        <div>
          <span class="player-name">${player.name}</span>
          <div class="player-subline">${player.finished ? "Finished for the day" : `${player.remainingHoles.length} holes left`}</div>
        </div>
        <span class="player-price">${formatMoney(displayPrice)}</span>
      </div>
      <div class="player-metrics">
        <div>
          <span>Score</span>
          <strong>${formatScore(player.currentScore)}</strong>
        </div>
        <div>
          <span>Thru</span>
          <strong>${player.finished ? "F" : player.currentHole || "--"}</strong>
        </div>
        <div>
          <span>Expected</span>
          <strong>${formatScore(player.expectedScore)}</strong>
        </div>
      </div>
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip-button ${selectedSet.has(player.id) ? "remove" : ""}`;

    if (selectedSet.has(player.id)) {
      button.textContent = state.locked ? "Rostered" : "Selected";
      button.disabled = state.locked;
      if (!state.locked) {
        button.addEventListener("click", () => togglePlayer(player.id));
      }
    } else {
      button.textContent = "Add";
      button.disabled = !canAddPlayer(player.id);
      button.addEventListener("click", () => togglePlayer(player.id));
    }

    card.appendChild(button);
    elements.tableBody.appendChild(card);
  });

  if (!visiblePlayers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No golfers match that search.";
    elements.tableBody.appendChild(empty);
  }
}

function renderSummary() {
  const spent = getSpent();
  const remaining = SALARY_CAP - spent;
  const teamScore = getTeamScore();

  elements.budgetTotal.textContent = formatMoney(SALARY_CAP);
  elements.budgetUsed.textContent = formatMoney(spent);
  elements.budgetRemaining.textContent = formatMoney(remaining);
  elements.rosterCount.textContent = state.locked ? "Locked" : `${state.selectedIds.length} / ${ROSTER_SIZE}`;
  elements.lockStatus.textContent = state.locked ? "Locked" : "Drafting";
  elements.teamScore.textContent = teamScore === null ? "--" : formatScore(teamScore);
  elements.lastUpdated.textContent = state.lastUpdated
    ? state.lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "Not loaded";
  elements.dataSourceLabel.textContent = state.sourceLabel;
  elements.dataWarning.textContent = state.warning;
  elements.endpointInput.value = state.endpoint;
  elements.playerSearch.value = state.searchTerm;
  elements.pageShell.classList.toggle("is-locked", state.locked);
  elements.rosterHeading.textContent = "Your Team";

  const canLock = !state.locked && state.selectedIds.length === ROSTER_SIZE && remaining >= 0;
  elements.lockButton.disabled = !canLock;
  elements.lockButton.textContent = state.locked ? "Roster Locked" : "Lock Roster";

  if (state.locked) {
    elements.lockMessage.textContent = state.lockedAt
      ? `Locked at ${new Date(state.lockedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
      : "Roster locked.";
  } else if (state.selectedIds.length < ROSTER_SIZE) {
    elements.lockMessage.textContent = `Pick ${ROSTER_SIZE - state.selectedIds.length} more golfer${ROSTER_SIZE - state.selectedIds.length === 1 ? "" : "s"} to lock your roster.`;
  } else if (remaining < 0) {
    elements.lockMessage.textContent = `You are ${formatMoney(Math.abs(remaining))} over the cap.`;
  } else {
    elements.lockMessage.textContent = "Roster is valid and ready to lock.";
  }
}

function render() {
  renderSummary();
  renderRoster();
  renderBoard();
}

function handleSaveEndpoint() {
  state.endpoint = elements.endpointInput.value.trim();
  saveSettings();
  refreshData();
}

function startAutoRefresh() {
  window.setInterval(() => {
    refreshData();
  }, AUTO_REFRESH_MS);
}

elements.lockButton.addEventListener("click", lockRoster);
elements.resetButton.addEventListener("click", resetRoster);
elements.refreshButton.addEventListener("click", refreshData);
elements.saveEndpointButton.addEventListener("click", handleSaveEndpoint);
elements.playerSearch.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderBoard();
});

loadStoredState();
refreshData();
startAutoRefresh();
