// ===============================
// VALORANT Diamond Challenge
// Henrik API + localStorage軽量保存
// 必要RRは「ランク名 + 現在RR」から計算
// ===============================

const CONFIG = {
  riotName: "松本絃歩",
  riotTag: "ギャル",
  region: "ap",

  apiKey: "HDEV-cfe7edcd-5fca-4a04-a777-181a3a74aa60",

  // 目標期限
  challengeEnd: "2026-09-01T23:59:59+09:00",

  // 目標ランク
  targetRank: "Diamond 1",

  // 直近何試合で勝率・KD・平均RRを計算するか
  recentMatchCount: 10,

  // 勝利時+RRは直近勝利5戦、敗北時-RRは直近敗北5戦で計算
  recentWinLossRRCount: 5,

  // APIに要求する試合数
  fetchSize: 50,

  // 保存上限
  maxSavedMatches: 300,

  storageKey: "valorant_matches_cache_challenge_v3"
};

let lastChallenge = null;

const RANK_ORDER = [
  "Iron 1",
  "Iron 2",
  "Iron 3",
  "Bronze 1",
  "Bronze 2",
  "Bronze 3",
  "Silver 1",
  "Silver 2",
  "Silver 3",
  "Gold 1",
  "Gold 2",
  "Gold 3",
  "Platinum 1",
  "Platinum 2",
  "Platinum 3",
  "Diamond 1",
  "Diamond 2",
  "Diamond 3",
  "Ascendant 1",
  "Ascendant 2",
  "Ascendant 3",
  "Immortal 1",
  "Immortal 2",
  "Immortal 3",
  "Radiant"
];

// ===============================
// DOM
// ===============================
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getEl(id) {
  return document.getElementById(id);
}

// ===============================
// localStorage
// ===============================
function loadSavedMatches() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMatches(matches) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(matches));
}

function clearSavedMatches() {
  const ok = confirm("保存済みの試合データをリセットしますか？");
  if (!ok) return;

  localStorage.removeItem(CONFIG.storageKey);
  localStorage.removeItem("valorant_matches_cache_v1");
  localStorage.removeItem("valorant_matches_cache_light_v1");
  localStorage.removeItem("valorant_matches_cache_light_v2");
  localStorage.removeItem("valorant_matches_cache_challenge_v1");
  localStorage.removeItem("valorant_matches_cache_challenge_v2");
  localStorage.removeItem("valorant_matches_cache_challenge_v3");

  location.reload();
}

// ===============================
// API
// ===============================
function getEncodedPlayer() {
  return {
    name: encodeURIComponent(CONFIG.riotName),
    tag: encodeURIComponent(CONFIG.riotTag)
  };
}

async function fetchLatestMatches() {
  const encoded = getEncodedPlayer();

  const url =
    `https://api.henrikdev.xyz/valorant/v3/matches/${CONFIG.region}/${encoded.name}/${encoded.tag}?size=${CONFIG.fetchSize}`;

  const response = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey,
      Accept: "*/*"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`試合取得失敗: HTTP ${response.status}`);
  }

  if (!Array.isArray(data.data)) {
    throw new Error("試合データを取得できませんでした");
  }

  return data.data;
}

async function fetchCurrentMMR() {
  const encoded = getEncodedPlayer();

  const url =
    `https://api.henrikdev.xyz/valorant/v1/mmr/${CONFIG.region}/${encoded.name}/${encoded.tag}`;

  const response = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey,
      Accept: "*/*"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`MMR取得失敗: HTTP ${response.status}`);
  }

  return data.data;
}

async function fetchMMRHistory() {
  const encoded = getEncodedPlayer();

  const url =
    `https://api.henrikdev.xyz/valorant/v1/mmr-history/${CONFIG.region}/${encoded.name}/${encoded.tag}`;

  const response = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey,
      Accept: "*/*"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`MMR履歴取得失敗: HTTP ${response.status}`);
  }

  return Array.isArray(data.data) ? data.data : [];
}

