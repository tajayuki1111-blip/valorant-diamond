// ===============================
// VALORANT Act Tracker
// Henrik API + localStorage蓄積版
// ===============================

// ===== 設定 =====
const CONFIG = {
  riotName: "松本絃歩",
  riotTag: "ギャル",
  region: "ap",

  // 注意：公開サイトに直書きするとAPIキーは見えます
  apiKey: "HDEV-cfe7edcd-5fca-4a04-a777-181a3a74aa60",

  // 今Act開始日
  actStart: "2026-06-24T00:00:00+09:00",

  // 一度に取る最大試合数
  fetchSize: 50,

  // localStorage保存キー
  storageKey: "valorant_matches_cache_v1"
};

// ===== DOM =====
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getEl(id) {
  return document.getElementById(id);
}

// ===== localStorage =====
function loadSavedMatches() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("保存データ読み込み失敗:", error);
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
  location.reload();
}

// ===== Henrik API =====
async function fetchLatestMatches() {
  const encodedName = encodeURIComponent(CONFIG.riotName);
  const encodedTag = encodeURIComponent(CONFIG.riotTag);

  const url =
    `https://api.henrikdev.xyz/valorant/v3/matches/${CONFIG.region}/${encodedName}/${encodedTag}?size=${CONFIG.fetchSize}`;

  console.log("fetch URL:", url);

  const response = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey
    }
  });

  const data = await response.json();

  console.log("HTTP status:", response.status);
  console.log("API raw:", data);

  if (!response.ok) {
    throw new Error(`API取得失敗: HTTP ${response.status}`);
  }

  if (!Array.isArray(data.data)) {
    console.error("data.data が配列ではありません:", data);
    return [];
  }

  return data.data;
}

// ===== match情報取り出し =====
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

function isCompetitive(match) {
  const meta = match?.metadata || {};

  const mode = String(meta.mode || "").toLowerCase();
  const modeId = String(meta.mode_id || "").toLowerCase();
  const queue = String(meta.queue || "").toLowerCase();

  return (
    mode.includes("competitive") ||
    modeId.includes("competitive") ||
    queue.includes("competitive") ||
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

// ===== 保存済みと今回取得分を合体 =====
function mergeMatches(saved, latest) {
  const map = new Map();

  for (const match of saved) {
    const id = getMatchId(match);
    if (id) map.set(id, match);
  }

  let added = 0;

  for (const match of latest) {
    const id = getMatchId(match);
    if (!id) continue;

    if (!map.has(id)) {
      added++;
    }

    map.set(id, match);
  }

  const merged = Array.from(map.values()).sort((a, b) => {
    return getMatchTimestamp(b) - getMatchTimestamp(a);
  });

  return { merged, added };
}

function filterActMatches(matches) {
  const actStartMs = new Date(CONFIG.actStart).getTime();

  return matches.filter(match => {
    const t = getMatchTimestamp(match);
    return t >= actStartMs;
  });
}

// ===== 集計 =====
function calculateStats(matches) {
  const competitiveMatches = matches.filter(isCompetitive);

  let wins = 0;
  let losses = 0;
  let unknown = 0;

  for (const match of competitiveMatches) {
    const won = didMyTeamWin(match);

    if (won === true) {
      wins++;
    } else if (won === false) {
      losses++;
    } else {
      unknown++;
    }
  }

  const played = competitiveMatches.length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  return {
    played,
    wins,
    losses,
    unknown,
    winRate,
    matches: competitiveMatches
  };
}

// ===== 表示 =====
function formatDate(ms) {
  if (!ms) return "不明";

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ms));
}

function renderStats(stats, allSaved, added) {
  setText("matchCount", stats.played);
  setText("winCount", stats.wins);
  setText("lossCount", stats.losses);
  setText("winRate", `${stats.winRate}%`);
  setText("savedCount", allSaved.length);
  setText("addedCount", added);

  const latest = stats.matches[0];
  const latestTime = latest ? getMatchTimestamp(latest) : 0;

  setText("latestMatch", latestTime ? formatDate(latestTime) : "なし");
  setText("periodText", "集計期間：2026/6/24〜現在");

  const unknownText =
    stats.unknown > 0 ? ` / 勝敗不明 ${stats.unknown}試合` : "";

  setText(
    "summaryText",
    `今Actのコンペは${stats.played}試合、${stats.wins}勝${stats.losses}敗、勝率${stats.winRate}%です${unknownText}。`
  );
}

function renderMatchList(matches) {
  const list = getEl("matchList");
  if (!list) return;

  if (!matches.length) {
    list.innerHTML = `<p class="muted">まだ試合データがありません。</p>`;
    return;
  }

  const html = matches.slice(0, 15).map(match => {
    const won = didMyTeamWin(match);
    const resultText = won === true ? "WIN" : won === false ? "LOSS" : "UNKNOWN";
    const resultClass = won === true ? "win" : won === false ? "loss" : "unknown";

    const map = getMapName(match);
    const date = formatDate(getMatchTimestamp(match));

    return `
      <div class="match-item">
        <div class="match-result ${resultClass}">${resultText}</div>
        <div>
          <div class="match-map">${map}</div>
          <div class="match-date">${date}</div>
        </div>
        <div class="match-date">Competitive</div>
      </div>
    `;
  }).join("");

  list.innerHTML = html;
}

// ===== メイン処理 =====
async function main() {
  try {
    setText("statusText", "取得中...");

    const saved = loadSavedMatches();
    const latest = await fetchLatestMatches();

    console.log("保存済み:", saved.length);
    console.log("今回取得:", latest.length);

    const { merged, added } = mergeMatches(saved, latest);

    saveMatches(merged);

    const actMatches = filterActMatches(merged);
    const stats = calculateStats(actMatches);

    console.log("保存後合計:", merged.length);
    console.log("今Act対象:", actMatches.length);
    console.log("集計結果:", stats);

    renderStats(stats, merged, added);
    renderMatchList(stats.matches);

    setText(
      "statusText",
      `更新完了：新規${added}試合追加 / 保存済み${merged.length}試合`
    );

  } catch (error) {
    console.error(error);
    setText("statusText", "取得エラー。Consoleを確認してください。");
  }
}


function setup() {
  console.log("script.js 読み込み成功");

  const reloadButton = getEl("reloadButton");
  const resetButton = getEl("resetButton");

  if (reloadButton) {
    reloadButton.addEventListener("click", main);
  }

  if (resetButton) {
    resetButton.addEventListener("click", clearSavedMatches);
  }

  main();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}
