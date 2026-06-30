const CONFIG = {
  riotName: "松本絃歩",
  riotTag: "ギャル",
  region: "ap",
  apiKey: "HDEV-cfe7edcd-5fca-4a04-a777-181a3a74aa60",

  targetRank: "Diamond 1",
  targetDate: "2026-09-01T00:00:00+09:00",

  // 今Act開始日：Season 2026 Act 4 / AP・日本向け
  actStartDate: "2026-06-24T00:00:00+09:00"
};

const rankPoints = {
  "Iron 1": 0,
  "Iron 2": 100,
  "Iron 3": 200,
  "Bronze 1": 300,
  "Bronze 2": 400,
  "Bronze 3": 500,
  "Silver 1": 600,
  "Silver 2": 700,
  "Silver 3": 800,
  "Gold 1": 900,
  "Gold 2": 1000,
  "Gold 3": 1100,
  "Platinum 1": 1200,
  "Platinum 2": 1300,
  "Platinum 3": 1400,
  "Diamond 1": 1500,
  "Diamond 2": 1600,
  "Diamond 3": 1700,
  "Ascendant 1": 1800,
  "Ascendant 2": 1900,
  "Ascendant 3": 2000,
  "Immortal 1": 2100,
  "Immortal 2": 2200,
  "Immortal 3": 2300,
  "Radiant": 2400
};

function round1(value) {
  return Math.round(value * 10) / 10;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function apiFetch(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey
    }
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return await res.json();
}

async function fetchCurrentMMR() {
  const url =
    `https://api.henrikdev.xyz/valorant/v2/mmr/${CONFIG.region}/` +
    `${encodeURIComponent(CONFIG.riotName)}/` +
    `${encodeURIComponent(CONFIG.riotTag)}`;

  return await apiFetch(url);
}

async function fetchMMRHistory() {
  const url =
    `https://api.henrikdev.xyz/valorant/v1/mmr-history/${CONFIG.region}/` +
    `${encodeURIComponent(CONFIG.riotName)}/` +
    `${encodeURIComponent(CONFIG.riotTag)}`;

  return await apiFetch(url);
}

async function fetchMatches() {
  const url =
    `https://api.henrikdev.xyz/valorant/v3/matches/${CONFIG.region}/` +
    `${encodeURIComponent(CONFIG.riotName)}/` +
    `${encodeURIComponent(CONFIG.riotTag)}` +
    `?mode=competitive&size=10`;

  return await apiFetch(url);
}

function getGameDate(game) {
  const rawDate =
    game.date ||
    game.date_raw ||
    game.started_at ||
    game.match_start ||
    game.match_start_time;

  if (!rawDate) return null;

  const date = new Date(rawDate);
  return isNaN(date) ? null : date;
}

function calculateProgress(currentRank, currentRR, averageWinRR) {
  const today = new Date();
  const targetDate = new Date(CONFIG.targetDate);

  const currentTotalRR = rankPoints[currentRank] + currentRR;
  const targetTotalRR = rankPoints[CONFIG.targetRank];

  const requiredRR = Math.max(targetTotalRR - currentTotalRR, 0);

  const msPerDay = 1000 * 60 * 60 * 24;
  const remainingDays = Math.max(
    Math.ceil((targetDate - today) / msPerDay),
    0
  );

  const remainingWeeks = remainingDays > 0 ? remainingDays / 7 : 0;

  const dailyRequiredRR =
    remainingDays > 0 ? round1(requiredRR / remainingDays) : requiredRR;

  const weeklyRequiredRR =
    remainingWeeks > 0 ? round1(requiredRR / remainingWeeks) : requiredRR;

  const totalRequiredWins =
    averageWinRR > 0 ? Math.ceil(requiredRR / averageWinRR) : 0;

  const dailyRequiredWins =
    remainingDays > 0 ? round1(totalRequiredWins / remainingDays) : totalRequiredWins;

  const weeklyRequiredWins =
    remainingWeeks > 0 ? round1(totalRequiredWins / remainingWeeks) : totalRequiredWins;

  return {
    requiredRR,
    remainingDays,
    dailyRequiredRR,
    weeklyRequiredRR,
    totalRequiredWins,
    dailyRequiredWins,
    weeklyRequiredWins
  };
}