// ===============================
// 試合データ処理
// ===============================
function getMatchId(match) {
  return (
    match?.metadata?.matchid ||
    match?.metadata?.match_id ||
    match?.metadata?.id ||
    match?.match_id ||
    match?.id ||
    null
  );
}

function getMatchTimestamp(match) {
  const meta = match?.metadata || {};

  if (typeof meta.game_start === "number") {
    return meta.game_start * 1000;
  }

  if (typeof meta.game_start_ms === "number") {
    return meta.game_start_ms;
  }

  const candidates = [
    meta.game_start_patched,
    meta.started_at,
    meta.start_time,
    match?.started_at,
    match?.start_time
  ];

  for (const value of candidates) {
    if (!value) continue;

    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return t;
  }

  return 0;
}

function getMapName(match) {
  return (
    match?.metadata?.map ||
    match?.metadata?.map_name ||
    "Unknown Map"
  );
}

function getMode(match) {
  return String(
    match?.metadata?.mode ||
    match?.metadata?.mode_id ||
    match?.metadata?.queue ||
    ""
  );
}

function isCompetitive(match) {
  const mode = String(match.mode || getMode(match)).toLowerCase();

  return (
    mode.includes("competitive") ||
    mode.includes("コンペ")
  );
}

function getAllPlayers(match) {
  if (Array.isArray(match?.players?.all_players)) {
    return match.players.all_players;
  }

  if (Array.isArray(match?.players)) {
    return match.players;
  }

  return [];
}

function findMyPlayer(match) {
  const players = getAllPlayers(match);

  const myName = CONFIG.riotName.toLowerCase();
  const myTag = CONFIG.riotTag.toLowerCase();

  return players.find(player => {
    const name = String(
      player?.name ||
      player?.gameName ||
      player?.riotIdGameName ||
      ""
    ).toLowerCase();

    const tag = String(
      player?.tag ||
      player?.tagLine ||
      player?.riotIdTagline ||
      ""
    ).toLowerCase();

    return name === myName && tag === myTag;
  });
}

function getPlayerTeam(player) {
  if (!player) return null;

  return String(
    player.team ||
    player.team_id ||
    player.teamId ||
    ""
  ).toLowerCase();
}

function didMyTeamWin(match) {
  const me = findMyPlayer(match);
  const team = getPlayerTeam(me);

  if (!team) return null;

  const teams = match?.teams || {};

  const redWon =
    teams?.red?.has_won ??
    teams?.Red?.has_won ??
    teams?.red?.won ??
    teams?.Red?.won;

  const blueWon =
    teams?.blue?.has_won ??
    teams?.Blue?.has_won ??
    teams?.blue?.won ??
    teams?.Blue?.won;

  if (team.includes("red")) return Boolean(redWon);
  if (team.includes("blue")) return Boolean(blueWon);

  return null;
}

function simplifyMatch(match) {
  const me = findMyPlayer(match);
  const won = didMyTeamWin(match);

  return {
    id: getMatchId(match),
    timestamp: getMatchTimestamp(match),
    map: getMapName(match),
    mode: getMode(match),
    won,
    kills: Number(me?.stats?.kills ?? me?.kills ?? 0),
    deaths: Number(me?.stats?.deaths ?? me?.deaths ?? 0),
    assists: Number(me?.stats?.assists ?? me?.assists ?? 0)
  };
}

function mergeMatches(saved, latestRaw) {
  const latest = latestRaw
    .map(simplifyMatch)
    .filter(match => match.id);

  const map = new Map();

  for (const match of saved) {
    if (match.id) map.set(match.id, match);
  }

  let added = 0;

  for (const match of latest) {
    if (!map.has(match.id)) added++;
    map.set(match.id, match);
  }

  const merged = Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, CONFIG.maxSavedMatches);

  return { merged, added };
}

