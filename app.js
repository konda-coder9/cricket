const STORAGE_KEY = "cricket-scorer-state-v1";
const MATCHES_STORAGE_KEY = "cricket-scorer-saved-matches-v1";
const SYNC_SETTINGS_KEY = "cricket-scorer-sync-settings-v1";
const MATCHES_SCHEMA_VERSION = 1;
const CLOUD_SYNC_TABLE = "cricket_match_bundles";
const CLOUD_SYNC_DEBOUNCE_MS = 700;
const SUPABASE_CONFIG =
  window.CRICKET_SUPABASE_CONFIG && typeof window.CRICKET_SUPABASE_CONFIG === "object"
    ? window.CRICKET_SUPABASE_CONFIG
    : {};
const SUPABASE_URL = typeof SUPABASE_CONFIG.url === "string" ? SUPABASE_CONFIG.url.trim() : "";
const SUPABASE_ANON_KEY =
  typeof SUPABASE_CONFIG.anonKey === "string" ? SUPABASE_CONFIG.anonKey.trim() : "";

const elements = {
  savedMatchesTabs: document.getElementById("savedMatchesTabs"),
  editMatchesBtn: document.getElementById("editMatchesBtn"),
  newMatchBtn: document.getElementById("newMatchBtn"),
  syncSpace: document.getElementById("syncSpace"),
  connectSyncBtn: document.getElementById("connectSyncBtn"),
  pullSyncBtn: document.getElementById("pullSyncBtn"),
  disconnectSyncBtn: document.getElementById("disconnectSyncBtn"),
  syncStatus: document.getElementById("syncStatus"),
  setupForm: document.getElementById("setupForm"),
  matchType: document.getElementById("matchType"),
  nameFieldLabel: document.getElementById("nameFieldLabel"),
  tournamentName: document.getElementById("tournamentName"),
  teamOneName: document.getElementById("teamOneName"),
  teamTwoName: document.getElementById("teamTwoName"),
  teamOnePlayers: document.getElementById("teamOnePlayers"),
  teamTwoPlayers: document.getElementById("teamTwoPlayers"),
  overs: document.getElementById("overs"),
  wicketsLimit: document.getElementById("wicketsLimit"),
  targetRuns: document.getElementById("targetRuns"),
  tossWinner: document.getElementById("tossWinner"),
  tossDecision: document.getElementById("tossDecision"),
  strikerName: document.getElementById("strikerName"),
  nonStrikerName: document.getElementById("nonStrikerName"),
  bowlerName: document.getElementById("bowlerName"),
  inningsPreview: document.getElementById("inningsPreview"),
  resumeSaved: document.getElementById("resumeSaved"),

  matchTitle: document.getElementById("matchTitle"),
  inningsState: document.getElementById("inningsState"),
  mainScore: document.getElementById("mainScore"),
  oversDisplay: document.getElementById("oversDisplay"),
  runRate: document.getElementById("runRate"),
  extrasDisplay: document.getElementById("extrasDisplay"),
  requiredDisplay: document.getElementById("requiredDisplay"),
  strikerDisplay: document.getElementById("strikerDisplay"),
  nonStrikerDisplay: document.getElementById("nonStrikerDisplay"),
  bowlerDisplay: document.getElementById("bowlerDisplay"),
  thisOver: document.getElementById("thisOver"),
  ballLog: document.getElementById("ballLog"),

  byeRuns: document.getElementById("byeRuns"),
  nextBatter: document.getElementById("nextBatter"),
  bowlerInput: document.getElementById("bowlerInput"),
  bowlerModal: document.getElementById("bowlerModal"),
  bowlerModalInfo: document.getElementById("bowlerModalInfo"),
  overBowlerSelect: document.getElementById("overBowlerSelect"),
  confirmOverBowler: document.getElementById("confirmOverBowler"),
  previousBallInfo: document.getElementById("previousBallInfo"),
  editBallType: document.getElementById("editBallType"),
  editBallRunsWrap: document.getElementById("editBallRunsWrap"),
  editBallRuns: document.getElementById("editBallRuns"),
  editNextBatterWrap: document.getElementById("editNextBatterWrap"),
  editNextBatter: document.getElementById("editNextBatter"),
  applyBallEdit: document.getElementById("applyBallEdit"),
  runButtons: document.getElementById("runButtons"),
  setBowler: document.getElementById("setBowler"),
  swapBatters: document.getElementById("swapBatters"),
  undoBtn: document.getElementById("undoBtn"),
  endInningsBtn: document.getElementById("endInningsBtn"),
  saveMatchBtn: document.getElementById("saveMatchBtn"),
  saveStatus: document.getElementById("saveStatus"),
  clearSavedBtn: document.getElementById("clearSavedBtn")
};

let state = getInitialState();
let savedMatches = [];
let activeMatchId = null;
let draftState = null;
let matchesEditMode = false;
let matchesBundleUpdatedAt = "";
let cloudSyncClient = null;
let cloudSyncConnected = false;
let cloudSyncSettings = {
  url: "",
  anonKey: "",
  space: ""
};
let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncResyncQueued = false;

function getInitialState() {
  return {
    started: false,
    completed: false,
    completionReason: "",
    matchType: "one-match",
    matchName: "",
    tournamentName: "",
    teamOne: "",
    teamTwo: "",
    teamOnePlayers: [],
    teamTwoPlayers: [],
    tossWinner: "",
    tossDecision: "bat",
    battingTeam: "",
    bowlingTeam: "",
    battingPlayers: [],
    bowlingPlayers: [],
    totalOvers: 20,
    wicketsLimit: 10,
    targetRuns: null,

    runs: 0,
    wickets: 0,
    legalBalls: 0,

    striker: "",
    nonStriker: "",
    bowler: "",

    extras: {
      wides: 0,
      noballs: 0,
      byes: 0,
      legbyes: 0
    },

    thisOver: [],
    ballLog: [],
    history: [],
    battersUsed: [],
    bowlersUsed: [],
    batterCount: 2,
    lastAction: "",
    awaitingOverBowler: false,
    pendingOverNumber: 0,
    preferredOverBowler: "",
    preferredNextBatter: ""
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTimestamp(value) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return nowIso();
}

function normalizeBundleUpdatedAt(value) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return "";
}

function setSaveStatus(message) {
  if (elements.saveStatus) {
    elements.saveStatus.textContent = message;
  }
}

function setSyncStatus(message) {
  if (elements.syncStatus) {
    elements.syncStatus.textContent = message;
  }
}

function normalizeSyncSettings(settings) {
  return {
    space: typeof settings?.space === "string" ? settings.space.trim() : ""
  };
}

function loadSyncSettings() {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_KEY);

    if (!raw) {
      return normalizeSyncSettings({});
    }

    return normalizeSyncSettings(JSON.parse(raw));
  } catch {
    return normalizeSyncSettings({});
  }
}

function persistSyncSettings(settings) {
  const normalized = normalizeSyncSettings(settings);
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(normalized));
}

