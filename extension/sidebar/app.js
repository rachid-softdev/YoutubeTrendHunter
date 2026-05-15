(function () {
  const API_BASE = "https://trendhunter.app/api/extension"

  // Default niches (fallback if API is unreachable)
  const DEFAULT_NICHES = [
    { slug: "tech-ia", name: "Tech & IA" },
    { slug: "finance-personnelle", name: "Finance" },
    { slug: "fitness", name: "Fitness" },
    { slug: "cuisine", name: "Cuisine" },
    { slug: "business-en-ligne", name: "Business en ligne" },
  ]

  function $(id) { return document.getElementById(id) }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.add("hidden") })
    var el = document.getElementById("screen-" + name)
    if (el) el.classList.remove("hidden")
  }

  function scoreClass(score) {
    if (score >= 75) return "score-hot"
    if (score >= 50) return "score-mid"
    return "score-low"
  }

  function renderTrends(trends, plan) {
    var badge = $("plan-badge")
    badge.textContent = "Plan " + (plan || "Free")

    var banner = $("upgrade-banner")
    if (banner) banner.classList.toggle("hidden", plan !== "FREE")

    var list = $("trends-list")
    if (!trends || trends.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Aucune tendance trouvée pour cette niche.</p></div>'
      return
    }

    list.innerHTML = trends.map(function (t) {
      var isHot = t.score >= 75
      return (
        '<div class="trend-card' + (isHot ? " trend-hot" : "") + '">' +
        '<div class="trend-score ' + scoreClass(t.score) + '">' + Math.round(t.score) + '</div>' +
        '<div class="trend-content">' +
        '<div class="trend-title">' + (t.title || t.keyword || "Sans titre") + '</div>' +
        '<div class="trend-meta">' +
        (t.videoCount || "?") + ' vidéos · +' + Math.round(t.velocity || 0) + '%' +
        '</div>' +
        '</div>' +
        '</div>'
      )
    }).join("")
  }

  async function loadTrends() {
    showScreen("loading")

    var { selectedNiche } = await chrome.storage.local.get("selectedNiche")
    var niche = selectedNiche || "tech-ia"

    var response = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve)
    })

    if (response && response.error === "NOT_AUTHENTICATED") {
      showScreen("auth")
      return
    }

    if (response && response.error) {
      showScreen("main")
      $("trends-list").innerHTML =
        '<div class="empty-state"><p>Erreur de connexion. Vérifiez votre token.</p></div>'
      return
    }

    if (response && response.data) {
      renderTrends(response.data.trends, response.data.plan)
    }

    showScreen("main")
  }

  async function loadNiches() {
    var select = $("niche-select")
    select.innerHTML = ''

    try {
      var res = await fetch(API_BASE + "/trends/niches")
      var niches = await res.json()
      populateSelect(niches)
    } catch (e) {
      populateSelect(DEFAULT_NICHES)
    }
  }

  function populateSelect(niches) {
    var select = $("niche-select")
    select.innerHTML = ''

    niches.forEach(function (n) {
      var opt = document.createElement("option")
      opt.value = n.slug
      opt.textContent = n.name
      select.appendChild(opt)
    })

    // Restore saved selection
    chrome.storage.local.get("selectedNiche", function (result) {
      if (result.selectedNiche) {
        select.value = result.selectedNiche
      }
    })
  }

  // ── Event Listeners ──
  $("btn-connect").addEventListener("click", async function () {
    var token = $("token-input").value.trim()
    if (!token) return
    await chrome.storage.local.set({ apiToken: token })
    await loadNiches()
    await loadTrends()
  })

  $("btn-logout").addEventListener("click", async function () {
    await chrome.storage.local.remove("apiToken")
    $("token-input").value = ""
    showScreen("auth")
  })

  $("niche-select").addEventListener("change", async function (e) {
    await chrome.storage.local.set({ selectedNiche: e.target.value })
    await loadTrends()
  })

  // ── Init ──
  async function init() {
    showScreen("loading")

    var { apiToken } = await chrome.storage.local.get("apiToken")

    if (!apiToken) {
      showScreen("auth")
      return
    }

    await loadNiches()
    await loadTrends()
  }

  init()
})()
