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
  
  // YouTube-style badge with pill shape
  if (plan === "FREE") {
    badge.className = "inline-flex self-start px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"
    badge.textContent = "Plan Free"
  } else if (plan === "PRO") {
    badge.className = "inline-flex self-start px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"
    badge.textContent = "Plan Pro"
  } else if (plan === "TEAM") {
    badge.className = "inline-flex self-start px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800"
    badge.textContent = "Plan Team"
  }

  const upgradeBanner = document.getElementById("upgrade-banner")
  upgradeBanner.classList.toggle("hidden", plan !== "FREE")

  const list = document.getElementById("trends-list")
  list.innerHTML = trends.map(function(t) {
    const isHot = t.score >= 75
    return '<div class="flex gap-3 p-3 bg-dark-surface rounded-xl ' + (isHot ? "border border-red-500/30" : "border border-hairline-dark") + '">' +
      '<div class="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg font-bold text-white ' + scoreClass(t.score) + '">' + t.score + '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-sm font-medium text-dark-ink truncate">' + t.title + '</div>' +
        '<div class="text-xs text-dark-ink-secondary mt-1">' + (t.videoCount || "?") + ' vidéos · +' + Math.round(t.velocity) + '%</div>' +
      '</div>' +
    '</div>'
  }).join("")
}

function scoreClass(score) {
  if (score >= 75) return "bg-red-500"       // Hot - YouTube red
  if (score >= 50) return "bg-amber-500"     // Mid - Amber
  return "bg-green-500"                       // Low - Green
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(function(s) { s.classList.add("hidden") })
  document.getElementById("screen-" + name)?.classList.remove("hidden")
}

function showError(msg) {
  showScreen("main")
  document.getElementById("trends-list").innerHTML = '<div class="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center text-sm text-red-400">' + msg + '</div>'
}

init()