function fillSyncInputs(settings) {
  if (elements.syncSpace) {
    elements.syncSpace.value = settings.space;
  }
}

function readSyncInputs() {
  return normalizeSyncSettings({
    space: elements.syncSpace ? elements.syncSpace.value : ""
  });
}

function hasCompleteSyncSettings(settings) {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && settings.space);
}

function getCloudBundleId(settings = cloudSyncSettings) {
  return `bundle:${settings.space}`;
}

function toTimestampMs(value) {
  if (typeof value !== "string" || !value) {
    return 0;
  }

  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

function hasLocalBundleData(payload) {
  return Boolean(
    (Array.isArray(payload.savedMatches) && payload.savedMatches.length > 0) || payload.activeMatchId || payload.draftState
  );
}

function refreshSyncControlStates() {
  const inputSettings = readSyncInputs();
  const readyToConnect = hasCompleteSyncSettings(inputSettings);

  if (elements.connectSyncBtn) {
    elements.connectSyncBtn.disabled = cloudSyncConnected || !readyToConnect;
  }

  if (elements.pullSyncBtn) {
    elements.pullSyncBtn.disabled = !cloudSyncConnected;
  }

  if (elements.disconnectSyncBtn) {
    elements.disconnectSyncBtn.disabled = !cloudSyncConnected;
  }

  if (elements.syncSpace) {
    elements.syncSpace.disabled = cloudSyncConnected;
  }
}

function findSavedMatchIndex(matchId) {
  return savedMatches.findIndex((item) => item.id === matchId);
}

function getNextMatchName() {
  const taken = savedMatches
    .map((item) => {
      const match = /^Match\s+(\d+)$/i.exec(item.name || "");
      return match ? toInt(match[1], 0) : 0;
    })
    .filter((n) => n > 0);

  const next = taken.length > 0 ? Math.max(...taken) + 1 : 1;
  return `Match ${next}`;
}

function getStateBasedSaveName() {
  const oneMatchName = typeof state.matchName === "string" ? state.matchName.trim() : "";
  const tournamentName = typeof state.tournamentName === "string" ? state.tournamentName.trim() : "";

  if (state.matchType === "one-match" && oneMatchName) {
    return oneMatchName;
  }

  if (state.matchType === "tournament" && tournamentName) {
    return tournamentName;
  }

  return "";
}

function normalizeSavedMatchRecord(record, idx) {
  const normalizedState = normalizeLoadedState(record?.state);

  if (!record || typeof record.id !== "string" || !normalizedState) {
    return null;
  }

  return {
    id: record.id,
    name: typeof record.name === "string" && record.name.trim() ? record.name : `Match ${idx + 1}`,
    state: normalizedState,
    createdAt: normalizeTimestamp(record.createdAt),
    updatedAt: normalizeTimestamp(record.updatedAt)
  };
}

function applyMatchesBundlePayload(parsed) {
  const loadedMatches = Array.isArray(parsed?.savedMatches) ? parsed.savedMatches : [];

  savedMatches = loadedMatches
    .map((item, idx) => normalizeSavedMatchRecord(item, idx))
    .filter(Boolean);

  activeMatchId =
    typeof parsed?.activeMatchId === "string" && savedMatches.some((item) => item.id === parsed.activeMatchId)
      ? parsed.activeMatchId
      : null;

  draftState = normalizeLoadedState(parsed?.draftState);
  matchesEditMode = false;
  matchesBundleUpdatedAt = normalizeBundleUpdatedAt(parsed?.updatedAt);
}

function buildMatchesPersistencePayload() {
  return {
    schemaVersion: MATCHES_SCHEMA_VERSION,
    bundleType: "cricket-scorer/matches",
    updatedAt: matchesBundleUpdatedAt,
    activeMatchId,
    draftState,
    savedMatches
  };
}

function writeMatchesBundleToLocalStorage() {
  localStorage.setItem(MATCHES_STORAGE_KEY, JSON.stringify(buildMatchesPersistencePayload()));
}

function persistMatchesBundle() {
  matchesBundleUpdatedAt = nowIso();
  writeMatchesBundleToLocalStorage();
  scheduleCloudBundleUpload();
}

function renderSavedMatchTabs() {
  if (!elements.savedMatchesTabs) {
    return;
  }

  elements.savedMatchesTabs.innerHTML = "";

  if (savedMatches.length === 0) {
    const hint = document.createElement("span");
    hint.className = "inline-hint";
    hint.textContent = "No saved matches yet. Use Save Match to pin one.";
    elements.savedMatchesTabs.appendChild(hint);
    if (elements.editMatchesBtn) {
      elements.editMatchesBtn.textContent = "Edit";
      elements.editMatchesBtn.disabled = true;
    }
    return;
  }

  if (elements.editMatchesBtn) {
    elements.editMatchesBtn.disabled = false;
    elements.editMatchesBtn.textContent = matchesEditMode ? "Done" : "Edit";
  }

  savedMatches.forEach((saved) => {
    const tabItem = document.createElement("div");
    tabItem.className = "saved-tab-item";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = `saved-tab${saved.id === activeMatchId ? " active" : ""}`;
    openButton.textContent = saved.name;
    openButton.addEventListener("click", () => {
      openSavedMatch(saved.id);
    });

    tabItem.appendChild(openButton);

    if (matchesEditMode) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "saved-tab-delete";
      deleteButton.textContent = "x";
      deleteButton.setAttribute("aria-label", `Delete ${saved.name}`);
      deleteButton.title = `Delete ${saved.name}`;
      deleteButton.addEventListener("click", () => {
        deleteSavedMatch(saved.id);
      });
      tabItem.appendChild(deleteButton);
    }

    elements.savedMatchesTabs.appendChild(tabItem);
  });
}

function deleteSavedMatch(matchId) {
  const index = findSavedMatchIndex(matchId);

  if (index < 0) {
    setSaveStatus("Saved match not found.");
    return;
  }

  const removedName = savedMatches[index].name;
  const confirmed = window.confirm(`Delete saved match "${removedName}"?`);

  if (!confirmed) {
    return;
  }

  const wasActive = activeMatchId === matchId;
  savedMatches.splice(index, 1);

  if (!wasActive) {
    persistMatchesBundle();
    setSaveStatus(`${removedName} deleted.`);
    render();
    return;
  }

  activeMatchId = null;

  if (savedMatches.length > 0) {
    const fallbackIndex = Math.min(index, savedMatches.length - 1);
    persistMatchesBundle();
    openSavedMatch(savedMatches[fallbackIndex].id, true);
    setSaveStatus(`${removedName} deleted.`);
    return;
  }

  if (draftState) {
    const normalizedDraft = normalizeLoadedState(draftState);

    if (normalizedDraft) {
      state = normalizedDraft;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistMatchesBundle();
      setSaveStatus(`${removedName} deleted.`);
      render();
      return;
    }
  }

  state = getInitialState();
  localStorage.removeItem(STORAGE_KEY);
  persistMatchesBundle();
  setSaveStatus(`${removedName} deleted.`);
  render();
}

