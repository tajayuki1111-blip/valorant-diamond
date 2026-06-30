const CONFIG = {
  riotName: "松本絃歩",
  riotTag: "ギャル",
  region: "ap",
  apiKey: "HDEV-cfe7edcd-5fca-4a04-a777-181a3a74aa60",

  targetRank: "Diamond 1",
  targetDate: "2026-09-01T00:00:00+09:00"
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

async function fetchCurrentMMR() {
  const url =
    `https://api.henrikdev.xyz/valorant/v2/mmr/${CONFIG.region}/` +
    `${encodeURIComponent(CONFIG.riotName)}/` +
    `${encodeURIComponent(CONFIG.riotTag)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey
    }
  });

  if (!res.ok) {
    throw new Error("MMR取得に失敗しました");
  }

  return await res.json();
}

async function fetchMMRHistory() {
  const url =
    `https://api.henrikdev.xyz/valorant/v1/mmr-history/${CONFIG.region}/` +
    `${encodeURIComponent(CONFIG.riotName)}/` +
    `${encodeURIComponent(CONFIG.riotTag)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey
    }
  });

  if (!res.ok) {
    throw new Error("MMR履歴取得に失敗しました");
  }

  return await res.json();
}

async function fetchMatches() {
  const url =
    `https://api.henrikdev.xyz/valorant/v3/matches/${CONFIG.region}/` +
    `${encodeURIComponent(CONFIG.riotName)}/` +
    `${encodeURIComponent(CONFIG.riotTag)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: CONFIG.apiKey
    }
  });

  if (!res.ok) {
    throw new Error("試合履歴取得に失敗しました");
  }

  return await res.json();
}

function getSeasonStats(historyJson) {
  const games = historyJson.data || [];

  const rrChanges = games
    .map(game => game.mmr_change_to_last_game)
    .filter(rr => typeof rr === "number" && rr !== 0);

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

  return {
    matches,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWinRR,
    avgLossRR
  };
}

function getKD(matchesJson) {
  const matches = matchesJson.data || [];

  let kills = 0;
  let deaths = 0;

  for (const match of matches) {
    const players = match.players?.all_players || [];

    const me = players.find(player =>
      player.name?.toLowerCase() === CONFIG.riotName.toLowerCase() &&
      player.tag?.toLowerCase() === CONFIG.riotTag.toLowerCase()
    );

    if (!me) continue;

    kills += me.stats?.kills || 0;
    deaths += me.stats?.deaths || 0;
  }

  if (deaths === 0) {
    return kills > 0 ? kills.toFixed(2) : "0.00";
  }

  return (kills / deaths).toFixed(2);
}

async function main() {
  try {
    const [mmrJson, historyJson, matchesJson] = await Promise.all([
      fetchCurrentMMR(),
      fetchMMRHistory(),
      fetchMatches()
    ]);

    const currentData = mmrJson.data.current_data;

    const currentRank = currentData.currenttierpatched;
    const currentRR = currentData.ranking_in_tier;

    const seasonStats = getSeasonStats(historyJson);
    const kd = getKD(matchesJson);

    const result = calculateProgress(
      currentRank,
      currentRR,
      seasonStats.avgWinRR
    );

    document.getElementById("topRank").textContent = currentRank;
    document.getElementById("topRR").textContent = `${currentRR} RR`;
    document.getElementById("topWinRate").textContent = `${seasonStats.winRate}%`;
    document.getElementById("topKD").textContent = kd;

    document.getElementById("challengeDays").textContent =
      `${result.remainingDays}日`;

    document.getElementById("challengeRequiredRR").textContent =
      `${result.requiredRR} RR`;

    document.getElementById("dailyRequiredRR").textContent =
      `${result.dailyRequiredRR} RR/日`;

    document.getElementById("dailyRequiredWins").textContent =
      `${result.dailyRequiredWins} 勝/日`;

    document.getElementById("weeklyRequiredRR").textContent =
      `${result.weeklyRequiredRR} RR/週`;

    document.getElementById("weeklyRequiredWins").textContent =
      `${result.weeklyRequiredWins} 勝/週`;

    document.getElementById("seasonMatches").textContent =
      `${seasonStats.matches}試合`;

    document.getElementById("seasonWins").textContent =
      `${seasonStats.wins}勝`;

    document.getElementById("seasonLosses").textContent =
      `${seasonStats.losses}敗`;

    document.getElementById("seasonWinRate").textContent =
      `${seasonStats.winRate}%`;

    document.getElementById("seasonAvgWinRR").textContent =
      `+${seasonStats.avgWinRR}RR`;

    document.getElementById("seasonAvgLossRR").textContent =
      `${seasonStats.avgLossRR}RR`;

    document.getElementById("message").textContent =
      result.requiredRR === 0
        ? "目標達成済みです。次はDiamond 2を目指せます。"
        : `勝利時平均 +${seasonStats.avgWinRR}RR で、ダイヤモンドチャレンジ達成までの必要ペースを計算しています。`;
  } catch (error) {
    console.error(error);

    document.getElementById("message").textContent =
      "ランク情報の取得に失敗しました。Riot ID、タグ、APIキー、regionを確認してください。";
  }
}

main();