// ===============================
// 直近試合の勝率・KD
// ===============================
function calculateRecentMatchStats(matches) {
  const recent = matches
    .filter(isCompetitive)
    .slice(0, CONFIG.recentMatchCount);

  let wins = 0;
  let losses = 0;
  let unknown = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;

  for (const match of recent) {
    if (match.won === true) wins++;
    else if (match.won === false) losses++;
    else unknown++;

    kills += Number(match.kills || 0);
    deaths += Number(match.deaths || 0);
    assists += Number(match.assists || 0);
  }

  const played = recent.length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);

  return {
    played,
    wins,
    losses,
    unknown,
    winRate,
    kills,
    deaths,
    assists,
    kd,
    matches: recent
  };
}

// ===============================
// ランク・必要RR計算
// ===============================
function normalizeRankName(rankName) {
  const raw = String(rankName || "").trim();

  const lower = raw.toLowerCase();

  const rankMap = [
    "Iron",
    "Bronze",
    "Silver",
    "Gold",
    "Platinum",
    "Diamond",
    "Ascendant",
    "Immortal",
    "Radiant"
  ];

  for (const rank of rankMap) {
    const rankLower = rank.toLowerCase();

    if (lower.includes(rankLower)) {
      if (rank === "Radiant") return "Radiant";

      const m = raw.match(/[123]/);
      if (m) return `${rank} ${m[0]}`;
    }
  }

  return raw;
}

function getRankIndex(rankName) {
  const normalized = normalizeRankName(rankName);
  return RANK_ORDER.indexOf(normalized);
}

function getCurrentRR(mmr) {
  return Number(
    mmr?.ranking_in_tier ??
    mmr?.current_data?.ranking_in_tier ??
    0
  );
}

function getCurrentRankName(mmr) {
  return (
    mmr?.currenttierpatched ||
    mmr?.current_data?.currenttierpatched ||
    "不明"
  );
}

function calculateRemainingRR(currentRank, currentRR) {
  const currentIndex = getRankIndex(currentRank);
  const targetIndex = getRankIndex(CONFIG.targetRank);

  if (currentIndex === -1 || targetIndex === -1) {
    return 0;
  }

  if (currentIndex >= targetIndex) {
    return 0;
  }

  return Math.max(0, (targetIndex - currentIndex) * 100 - currentRR);
}

// ===============================
// MMR / RR履歴計算
// ===============================
function getRRChange(item) {
  const candidates = [
    item?.mmr_change_to_last_game,
    item?.mmr_change,
    item?.rr_change,
    item?.change,
    item?.elo_change
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (!Number.isNaN(n) && n !== 0) return n;
  }

  return 0;
}

function calculateRRStats(mmrHistory) {
  const changes = mmrHistory
    .map(item => getRRChange(item))
    .filter(n => n !== 0);

  // 平均RR/試合は直近10試合
  const recentChanges = changes.slice(0, CONFIG.recentMatchCount);

  // 勝利時+RRは直近の勝利5試合
  const recentWins = changes
    .filter(n => n > 0)
    .slice(0, CONFIG.recentWinLossRRCount);

  // 敗北時-RRは直近の敗北5試合
  const recentLosses = changes
    .filter(n => n < 0)
    .slice(0, CONFIG.recentWinLossRRCount);

  const avgWinRR =
    recentWins.length > 0
      ? Math.round(recentWins.reduce((a, b) => a + b, 0) / recentWins.length)
      : 0;

  const avgLossRR =
    recentLosses.length > 0
      ? Math.round(Math.abs(recentLosses.reduce((a, b) => a + b, 0) / recentLosses.length))
      : 0;

  const avgRRPerMatch =
    recentChanges.length > 0
      ? Math.round((recentChanges.reduce((a, b) => a + b, 0) / recentChanges.length) * 10) / 10
      : 0;

  return {
    recentRRCount: recentChanges.length,
    avgWinRR,
    avgLossRR,
    avgRRPerMatch,
    recentChanges,
    recentWinCountForRR: recentWins.length,
    recentLossCountForRR: recentLosses.length
  };
}

