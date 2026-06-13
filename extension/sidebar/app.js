async function init() {
  showScreen("loading")
  const { apiToken } = await chrome.storage.local.get("apiToken")

  if (!apiToken) {
    showScreen("auth")
    return
  }

  await loadTrends()
}

document.getElementById("btn-connect").addEventListener("click", async () => {
  const token = document.getElementById("token-input").value.trim()
  if (!token) return

  await chrome.storage.local.set({ apiToken: token })
  await loadTrends()
})

document.getElementById("btn-logout").addEventListener("click", async () => {
  await chrome.storage.local.remove("apiToken")
  showScreen("auth")
})

document.getElementById("niche-select").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ selectedNiche: e.target.value })
  await loadTrends()
})

async function loadTrends() {
  showScreen("loading")

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve)
  })

  if (response.error === "NOT_AUTHENTICATED") {
    showScreen("auth")
    return
  }

  if (response.error) {
    showError("Erreur de connexion. Réessayez.")
    return
  }

  const { trends, plan } = response.data
  renderTrends(trends, plan)
  showScreen("main")
}

function renderTrends(trends, plan) {
  const badge = document.getElementById("plan-badge")
  badge.textContent = "Plan " + plan
  badge.className = plan === "FREE" ? "badge-free" : "badge-pro"

  const upgradeBanner = document.getElementById("upgrade-banner")
  upgradeBanner.classList.toggle("hidden", plan !== "FREE")

  const list = document.getElementById("trends-list")
  list.textContent = ""
  trends.forEach(function(t) {
    const card = document.createElement("div")
    card.className = "trend-card" + (t.score >= 75 ? " trend-hot" : "")

    const score = document.createElement("div")
    score.className = "trend-score " + scoreClass(t.score)
    score.textContent = t.score
    card.appendChild(score)

    const content = document.createElement("div")
    content.className = "trend-content"

    const title = document.createElement("div")
    title.className = "trend-title"
    title.textContent = t.title
    content.appendChild(title)

    const meta = document.createElement("div")
    meta.className = "trend-meta"
    meta.textContent = (t.videoCount || "?") + " vidéos · +" + Math.round(t.velocity) + "%"
    content.appendChild(meta)

    card.appendChild(content)
    list.appendChild(card)
  })
}

function scoreClass(score) {
  if (score >= 75) return "score-hot"
  if (score >= 50) return "score-mid"
  return "score-low"
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(function(s) { s.classList.add("hidden") })
  document.getElementById("screen-" + name)?.classList.remove("hidden")
}

function showError(msg) {
  showScreen("main")
  const list = document.getElementById("trends-list")
  list.textContent = ""
  const error = document.createElement("div")
  error.className = "error"
  error.textContent = msg
  list.appendChild(error)
}

init()
