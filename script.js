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
  "Ascendant 3": 2000
};

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

  const requiredPerDay =
    remainingDays > 0
      ? Math.ceil((requiredRR / remainingDays) * 10) / 10
      : requiredRR;

  const requiredWins =
    averageWinRR > 0 ? Math.ceil(requiredRR / averageWinRR) : 0;

  return {
    requiredRR,
    remainingDays,
    requiredPerDay,
    requiredWins
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

function getSeasonStats(historyJson) {
  const games = historyJson.data || [];

  const rrChanges = games
    .map(game => game.mmr_change_to_last_game)
    .filter(rr => typeof rr === "number" && rr !== 0);

  const wins = rrChanges.filter(rr => rr > 0);
  const losses = rrChanges.filter(rr => rr < 0);

  const matches = wins.length + losses.length;

  const winRate =
    matches > 0 ? Math.round((wins.length / matches) * 1000) / 10 : 0;

  const avgWinRR =
    wins.length > 0
      ? Math.round((wins.reduce((sum, rr) => sum + rr, 0) / wins.length) * 10) / 10
      : 22;

  const avgLossRR =
    losses.length > 0
      ? Math.round((losses.reduce((sum, rr) => sum + rr, 0) / losses.length) * 10) / 10
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

async function main() {
  try {
    const mmrJson = await fetchCurrentMMR();
    const historyJson = await fetchMMRHistory();

    const currentData = mmrJson.data.current_data;

    const currentRank = currentData.currenttierpatched;
    const currentRR = currentData.ranking_in_tier;

    const seasonStats = getSeasonStats(historyJson);

    const result = calculateProgress(
      currentRank,
      currentRR,
      seasonStats.avgWinRR
    );

    document.getElementById("currentRank").textContent = currentRank;
    document.getElementById("currentRR").textContent = `${currentRR} RR`;
    document.getElementById("remainingDays").textContent = `${result.remainingDays}日`;
    document.getElementById("requiredRR").textContent = `${result.requiredRR} RR`;
    document.getElementById("requiredPerDay").textContent = `${result.requiredPerDay} RR/日`;
    document.getElementById("requiredWins").textContent = `${result.requiredWins}勝`;

    document.getElementById("seasonMatches").textContent =
      `${seasonStats.matches}試合`;

    document.getElementById("seasonWinRate").textContent =
      `${seasonStats.winRate}%`;

    document.getElementById("seasonWins").textContent =
      `${seasonStats.wins}勝`;

    document.getElementById("seasonLosses").textContent =
      `${seasonStats.losses}敗`;

    document.getElementById("seasonAvgWinRR").textContent =
      `+${seasonStats.avgWinRR}RR`;

    document.getElementById("seasonAvgLossRR").textContent =
      `${seasonStats.avgLossRR}RR`;

    document.getElementById("message").textContent =
      result.requiredRR === 0
        ? "目標達成済みです。"
        : `勝利時平均 +${seasonStats.avgWinRR}RR で計算しています。`;
  } catch (error) {
    console.error(error);
    document.getElementById("message").textContent =
      "ランク情報の取得に失敗しました。Riot ID、タグ、APIキー、regionを確認してください。";
  }
}

main();