function calculateChallenge(mmr, mmrHistory) {
  const now = new Date();
  const deadline = new Date(CONFIG.challengeEnd);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.max(0, Math.ceil((deadline - now) / msPerDay));

  const currentRR = getCurrentRR(mmr);
  const currentRank = getCurrentRankName(mmr);

  const remainingRR = calculateRemainingRR(currentRank, currentRR);

  const rrStats = calculateRRStats(mmrHistory);
  const avgRRPerMatch = rrStats.avgRRPerMatch;

  const neededMatches =
    avgRRPerMatch > 0
      ? Math.ceil(remainingRR / avgRRPerMatch)
      : null;

  const requiredRRPerDay =
    daysLeft > 0
      ? Math.ceil(remainingRR / daysLeft)
      : remainingRR;

  return {
    daysLeft,
    currentRR,
    currentRank,
    remainingRR,
    neededMatches,
    requiredRRPerDay,
    ...rrStats
  };
}

function calculateArrivalDate(challenge) {
  const daysInput = getEl("playDaysPerWeek");
  const matchesInput = getEl("matchesPerDay");

  const playDaysPerWeek = Number(daysInput?.value || 0);
  const matchesPerDay = Number(matchesInput?.value || 0);

  if (!challenge || challenge.remainingRR <= 0) {
    return {
      status: "到達済み",
      note: "到達予定日：到達済み\nチャレンジ成功"
    };
  }

  if (challenge.avgRRPerMatch <= 0) {
    return {
      status: "到達不可",
      note: "到達予定日：算出不可\nチャレンジ失敗"
    };
  }

  if (playDaysPerWeek <= 0 || matchesPerDay <= 0) {
    return {
      status: "入力不足",
      note: "到達予定日：入力不足\n週日数と試合数を入力"
    };
  }

  const matchesPerWeek = playDaysPerWeek * matchesPerDay;
  const expectedRRPerWeek = matchesPerWeek * challenge.avgRRPerMatch;

  if (expectedRRPerWeek <= 0) {
    return {
      status: "到達不可",
      note: "到達予定日：算出不可\nチャレンジ失敗"
    };
  }

  const weeksNeeded = challenge.remainingRR / expectedRRPerWeek;
  const daysNeeded = Math.ceil(weeksNeeded * 7);

  const arrival = new Date();
  arrival.setDate(arrival.getDate() + daysNeeded);

  const deadline = new Date(CONFIG.challengeEnd);
  const canReachByDeadline = arrival <= deadline;

  const arrivalText = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(arrival);

  return {
    status: canReachByDeadline ? "到達可能" : "到達不可",
    note: `到達予定日：${arrivalText}\nチャレンジ${canReachByDeadline ? "成功" : "失敗"}`
  };
}

// ===============================
// 表示
// ===============================
function formatDate(ms) {
  if (!ms) return "不明";

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ms));
}

function renderRecentStats(stats, challenge) {
  setText("matchCount", stats.played);
  setText("winCount", stats.wins);
  setText("lossCount", stats.losses);
  setText("winRate", `${stats.winRate}%`);

  setText("recentKD", stats.kd);
  setText("recentKDA", `${stats.kills} / ${stats.deaths} / ${stats.assists}`);

  const latest = stats.matches[0];
  const latestTime = latest ? latest.timestamp : 0;
  setText("latestMatch", latestTime ? formatDate(latestTime) : "なし");

  const unknownText =
    stats.unknown > 0 ? `、勝敗不明${stats.unknown}試合` : "";

  const rrText = challenge
    ? `平均RR ${challenge.avgRRPerMatch}RR/試合、直近勝利${challenge.recentWinCountForRR}戦の平均 +${challenge.avgWinRR}RR、直近敗北${challenge.recentLossCountForRR}戦の平均 -${challenge.avgLossRR}RR。`
    : "";

  setText(
    "summaryText",
    `直近${stats.played}試合：${stats.wins}勝${stats.losses}敗${unknownText}、勝率${stats.winRate}%、KD ${stats.kd}。${rrText}`
  );
}