function getActStats(historyJson) {
  const games = historyJson.data || [];
  const actStart = new Date(CONFIG.actStartDate);

  const validGames = games.filter(game => {
    const rr = game.mmr_change_to_last_game;
    const date = getGameDate(game);

    return (
      typeof rr === "number" &&
      rr !== 0 &&
      date &&
      date >= actStart
    );
  });

  const rrChanges = validGames.map(game => game.mmr_change_to_last_game);

  const wins = rrChanges.filter(rr => rr > 0);
  const losses = rrChanges.filter(rr => rr < 0);

  const matches = wins.length + losses.length;

  const winRate =
    matches > 0 ? round1((wins.length / matches) * 100) : 0;

  const avgWinRR =
    wins.length > 0
      ? round1(wins.reduce((sum, rr) => sum + rr, 0) / wins.length)
      : 22;

  const avgLossRR =
    losses.length > 0
      ? round1(losses.reduce((sum, rr) => sum + rr, 0) / losses.length)
      : 0;

  const dates = validGames
    .map(getGameDate)
    .filter(Boolean);

  let periodText = "今Act";

  if (dates.length > 0) {
    const oldest = new Date(Math.min(...dates));
    const newest = new Date(Math.max(...dates));

    periodText =
      `${oldest.getFullYear()}/${oldest.getMonth() + 1}/${oldest.getDate()}` +
      `〜` +
      `${newest.getFullYear()}/${newest.getMonth() + 1}/${newest.getDate()}`;
  }

  return {
    matches,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWinRR,
    avgLossRR,
    periodText
  };
}

function getKD(matchesJson) {
  const matches = matchesJson.data || [];
  const actStart = new Date(CONFIG.actStartDate);

  let kills = 0;
  let deaths = 0;

  for (const match of matches) {
    const metadata = match.metadata || {};
    const matchDateRaw =
      metadata.started_at ||
      metadata.game_start ||
      metadata.game_start_patched ||
      metadata.match_start_time;

    if (matchDateRaw) {
      const matchDate = new Date(matchDateRaw);
      if (!isNaN(matchDate) && matchDate < actStart) continue;
    }

    const players = match.players?.all_players || [];

    const me = players.find(player => {
      const nameMatch =
        player.name?.toLowerCase() === CONFIG.riotName.toLowerCase();

      const tagMatch =
        player.tag?.toLowerCase() === CONFIG.riotTag.toLowerCase();

      return nameMatch && tagMatch;
    });

    if (!me) continue;

    kills += me.stats?.kills || 0;
    deaths += me.stats?.deaths || 0;
  }

  if (kills === 0 && deaths === 0) {
    return null;
  }

  if (deaths === 0) {
    return kills > 0 ? kills.toFixed(2) : "0.00";
  }

  return (kills / deaths).toFixed(2);
}

async function main() {
  try {
    const mmrJson = await fetchCurrentMMR();
    const historyJson = await fetchMMRHistory();

    const currentData = mmrJson.data.current_data;

    const currentRank = currentData.currenttierpatched;
    const currentRR = currentData.ranking_in_tier;

    const actStats = getActStats(historyJson);

    const result = calculateProgress(
      currentRank,
      currentRR,
      actStats.avgWinRR
    );

    setText("topRank", currentRank);
    setText("topRR", `${currentRR} RR`);
    setText("topWinRate", `${actStats.winRate}%`);

    setText("challengeDays", `${result.remainingDays}日`);
    setText("challengeRequiredRR", `${result.requiredRR} RR`);

    setText("dailyRequiredRR", `${result.dailyRequiredRR} RR/日`);
    setText("dailyRequiredWins", `${result.dailyRequiredWins} 勝/日`);

    setText("weeklyRequiredRR", `${result.weeklyRequiredRR} RR/週`);
    setText("weeklyRequiredWins", `${result.weeklyRequiredWins} 勝/週`);

    setText("seasonMatches", `${actStats.matches}試合`);
    setText("seasonWinRate", `${actStats.winRate}%`);
    setText("seasonWins", `${actStats.wins}勝`);
    setText("seasonLosses", `${actStats.losses}敗`);
    setText("seasonAvgWinRR", `+${actStats.avgWinRR}RR`);
    setText("seasonAvgLossRR", `${actStats.avgLossRR}RR`);
    setText("seasonPeriod", `集計期間：${actStats.periodText}`);

    setText(
      "message",
      `今Actの勝利時平均 +${actStats.avgWinRR}RR で、ダイヤモンドチャレンジ達成までの必要ペースを計算しています。`
    );

    try {
      const matchesJson = await fetchMatches();
      const kd = getKD(matchesJson);

      setText("topKD", kd ? kd : "取得不可");
    } catch (kdError) {
      console.warn("KD取得だけ失敗:", kdError);
      setText("topKD", "取得失敗");
    }
  } catch (error) {
    console.error(error);

    setText("message", "ランク情報の取得に失敗しました。Riot ID、タグ、APIキー、regionを確認してください。");
    setText("topRank", "取得失敗");
    setText("topRR", "- RR");
    setText("topWinRate", "-");
    setText("topKD", "-");
  }
}

main();