function openSavedMatch(matchId, silent = false) {
  const index = findSavedMatchIndex(matchId);

  if (index < 0) {
    if (!silent) {
      setSaveStatus("Saved match not found.");
    }
    return false;
  }

  const normalized = normalizeLoadedState(savedMatches[index].state);

  if (!normalized) {
    if (!silent) {
      setSaveStatus("Saved match could not be opened.");
    }
    return false;
  }

  state = normalized;
  activeMatchId = savedMatches[index].id;
  draftState = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  writeMatchesBundleToLocalStorage();

  if (!silent) {
    setSaveStatus(`Opened ${savedMatches[index].name}.`);
  }

  render();
  return true;
}

function saveMatchNow() {
  if (!state.started) {
    setSaveStatus("Start a match first, then save.");
    return;
  }

  let savedName = "";
  const snapshot = deepClone(state);
  const existingIndex = activeMatchId ? findSavedMatchIndex(activeMatchId) : -1;
  const stateBasedName = getStateBasedSaveName();

  if (existingIndex >= 0) {
    savedMatches[existingIndex].state = snapshot;
    if (stateBasedName) {
      savedMatches[existingIndex].name = stateBasedName;
    }
    if (!savedMatches[existingIndex].createdAt) {
      savedMatches[existingIndex].createdAt = nowIso();
    }
    savedMatches[existingIndex].updatedAt = nowIso();
    savedName = savedMatches[existingIndex].name;
  } else {
    const id = `match-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    savedName = stateBasedName || getNextMatchName();
    const createdAt = nowIso();
    savedMatches.push({
      id,
      name: savedName,
      state: snapshot,
      createdAt,
      updatedAt: createdAt
    });
    activeMatchId = id;
  }

  draftState = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  persistMatchesBundle();
  setSaveStatus(`${savedName} saved.`);
  render();
}

function startNewMatchSession() {
  state = getInitialState();
  activeMatchId = null;
  draftState = null;
  matchesEditMode = false;
  localStorage.removeItem(STORAGE_KEY);
  persistMatchesBundle();
  setSaveStatus("New match tab ready. Start a match.");
  render();
}

function parsePlayerNames(value) {
  const seen = new Set();

  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => {
      if (!name || seen.has(name)) {
        return false;
      }

      seen.add(name);
      return true;
    });
}

function setSelectOptions(selectElement, options, selectedValue = "", emptyLabel = "No options") {
  selectElement.innerHTML = "";

  if (options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    selectElement.appendChild(option);
    selectElement.disabled = true;
    return "";
  }

  selectElement.disabled = false;

  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });

  const nextValue = options.includes(selectedValue) ? selectedValue : options[0];
  selectElement.value = nextValue;
  return nextValue;
}

function otherTeamName(teamOne, teamTwo, team) {
  return team === teamOne ? teamTwo : teamOne;
}

function oversLabelFromBalls(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function currentBallLabel() {
  return `${Math.floor(state.legalBalls / 6) + 1}.${(state.legalBalls % 6) + 1}`;
}

function canScore() {
  return state.started && !state.completed && !state.awaitingOverBowler;
}

function isBallAction(action) {
  return typeof action === "string" && action.startsWith("ball:");
}

function getLatestBallLogEntry() {
  for (let i = 0; i < state.ballLog.length; i += 1) {
    const entry = state.ballLog[i];

    if (/^\d+\.\d+\s/.test(entry)) {
      return entry;
    }
  }

  return "";
}

function updateEditPanelFields() {
  const type = elements.editBallType.value;
  const needsRuns = type === "runs" || type === "bye" || type === "legbye";
  const needsNextBatter = type === "wicket";

  elements.editBallRunsWrap.hidden = !needsRuns;
  elements.editNextBatterWrap.hidden = !needsNextBatter;
}

function getAvailableNextBatters() {
  return state.battingPlayers.filter(
    (name) => name !== state.striker && name !== state.nonStriker && !state.battersUsed.includes(name)
  );
}

function refreshNextBatterSelectors() {
  const available = getAvailableNextBatters();
  const currentBatters = [state.striker, state.nonStriker].filter(Boolean);
  const listedCurrent = state.battingPlayers.filter((name) => currentBatters.includes(name));
  const unlistedCurrent = currentBatters.filter((name) => !state.battingPlayers.includes(name));
  const outBatters = state.battingPlayers.filter(
    (name) => state.battersUsed.includes(name) && !currentBatters.includes(name)
  );
  const defaultChoice = available.includes(state.preferredNextBatter)
    ? state.preferredNextBatter
    : available[0] || "";

  function appendGroup(selectElement, label, names, options = {}) {
    if (names.length === 0) {
      return;
    }

    const group = document.createElement("optgroup");
    group.label = label;

    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.disabled = Boolean(options.disabled);
      group.appendChild(option);
    });

    selectElement.appendChild(group);
  }

  [elements.nextBatter, elements.editNextBatter].forEach((selectElement) => {
    const selectedValue = selectElement.value;
    selectElement.innerHTML = "";

    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "Auto (next listed batter)";
    selectElement.appendChild(autoOption);

    appendGroup(selectElement, "Available Next Batter", available);
    appendGroup(selectElement, "Batting Now", [...listedCurrent, ...unlistedCurrent]);
    appendGroup(selectElement, "Previous Wickets", outBatters);

    const allSelectable = state.battingPlayers.includes(selectedValue);
    selectElement.value = allSelectable ? selectedValue : defaultChoice;
    selectElement.disabled = !state.started;
  });
}

function getOverBowlerChoices() {
  const baseBowlers = state.bowlingPlayers.length > 0 ? state.bowlingPlayers : [];
  const merged = [...baseBowlers, ...state.bowlersUsed, state.bowler].filter(Boolean);
  return [...new Set(merged)];
}

function populateBowlerSelect(selectElement, selectedValue = "", emptyLabel = "No bowlers available") {
  const choices = getOverBowlerChoices();
  selectElement.innerHTML = "";

  if (choices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    selectElement.appendChild(option);
    selectElement.disabled = true;
    return "";
  }

  const currentBowler = choices.filter((name) => name === state.bowler);
  const previousBowlers = choices.filter(
    (name) => state.bowlersUsed.includes(name) && name !== state.bowler
  );
  const otherBowlers = choices.filter(
    (name) => !currentBowler.includes(name) && !previousBowlers.includes(name)
  );

  function appendGroup(label, names) {
    if (names.length === 0) {
      return;
    }

    const group = document.createElement("optgroup");
    group.label = label;

    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      group.appendChild(option);
    });

    selectElement.appendChild(group);
  }

  appendGroup("Bowling Now", currentBowler);
  appendGroup("Previous Bowlers", previousBowlers);
  appendGroup("Other Bowlers", otherBowlers);

  const preferred =
    choices.includes(selectedValue)
      ? selectedValue
      : choices.includes(state.preferredOverBowler)
        ? state.preferredOverBowler
        : choices.includes(state.bowler)
          ? state.bowler
          : choices[0];

  selectElement.value = preferred;
  selectElement.disabled = false;
  return preferred;
}

function refreshOverBowlerModal() {
  if (!state.awaitingOverBowler || state.completed) {
    elements.bowlerModal.classList.add("hidden");
    return;
  }

  populateBowlerSelect(elements.overBowlerSelect, elements.overBowlerSelect.value);
  elements.bowlerModalInfo.textContent = `Over ${Math.max(1, state.pendingOverNumber - 1)} completed. Select bowler for over ${Math.max(1, state.pendingOverNumber)}.`;
  elements.bowlerModal.classList.remove("hidden");
}

function refreshSetupSelectors() {
  const tournamentMode = elements.matchType.value === "tournament";
  elements.tournamentName.required = true;
  elements.tournamentName.disabled = false;
  elements.tournamentName.placeholder = tournamentMode ? "e.g. Summer Cup 2026" : "e.g. Match 1";

  if (elements.nameFieldLabel) {
    elements.nameFieldLabel.textContent = tournamentMode ? "Tournament Name" : "Match Name";
  }

  const teamOne = elements.teamOneName.value.trim();
  const teamTwo = elements.teamTwoName.value.trim();

  if (!teamOne || !teamTwo || teamOne === teamTwo) {
    setSelectOptions(elements.tossWinner, [], "", "Enter two different team names");
    setSelectOptions(elements.strikerName, [], "", "Add players for batting team");
    setSelectOptions(elements.nonStrikerName, [], "", "Select striker first");
    setSelectOptions(elements.bowlerName, [], "", "Add players for bowling team");
    elements.inningsPreview.textContent = "Set two different teams, then add player names.";
    return;
  }

  const tossWinner = setSelectOptions(
    elements.tossWinner,
    [teamOne, teamTwo],
    elements.tossWinner.value
  );

  const tossDecision = elements.tossDecision.value === "bowl" ? "bowl" : "bat";
  const battingTeam = tossDecision === "bat" ? tossWinner : otherTeamName(teamOne, teamTwo, tossWinner);
  const bowlingTeam = otherTeamName(teamOne, teamTwo, battingTeam);

  const teamOnePlayers = parsePlayerNames(elements.teamOnePlayers.value);
  const teamTwoPlayers = parsePlayerNames(elements.teamTwoPlayers.value);
  const battingPlayers = battingTeam === teamOne ? teamOnePlayers : teamTwoPlayers;
  const bowlingPlayers = bowlingTeam === teamOne ? teamOnePlayers : teamTwoPlayers;

  const striker = setSelectOptions(elements.strikerName, battingPlayers, elements.strikerName.value);
  const nonStrikerOptions = battingPlayers.filter((name) => name !== striker);
  const nonStriker = setSelectOptions(
    elements.nonStrikerName,
    nonStrikerOptions,
    elements.nonStrikerName.value,
    "Need at least two batters"
  );
  const bowler = setSelectOptions(elements.bowlerName, bowlingPlayers, elements.bowlerName.value);

  elements.inningsPreview.textContent =
    `1st innings: ${battingTeam} batting, ${bowlingTeam} bowling` +
    ` | Striker: ${striker || "-"} | Non-striker: ${nonStriker || "-"} | Bowler: ${bowler || "-"}`;
}

function pushHistory() {
  const snapshot = deepClone(state);
  snapshot.history = [];
  state.history.push(snapshot);

  if (state.history.length > 300) {
    state.history.shift();
  }
}

function swapBattersInternal() {
  const currentStriker = state.striker;
  state.striker = state.nonStriker;
  state.nonStriker = currentStriker;
}

function addBallLogItem(message) {
  state.ballLog.unshift(message);

  if (state.ballLog.length > 120) {
    state.ballLog.pop();
  }
}

function autoNextBatterName() {
  const nextFromLineup = state.battingPlayers.find((name) => !state.battersUsed.includes(name));

  if (nextFromLineup) {
    state.battersUsed.push(nextFromLineup);
    return nextFromLineup;
  }

  state.batterCount += 1;
  return `Batter ${state.batterCount}`;
}

function queueOverBowlerSelectionIfNeeded() {
  if (state.completed || state.legalBalls === 0 || state.legalBalls % 6 !== 0) {
    return;
  }

  state.awaitingOverBowler = true;
  state.pendingOverNumber = Math.floor(state.legalBalls / 6) + 1;
  addBallLogItem(
    `Over ${Math.floor(state.legalBalls / 6)} completed. Select bowler for over ${state.pendingOverNumber}.`
  );
}

function setInningsComplete(reason) {
  state.completed = true;
  state.completionReason = reason;
}

function checkInningsCompletion() {
  if (state.completed) {
    return;
  }

  if (state.wickets >= state.wicketsLimit) {
    setInningsComplete("All out");
    return;
  }

  if (state.legalBalls >= state.totalOvers * 6) {
    setInningsComplete("Overs completed");
    return;
  }

  if (state.targetRuns !== null && state.runs >= state.targetRuns) {
    setInningsComplete(`${state.battingTeam} chased the target`);
  }
}

function applyLegalBallCommon(notation) {
  state.thisOver.push(notation);
  state.legalBalls += 1;

  if (state.legalBalls % 6 === 0) {
    swapBattersInternal();
    state.thisOver = [];
  }
}

function recordRuns(runs) {
  if (!canScore()) {
    return;
  }

  pushHistory();

  const ball = currentBallLabel();
  state.runs += runs;
  applyLegalBallCommon(String(runs));

  if (runs % 2 === 1) {
    swapBattersInternal();
  }

  addBallLogItem(`${ball} ${runs} run${runs === 1 ? "" : "s"} | ${state.runs}/${state.wickets}`);
  state.lastAction = `ball:runs:${runs}`;
  checkInningsCompletion();
  queueOverBowlerSelectionIfNeeded();
  persistAndRender();
}

function recordWide() {
  if (!canScore()) {
    return;
  }

  pushHistory();

  const ball = currentBallLabel();
  state.runs += 1;
  state.extras.wides += 1;
  state.thisOver.push("Wd");

  addBallLogItem(`${ball} Wd +1 | ${state.runs}/${state.wickets}`);
  state.lastAction = "ball:wide";
  checkInningsCompletion();
  persistAndRender();
}

function recordNoBall() {
  if (!canScore()) {
    return;
  }

  pushHistory();

  const ball = currentBallLabel();
  state.runs += 1;
  state.extras.noballs += 1;
  state.thisOver.push("Nb");

  addBallLogItem(`${ball} Nb +1 | ${state.runs}/${state.wickets}`);
  state.lastAction = "ball:noball";
  checkInningsCompletion();
  persistAndRender();
}

function recordBye(type) {
  if (!canScore()) {
    return;
  }

  const runs = toInt(elements.byeRuns.value, 1);
  const isLegBye = type === "legbye";

  pushHistory();

  const ball = currentBallLabel();
  state.runs += runs;

  if (isLegBye) {
    state.extras.legbyes += runs;
  } else {
    state.extras.byes += runs;
  }

  applyLegalBallCommon(`${isLegBye ? "Lb" : "B"}${runs}`);

  if (runs % 2 === 1) {
    swapBattersInternal();
  }

  addBallLogItem(
    `${ball} ${isLegBye ? "Leg bye" : "Bye"} ${runs} | ${state.runs}/${state.wickets}`
  );

  state.lastAction = `ball:${isLegBye ? "legbye" : "bye"}:${runs}`;
  checkInningsCompletion();
  queueOverBowlerSelectionIfNeeded();
  persistAndRender();
}

function recordWicket() {
  if (!canScore()) {
    return;
  }

  pushHistory();

  const ball = currentBallLabel();
  const outBatter = state.striker;

  state.wickets += 1;
  applyLegalBallCommon("W");

  addBallLogItem(`${ball} Wicket (${outBatter}) | ${state.runs}/${state.wickets}`);
  checkInningsCompletion();
  queueOverBowlerSelectionIfNeeded();

  if (!state.completed) {
    const selectedName = elements.nextBatter.value;
    const selectedNameIsValid =
      selectedName && state.battingPlayers.includes(selectedName);
    const nextName = selectedNameIsValid ? selectedName : autoNextBatterName();

    if (!state.battersUsed.includes(nextName)) {
      state.battersUsed.push(nextName);
    }

    state.striker = nextName;

    if (state.striker === state.nonStriker) {
      const replacement =
        state.battingPlayers.find((name) => name !== state.striker && !state.battersUsed.includes(name)) ||
        state.battingPlayers.find((name) => name !== state.striker) ||
        autoNextBatterName();
      state.nonStriker = replacement;

      if (!state.battersUsed.includes(replacement)) {
        state.battersUsed.push(replacement);
      }
    }

    elements.nextBatter.value = "";
    state.preferredNextBatter = getAvailableNextBatters()[0] || "";
  }

  state.lastAction = "ball:wicket";
  persistAndRender();
}

function updateBowlerName() {
  if (!state.started) {
    return;
  }

  const name = elements.bowlerInput.value;

  if (!name) {
    return;
  }

  pushHistory();
  state.bowler = name;
  state.preferredOverBowler = name;
  if (!state.bowlersUsed.includes(name)) {
    state.bowlersUsed.push(name);
  }
  addBallLogItem(`Bowler changed to ${name}`);
  state.lastAction = "utility:set-bowler";
  persistAndRender();
}

function swapBattersManual() {
  if (!state.started) {
    return;
  }

  pushHistory();
  swapBattersInternal();
  addBallLogItem("Manual striker swap");
  state.lastAction = "utility:swap-batters";
  persistAndRender();
}

function undoLast() {
  if (!state.started || state.history.length === 0) {
    return;
  }

  state = state.history.pop();
  persistAndRender();
}

function editPreviousBall() {
  if (!state.started || state.history.length === 0) {
    return;
  }

  if (!isBallAction(state.lastAction)) {
    return;
  }

  const snapshotBeforeBall = deepClone(state.history[state.history.length - 1]);
  snapshotBeforeBall.history = state.history.slice(0, -1).map((entry) => deepClone(entry));
  state = snapshotBeforeBall;

  const selectedType = elements.editBallType.value;
  const selectedRuns = Math.max(0, Math.min(6, toInt(elements.editBallRuns.value, 0)));

  if (selectedType === "runs") {
    recordRuns(selectedRuns);
    return;
  }

  if (selectedType === "wide") {
    recordWide();
    return;
  }

  if (selectedType === "noball") {
    recordNoBall();
    return;
  }

  if (selectedType === "bye" || selectedType === "legbye") {
    elements.byeRuns.value = String(Math.max(1, Math.min(4, selectedRuns || 1)));
    recordBye(selectedType);
    return;
  }

  if (selectedType === "wicket") {
    elements.nextBatter.value = elements.editNextBatter.value;
    recordWicket();
  }
}

function confirmOverBowlerSelection() {
  if (!state.started || !state.awaitingOverBowler) {
    return;
  }

  const name = elements.overBowlerSelect.value;
  const validChoices = getOverBowlerChoices();

  if (!name || !validChoices.includes(name)) {
    return;
  }

  pushHistory();
  state.bowler = name;
  state.preferredOverBowler = name;
  if (!state.bowlersUsed.includes(name)) {
    state.bowlersUsed.push(name);
  }
  state.awaitingOverBowler = false;
  state.pendingOverNumber = 0;
  state.lastAction = "utility:over-bowler";
  addBallLogItem(`Bowler selected for new over: ${name}`);
  persistAndRender();
}

function clearSavedMatch() {
  if (activeMatchId) {
    const index = findSavedMatchIndex(activeMatchId);
    const label = index >= 0 ? savedMatches[index].name : "active saved match";

    if (index >= 0) {
      savedMatches.splice(index, 1);
    }

    activeMatchId = null;
    draftState = state.started ? deepClone(state) : null;
    persistMatchesBundle();
    setSaveStatus(`${label} removed from saved matches.`);
    render();
    return;
  }

  if (savedMatches.length === 0 && !draftState) {
    setSaveStatus("No saved match to clear.");
    return;
  }

  savedMatches = [];
  draftState = null;
  localStorage.removeItem(STORAGE_KEY);
  persistMatchesBundle();
  setSaveStatus("All saved matches cleared.");
  render();
}

function startMatchFromForm(event) {
  event.preventDefault();

  const matchType = elements.matchType.value;
  const enteredName = elements.tournamentName.value.trim();
  const teamOne = elements.teamOneName.value.trim();
  const teamTwo = elements.teamTwoName.value.trim();
  const teamOnePlayers = parsePlayerNames(elements.teamOnePlayers.value);
  const teamTwoPlayers = parsePlayerNames(elements.teamTwoPlayers.value);
  const tossWinner = elements.tossWinner.value;
  const tossDecision = elements.tossDecision.value === "bowl" ? "bowl" : "bat";

  if (!teamOne || !teamTwo || teamOne === teamTwo || ![teamOne, teamTwo].includes(tossWinner)) {
    return;
  }

  const battingTeam = tossDecision === "bat" ? tossWinner : otherTeamName(teamOne, teamTwo, tossWinner);
  const bowlingTeam = otherTeamName(teamOne, teamTwo, battingTeam);
  const battingPlayers = battingTeam === teamOne ? teamOnePlayers : teamTwoPlayers;
  const bowlingPlayers = bowlingTeam === teamOne ? teamOnePlayers : teamTwoPlayers;

  const striker = elements.strikerName.value;
  const nonStriker = elements.nonStrikerName.value;
  const bowler = elements.bowlerName.value;

  if (
    battingPlayers.length < 2 ||
    bowlingPlayers.length < 1 ||
    !battingPlayers.includes(striker) ||
    !battingPlayers.includes(nonStriker) ||
    striker === nonStriker ||
    !bowlingPlayers.includes(bowler)
  ) {
    return;
  }

  const totalOvers = Math.max(1, toInt(elements.overs.value, 20));
  const wicketsLimit = Math.max(1, Math.min(10, toInt(elements.wicketsLimit.value, 10)));
  const targetRaw = elements.targetRuns.value.trim();
  const targetRuns = targetRaw ? Math.max(1, toInt(targetRaw, 1)) : null;

  state = getInitialState();
  state.started = true;
  state.matchType = matchType;
  state.matchName = matchType === "one-match" ? enteredName : "";
  state.tournamentName = matchType === "tournament" ? enteredName : "";
  state.teamOne = teamOne;
  state.teamTwo = teamTwo;
  state.teamOnePlayers = teamOnePlayers;
  state.teamTwoPlayers = teamTwoPlayers;
  state.tossWinner = tossWinner;
  state.tossDecision = tossDecision;
  state.battingTeam = battingTeam;
  state.bowlingTeam = bowlingTeam;
  state.battingPlayers = battingPlayers;
  state.bowlingPlayers = bowlingPlayers;
  state.totalOvers = totalOvers;
  state.wicketsLimit = wicketsLimit;
  state.targetRuns = targetRuns;
  state.striker = striker;
  state.nonStriker = nonStriker;
  state.bowler = bowler;
  state.battersUsed = [striker, nonStriker];
  state.bowlersUsed = [bowler];
  state.batterCount = battingPlayers.length;
  state.lastAction = "setup:start";
  state.awaitingOverBowler = false;
  state.pendingOverNumber = 0;
  state.preferredOverBowler = bowler;
  state.preferredNextBatter =
    battingPlayers.find((name) => ![striker, nonStriker].includes(name)) || "";

  const tossSummary = `${tossWinner} won toss and chose ${tossDecision === "bat" ? "batting" : "bowling"}`;
  addBallLogItem(`Match started: ${battingTeam} batting vs ${bowlingTeam} | ${tossSummary}`);
  persistAndRender();
}

function normalizeLoadedState(parsed) {
  if (!parsed || typeof parsed !== "object" || !parsed.started) {
    return null;
  }

  const next = deepClone(parsed);

  if (!Array.isArray(next.history)) {
    next.history = [];
  }

  if (!Array.isArray(next.ballLog)) {
    next.ballLog = [];
  }

  if (!Array.isArray(next.battingPlayers)) {
    next.battingPlayers = [next.striker, next.nonStriker].filter(Boolean);
  }

  if (!Array.isArray(next.bowlingPlayers)) {
    next.bowlingPlayers = [next.bowler].filter(Boolean);
  }

  if (!Array.isArray(next.battersUsed)) {
    next.battersUsed = [next.striker, next.nonStriker].filter(Boolean);
  }

  if (!Array.isArray(next.bowlersUsed)) {
    next.bowlersUsed = [next.bowler].filter(Boolean);
  }

  if (!next.matchType) {
    next.matchType = "one-match";
  }

  if (typeof next.matchName !== "string") {
    next.matchName = "";
  }

  if (!next.tossDecision) {
    next.tossDecision = "bat";
  }

  if (typeof next.lastAction !== "string" || !next.lastAction) {
    const latestBall = next.ballLog.find((entry) => /^\d+\.\d+\s/.test(entry));
    next.lastAction = latestBall && next.ballLog[0] === latestBall ? "ball:unknown" : "";
  }

  if (typeof next.awaitingOverBowler !== "boolean") {
    next.awaitingOverBowler = false;
  }

  if (typeof next.pendingOverNumber !== "number") {
    next.pendingOverNumber = 0;
  }

  if (typeof next.preferredOverBowler !== "string" || !next.preferredOverBowler) {
    next.preferredOverBowler = next.bowler || "";
  }

  if (typeof next.preferredNextBatter !== "string") {
    next.preferredNextBatter = "";
  }

  return next;
}

function restoreMatchesBundle() {
  const raw = localStorage.getItem(MATCHES_STORAGE_KEY);

  if (!raw) {
    savedMatches = [];
    activeMatchId = null;
    draftState = null;
    matchesBundleUpdatedAt = "";
    return;
  }

  try {
    applyMatchesBundlePayload(JSON.parse(raw));
  } catch {
    savedMatches = [];
    activeMatchId = null;
    draftState = null;
    matchesBundleUpdatedAt = "";
  }
}

function scheduleCloudBundleUpload() {
  if (!cloudSyncConnected || !cloudSyncClient) {
    return;
  }

  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
  }

  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    void uploadCloudBundleNow(null, true);
  }, CLOUD_SYNC_DEBOUNCE_MS);
}

async function uploadCloudBundleNow(payloadOverride = null, quiet = false) {
  if (!cloudSyncConnected || !cloudSyncClient) {
    return false;
  }

  if (cloudSyncInFlight) {
    cloudSyncResyncQueued = true;
    return false;
  }

  cloudSyncInFlight = true;

  try {
    const payload = deepClone(payloadOverride || buildMatchesPersistencePayload());

    if (!toTimestampMs(payload.updatedAt)) {
      payload.updatedAt = nowIso();
      matchesBundleUpdatedAt = payload.updatedAt;
      writeMatchesBundleToLocalStorage();
    }

    const row = {
      id: getCloudBundleId(),
      payload,
      updated_at: nowIso()
    };

    const { error } = await cloudSyncClient
      .from(CLOUD_SYNC_TABLE)
      .upsert(row, { onConflict: "id" });

    if (error) {
      throw error;
    }

    if (!quiet) {
      setSyncStatus("Cloud sync updated.");
    }

    return true;
  } catch (error) {
    setSyncStatus(`Cloud sync failed: ${error.message || "unknown error"}`);
    return false;
  } finally {
    cloudSyncInFlight = false;

    if (cloudSyncResyncQueued) {
      cloudSyncResyncQueued = false;
      scheduleCloudBundleUpload();
    }
  }
}

async function fetchCloudBundlePayload() {
  if (!cloudSyncConnected || !cloudSyncClient) {
    return null;
  }

  const { data, error } = await cloudSyncClient
    .from(CLOUD_SYNC_TABLE)
    .select("payload, updated_at")
    .eq("id", getCloudBundleId())
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.payload || typeof data.payload !== "object") {
    return null;
  }

  return data.payload;
}

function applyCloudBundlePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  applyMatchesBundlePayload(payload);
  writeMatchesBundleToLocalStorage();
  resumeSavedMatch(true);
  render();
  return true;
}

async function reconcileCloudBundle() {
  const localPayload = buildMatchesPersistencePayload();
  const remotePayload = await fetchCloudBundlePayload();

  if (!remotePayload) {
    if (hasLocalBundleData(localPayload)) {
      const pushed = await uploadCloudBundleNow(localPayload, true);
      setSyncStatus(
        pushed
          ? "Cloud sync connected. Local data uploaded."
          : "Cloud sync connected, but local upload failed."
      );
      return;
    }

    setSyncStatus("Cloud sync connected. No cloud match bundle found yet.");
    return;
  }

  const localUpdatedMs = toTimestampMs(localPayload.updatedAt);
  const remoteUpdatedMs = toTimestampMs(remotePayload.updatedAt);

  if (remoteUpdatedMs > localUpdatedMs) {
    const applied = applyCloudBundlePayload(remotePayload);

    if (applied) {
      setSyncStatus("Cloud sync connected. Pulled latest cloud data.");
      setSaveStatus("Saved match restored from cloud.");
    } else {
      setSyncStatus("Cloud bundle found, but it is not valid.");
    }
    return;
  }

  if (localUpdatedMs > remoteUpdatedMs) {
    const pushed = await uploadCloudBundleNow(localPayload, true);
    setSyncStatus(
      pushed
        ? "Cloud sync connected. Local data is latest."
        : "Cloud sync connected, but push failed."
    );
    return;
  }

  setSyncStatus("Cloud sync connected. Already up to date.");
}

async function connectCloudSync(autoConnect = false) {
  const createClient = window.supabase && typeof window.supabase.createClient === "function"
    ? window.supabase.createClient
    : null;

  if (!createClient) {
    setSyncStatus("Supabase client not available. Check internet/CDN access.");
    return;
  }

  const settings = readSyncInputs();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setSyncStatus("Supabase URL/anon key not configured in config.js.");
    refreshSyncControlStates();
    return;
  }

  if (!settings.space) {
    setSyncStatus("Enter Sync Space.");
    refreshSyncControlStates();
    return;
  }

  cloudSyncSettings = settings;
  cloudSyncClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  cloudSyncConnected = true;
  persistSyncSettings(settings);
  refreshSyncControlStates();
  setSyncStatus(autoConnect ? "Reconnecting cloud sync..." : "Connecting cloud sync...");

  try {
    await reconcileCloudBundle();
  } catch (error) {
    cloudSyncConnected = false;
    cloudSyncClient = null;
    refreshSyncControlStates();
    setSyncStatus(`Cloud connection failed: ${error.message || "unknown error"}`);
  }
}

function disconnectCloudSync() {
  cloudSyncConnected = false;
  cloudSyncClient = null;

  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
  }

  cloudSyncInFlight = false;
  cloudSyncResyncQueued = false;
  refreshSyncControlStates();
  setSyncStatus("Cloud sync disconnected. Local auto-save is still on.");
}

async function pullCloudBundle(manual = false) {
  if (!cloudSyncConnected || !cloudSyncClient) {
    setSyncStatus("Connect cloud sync first.");
    return;
  }

  if (manual) {
    const confirmed = window.confirm(
      "Pull latest cloud data and replace local data on this browser?"
    );

    if (!confirmed) {
      return;
    }
  }

  try {
    const payload = await fetchCloudBundlePayload();

    if (!payload) {
      setSyncStatus("No cloud bundle found for this sync space.");
      return;
    }

    const applied = applyCloudBundlePayload(payload);

    if (!applied) {
      setSyncStatus("Cloud bundle is not valid.");
      return;
    }

    setSyncStatus("Pulled latest data from cloud.");
    setSaveStatus("Saved match restored from cloud.");
  } catch (error) {
    setSyncStatus(`Pull failed: ${error.message || "unknown error"}`);
  }
}

async function bootstrapCloudSync() {
  cloudSyncSettings = loadSyncSettings();
  fillSyncInputs(cloudSyncSettings);
  refreshSyncControlStates();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setSyncStatus("Supabase URL/anon key not configured in config.js.");
    return;
  }

  if (!cloudSyncSettings.space) {
    setSyncStatus("Cloud sync is off. Enter Sync Space and connect.");
    return;
  }

  await connectCloudSync(true);
}

function resumeSavedMatch(silent = false) {
  if (activeMatchId && openSavedMatch(activeMatchId, true)) {
    if (!silent) {
      setSaveStatus("Saved match restored.");
    }
    return;
  }

  if (savedMatches.length > 0 && openSavedMatch(savedMatches[0].id, true)) {
    if (!silent) {
      setSaveStatus("Saved match restored.");
    }
    return;
  }

  if (draftState) {
    const normalizedDraft = normalizeLoadedState(draftState);

    if (normalizedDraft) {
      state = normalizedDraft;
      activeMatchId = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      writeMatchesBundleToLocalStorage();

      if (!silent) {
        setSaveStatus("Unsaved match restored.");
      }

      render();
      return;
    }
  }

  const legacy = localStorage.getItem(STORAGE_KEY);

  if (legacy) {
    try {
      const normalizedLegacy = normalizeLoadedState(JSON.parse(legacy));

      if (normalizedLegacy) {
        state = normalizedLegacy;
        draftState = deepClone(normalizedLegacy);
        activeMatchId = null;
        writeMatchesBundleToLocalStorage();

        if (!silent) {
          setSaveStatus("Unsaved match restored.");
        }

        render();
        return;
      }
    } catch {
      // Ignore bad old format.
    }
  }

  if (!silent) {
    setSaveStatus("No saved match found.");
  }
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  let activeIndex = activeMatchId ? findSavedMatchIndex(activeMatchId) : -1;

  if (activeMatchId && activeIndex < 0) {
    activeMatchId = null;
    activeIndex = -1;
  }

  if (activeIndex >= 0) {
    savedMatches[activeIndex].state = deepClone(state);
    savedMatches[activeIndex].updatedAt = nowIso();
    draftState = null;
    setSaveStatus(`Auto-saved to ${savedMatches[activeIndex].name}.`);
  } else {
    draftState = state.started ? deepClone(state) : null;
    setSaveStatus("Auto-saved locally. Click Save Match to pin tab.");
  }

  persistMatchesBundle();
  render();
}

function refreshBowlerControlOptions() {
  populateBowlerSelect(elements.bowlerInput, elements.bowlerInput.value);
}

function render() {
  const extrasTotal =
    state.extras.wides + state.extras.noballs + state.extras.byes + state.extras.legbyes;

  renderSavedMatchTabs();

  if (!state.started) {
    elements.matchTitle.textContent = "Not started";
    elements.inningsState.textContent = "Create a match to begin scoring.";
    elements.mainScore.textContent = "0/0";
    elements.oversDisplay.textContent = "0.0";
    elements.runRate.textContent = "0.00";
    elements.extrasDisplay.textContent = "0";
    elements.requiredDisplay.textContent = "-";
    elements.strikerDisplay.textContent = "-";
    elements.nonStrikerDisplay.textContent = "-";
    elements.bowlerDisplay.textContent = "-";
    elements.thisOver.textContent = "-";
    elements.previousBallInfo.textContent = "No ball recorded yet.";
    elements.ballLog.innerHTML = "";
    setSelectOptions(elements.bowlerInput, [], "", "Start match first");
    setSelectOptions(elements.nextBatter, [], "", "Start match first");
    setSelectOptions(elements.editNextBatter, [], "", "Start match first");
    refreshSetupSelectors();
    refreshOverBowlerModal();
    updateEditPanelFields();
    setControlStates();
    return;
  }

  const currentOvers = oversLabelFromBalls(state.legalBalls);
  const runRate = state.legalBalls > 0 ? (state.runs / (state.legalBalls / 6)).toFixed(2) : "0.00";
  const matchPair = `${state.teamOne || state.battingTeam} vs ${state.teamTwo || state.bowlingTeam}`;
  const oneMatchTitle = typeof state.matchName === "string" ? state.matchName.trim() : "";
  const tournamentTitle = typeof state.tournamentName === "string" ? state.tournamentName.trim() : "";

  elements.matchTitle.textContent =
    state.matchType === "one-match" && oneMatchTitle
      ? oneMatchTitle
      : state.matchType === "tournament" && tournamentTitle
        ? `${tournamentTitle}: ${matchPair}`
        : matchPair;
  elements.inningsState.textContent = state.completed
    ? `Innings complete: ${state.completionReason}`
    : `${state.battingTeam} batting | Toss: ${state.tossWinner || "-"} chose ${state.tossDecision === "bowl" ? "bowl" : "bat"}`;
  elements.mainScore.textContent = `${state.runs}/${state.wickets}`;
  elements.oversDisplay.textContent = currentOvers;
  elements.runRate.textContent = runRate;
  elements.extrasDisplay.textContent = `${extrasTotal} (Wd ${state.extras.wides}, Nb ${state.extras.noballs}, B ${state.extras.byes}, Lb ${state.extras.legbyes})`;

  if (state.targetRuns !== null) {
    const needed = state.targetRuns - state.runs;

    if (needed <= 0) {
      elements.requiredDisplay.textContent = "Target reached";
    } else {
      const ballsLeft = Math.max(0, state.totalOvers * 6 - state.legalBalls);
      const reqRate = ballsLeft > 0 ? (needed / (ballsLeft / 6)).toFixed(2) : "-";
      elements.requiredDisplay.textContent = `${needed} off ${ballsLeft} (RRR ${reqRate})`;
    }
  } else {
    elements.requiredDisplay.textContent = "-";
  }

  elements.strikerDisplay.textContent = state.striker;
  elements.nonStrikerDisplay.textContent = state.nonStriker;
  elements.bowlerDisplay.textContent = state.bowler;
  elements.thisOver.textContent = state.thisOver.length > 0 ? state.thisOver.join(" ") : "-";

  const latestBallEntry = getLatestBallLogEntry();
  if (!latestBallEntry) {
    elements.previousBallInfo.textContent = "No ball recorded yet.";
  } else if (isBallAction(state.lastAction)) {
    elements.previousBallInfo.textContent = `Previous ball: ${latestBallEntry}`;
  } else {
    elements.previousBallInfo.textContent =
      `Previous ball: ${latestBallEntry} (Undo utility action first to edit)`;
  }

  elements.ballLog.innerHTML = "";
  state.ballLog.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    elements.ballLog.appendChild(li);
  });

  refreshBowlerControlOptions();
  refreshNextBatterSelectors();
  refreshOverBowlerModal();
  updateEditPanelFields();
  setControlStates();
}

function setControlStates() {
  const scoringButtons = document.querySelectorAll("button.scoring");

  scoringButtons.forEach((button) => {
    button.disabled = !canScore();
  });

  elements.endInningsBtn.disabled = !canScore();
  elements.setBowler.disabled = !state.started || !elements.bowlerInput.value || state.awaitingOverBowler;
  elements.swapBatters.disabled = !state.started;
  elements.undoBtn.disabled = !state.started || state.history.length === 0;
  elements.applyBallEdit.disabled =
    !state.started || state.history.length === 0 || !isBallAction(state.lastAction);
  elements.confirmOverBowler.disabled =
    !state.started || !state.awaitingOverBowler || !elements.overBowlerSelect.value;
  elements.saveMatchBtn.disabled = !state.started;
}

function toggleMatchesEditMode() {
  if (savedMatches.length === 0) {
    return;
  }

  matchesEditMode = !matchesEditMode;
  render();
}

function endInningsNow() {
  if (!canScore()) {
    return;
  }

  pushHistory();
  setInningsComplete("Ended manually");
  addBallLogItem("Innings ended manually");
  state.lastAction = "utility:end-innings";
  persistAndRender();
}

function setupListeners() {
  elements.setupForm.addEventListener("submit", startMatchFromForm);
  elements.resumeSaved.addEventListener("click", resumeSavedMatch);
  elements.editMatchesBtn.addEventListener("click", toggleMatchesEditMode);
  elements.newMatchBtn.addEventListener("click", startNewMatchSession);

  [elements.syncSpace].forEach((element) => {
    if (!element) {
      return;
    }

    element.addEventListener("input", refreshSyncControlStates);
  });

  if (elements.connectSyncBtn) {
    elements.connectSyncBtn.addEventListener("click", () => {
      void connectCloudSync(false);
    });
  }

  if (elements.pullSyncBtn) {
    elements.pullSyncBtn.addEventListener("click", () => {
      void pullCloudBundle(true);
    });
  }

  if (elements.disconnectSyncBtn) {
    elements.disconnectSyncBtn.addEventListener("click", disconnectCloudSync);
  }

  [elements.matchType, elements.teamOneName, elements.teamTwoName, elements.teamOnePlayers, elements.teamTwoPlayers].forEach(
    (element) => element.addEventListener("input", refreshSetupSelectors)
  );
  [elements.tossWinner, elements.tossDecision, elements.strikerName].forEach((element) =>
    element.addEventListener("change", refreshSetupSelectors)
  );
  elements.editBallType.addEventListener("change", updateEditPanelFields);
  elements.overBowlerSelect.addEventListener("change", setControlStates);

  document.querySelectorAll("button.scoring").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      if (action === "runs") {
        recordRuns(toInt(button.dataset.runs, 0));
        return;
      }

      if (action === "wide") {
        recordWide();
        return;
      }

      if (action === "noball") {
        recordNoBall();
        return;
      }

      if (action === "bye" || action === "legbye") {
        recordBye(action);
        return;
      }

      if (action === "wicket") {
        recordWicket();
      }
    });
  });

  elements.setBowler.addEventListener("click", updateBowlerName);
  elements.swapBatters.addEventListener("click", swapBattersManual);
  elements.undoBtn.addEventListener("click", undoLast);
  elements.applyBallEdit.addEventListener("click", editPreviousBall);
  elements.confirmOverBowler.addEventListener("click", confirmOverBowlerSelection);
  elements.endInningsBtn.addEventListener("click", endInningsNow);
  elements.saveMatchBtn.addEventListener("click", saveMatchNow);
  elements.clearSavedBtn.addEventListener("click", clearSavedMatch);

  refreshSetupSelectors();
  refreshNextBatterSelectors();
  refreshOverBowlerModal();
  updateEditPanelFields();
}

async function initializeApp() {
  setupListeners();
  restoreMatchesBundle();
  resumeSavedMatch(true);
  if (!state.started) {
    setSaveStatus("Auto-save is on.");
  }
  render();
  await bootstrapCloudSync();
}

void initializeApp();