function renderChallenge(challenge) {
  lastChallenge = challenge;

  setText("bigDaysLeft", challenge.daysLeft);
  setText("bigCurrentRank", challenge.currentRank);
  setText("bigCurrentRR", challenge.currentRR);
  setText("topRemainingRR", challenge.remainingRR);

  setText("currentRR", challenge.currentRR);
  setText("remainingRR", challenge.remainingRR);
  setText("avgRRPerMatch", challenge.avgRRPerMatch);
  setText("avgWinRR", challenge.avgWinRR);
  setText("avgLossRR", challenge.avgLossRR);
  setText("requiredRRPerDay", challenge.requiredRRPerDay);

  if (challenge.neededMatches === null) {
    setText("neededMatches", "到達不可");
  } else {
    setText("neededMatches", `${challenge.neededMatches}試合`);
  }

  const result = calculateArrivalDate(challenge);

  const statusEl = getEl("challengeStatus");
  if (statusEl) {
    statusEl.textContent = result.status;
    statusEl.classList.remove("ok", "ng");

    if (result.status === "到達可能" || result.status === "到達済み") {
      statusEl.classList.add("ok");
    }

    if (result.status === "到達不可") {
      statusEl.classList.add("ng");
    }
  }

  setText("challengeNote", result.note);
}

function renderMatchList(matches) {
  const list = getEl("matchList");
  if (!list) return;

  if (!matches.length) {
    list.innerHTML = `<p class="muted">まだ試合データがありません。</p>`;
    return;
  }

  const html = matches.map(match => {
    const resultText =
      match.won === true ? "WIN" :
      match.won === false ? "LOSS" :
      "UNKNOWN";

    const resultClass =
      match.won === true ? "win" :
      match.won === false ? "loss" :
      "unknown";

    return `
      <div class="match-item">
        <div class="match-result ${resultClass}">${resultText}</div>
        <div>
          <div class="match-map">${match.map}</div>
          <div class="match-date">${formatDate(match.timestamp)}</div>
        </div>
        <div class="match-date">K/D ${match.kills}/${match.deaths}</div>
      </div>
    `;
  }).join("");

  list.innerHTML = html;
}

// ===============================
// メイン
// ===============================
async function main() {
  try {
    setText("statusText", "取得中...");

    const saved = loadSavedMatches();

    const [latestRaw, currentMMR, mmrHistory] = await Promise.all([
      fetchLatestMatches(),
      fetchCurrentMMR(),
      fetchMMRHistory()
    ]);

    const { merged, added } = mergeMatches(saved, latestRaw);
    saveMatches(merged);

    const recentStats = calculateRecentMatchStats(merged);
    const challenge = calculateChallenge(currentMMR, mmrHistory);

    renderRecentStats(recentStats, challenge);
    renderChallenge(challenge);
    renderMatchList(recentStats.matches);

    setText(
      "statusText",
      `更新完了：新規${added}試合追加 / 保存済み${merged.length}試合`
    );

  } catch (error) {
    console.error(error);
    setText("statusText", `取得エラー：${error.message}`);
  }
}

// ===============================
// 起動
// ===============================
function setup() {
  const reloadButton = getEl("reloadButton");
  const resetButton = getEl("resetButton");
  const calcPaceButton = getEl("calcPaceButton");

  if (reloadButton) {
    reloadButton.addEventListener("click", main);
  }

  if (resetButton) {
    resetButton.addEventListener("click", clearSavedMatches);
  }

  if (calcPaceButton) {
    calcPaceButton.addEventListener("click", () => {
      if (lastChallenge) {
        renderChallenge(lastChallenge);
      }
    });
  }

  main();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}
