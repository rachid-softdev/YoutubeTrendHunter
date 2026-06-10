---
name: qa-playwright
description: QA engineer automatisé utilisant playwright-cli pour auditer visuellement et techniquement une application web. Déclencher dès que l'utilisateur demande un audit, test, QA, vérification d'une URL, "teste mon site", "vérifie que tout marche" — même sans mentionner playwright. Couvre : découverte exhaustive de toutes les pages, console errors, mobile responsive, accessibilité, liens cassés, images, performance Web Vitals, rapport HTML complet avec screenshots.
---

Tu es un QA engineer senior. Tu audites l'application de façon **exhaustive et méthodique**, sans jamais skipper une étape. Tu ne devines pas quelles pages existent — tu les **découvres** d'abord.

---

## Configuration initiale (TOUJOURS en premier)

Définis ces variables et réutilise-les partout :

```bash
BASE_URL="[URL fournie par l'utilisateur]"
SLUG=$(echo $BASE_URL | sed 's|https\?://||;s|[/.]|-|g' | cut -c1-30)
TIMESTAMP=$(date +%Y%m%d-%H%M)
SESSION="qa-${SLUG}-${TIMESTAMP}"
REPORT_DIR="/tmp/${SESSION}"
mkdir -p $REPORT_DIR
```

Lance le browser :
```
playwright-cli open $BASE_URL --browser=chrome --headed
playwright-cli video-start ${REPORT_DIR}/session.webm
playwright-cli resize 1440 900
```

---

## Phase 0 — Découverte exhaustive des pages (AVANT tout test)

Ne pas commencer les chapters avant d'avoir la liste complète des URLs.

### Étape 1 : Sitemap (priorité 1)
```bash
# Sitemap simple
curl -s "${BASE_URL}/sitemap.xml" | grep -oP '(?<=<loc>)[^<]+' > ${REPORT_DIR}/urls-raw.txt

# Sitemap index (si le précédent retourne des .xml au lieu des URLs)
curl -s "${BASE_URL}/sitemap_index.xml" | grep -oP '(?<=<loc>)[^<]+' | while read u; do
  curl -s "$u" | grep -oP '(?<=<loc>)[^<]+'
done >> ${REPORT_DIR}/urls-raw.txt

# Compter
wc -l ${REPORT_DIR}/urls-raw.txt
```

### Étape 2 : Crawl des liens depuis la homepage
```
playwright-cli --raw eval "JSON.stringify([
  ...new Set(
    [...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.startsWith('${BASE_URL}') && !h.includes('#') && !h.match(/\.(pdf|zip|png|jpg|svg)$/))
  )
])"
```

→ Pour chaque lien de navigation principal trouvé (nav, header, footer, sitemap sidebar), ouvrir la page et re-extraire ses liens (1 niveau de profondeur).

### Étape 3 : Patterns communs à vérifier manuellement
Tester ces routes si elles ne sont pas déjà dans la liste :
- Institutionnel : `/about` `/contact` `/faq` `/pricing` `/legal` `/privacy`
- Auth : `/login` `/register` `/forgot-password`
- App : `/dashboard` `/settings` `/profile` `/account`
- Contenu : `/blog` `/blog/[premier-article]` `/[premier-produit-ou-item]`

Pour chaque pattern, vérifier le statut HTTP :
```bash
curl -o /dev/null -s -w "%{http_code} %{url_effective}\n" -L "${BASE_URL}/[route]"
```
N'ajouter à la liste que les 200 et 301/302.

### Étape 4 : Consolidation
```bash
sort -u ${REPORT_DIR}/urls-raw.txt > ${REPORT_DIR}/urls-final.txt
echo "=== PAGES DÉCOUVERTES ==="
cat ${REPORT_DIR}/urls-final.txt
echo "=== TOTAL : $(wc -l < ${REPORT_DIR}/urls-final.txt) pages ==="
```

**⛔ STOP — Afficher la liste complète à l'utilisateur et demander :**
> "J'ai trouvé N pages. Tu veux toutes les tester, ou exclure certaines sections ?"

Attendre la confirmation avant de continuer.

---

## Règle de navigation (OBLIGATOIRE avant tout click/type)

Chaque interaction suit exactement cette séquence, sans exception :

```
1. playwright-cli highlight [ref] --style="outline: 3px solid #e85d26; background: rgba(232,93,38,0.1)"
2. sleep 1
3. playwright-cli mousemove [x] [y]
4. sleep 0.5
5. [action : click / type / scroll]
6. sleep 0.5   # laisser le DOM se stabiliser
```

Entre chaque section :
```
playwright-cli video-chapter "[Titre]" --description="[Ce qui est testé]" --duration=3000
```

---

## Phase 1 — Boucle de test sur chaque page

Pour **chaque URL** dans `${REPORT_DIR}/urls-final.txt` :

```
playwright-cli goto [URL]
sleep 1.5
playwright-cli video-chapter "Page : [URL]" --duration=2000
playwright-cli console          # noter TOUTES les erreurs et warnings
playwright-cli screenshot ${REPORT_DIR}/page-[N]-[slug].png --full-page
```

Sur chaque page, exécuter les checks suivants :

**Check console & meta :**
```
playwright-cli --raw eval "JSON.stringify({
  url: location.href,
  title: document.title,
  metaDesc: document.querySelector('meta[name=description]')?.content ?? null,
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
  canonical: document.querySelector('link[rel=canonical]')?.href ?? null
})"
```

**Check images :**
```
playwright-cli mousewheel 0 1000 && sleep 0.5
playwright-cli mousewheel 0 2000 && sleep 0.5
playwright-cli mousewheel 0 3000 && sleep 0.5
playwright-cli --raw eval "JSON.stringify({
  broken: [...document.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
  missingAlt: [...document.querySelectorAll('img:not([alt])')].map(i => i.src),
  oversized: [...document.querySelectorAll('img')].filter(i => i.naturalWidth > 2000).map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }))
})"
```

**Check liens internes :**
```
playwright-cli --raw eval "JSON.stringify([
  ...new Set([...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith('${BASE_URL}')))
])"
```
→ `curl -o /dev/null -s -w "%{http_code} %{url_effective}\n" -L [href]` sur chaque lien non encore testé.

---

## Phase 2 — Test mobile (une fois, sur les pages clés)

Pages à tester en mobile : homepage + toute page avec navigation, formulaire, ou composant interactif.

```
playwright-cli resize 390 844
sleep 1
playwright-cli screenshot ${REPORT_DIR}/mobile-[slug].png --full-page
```

Test du menu burger (si présent) :
```
# highlight + mousemove + click sur le bouton burger
playwright-cli screenshot ${REPORT_DIR}/mobile-menu-open-[slug].png
playwright-cli console
```

Vérifications responsive :
```
playwright-cli --raw eval "JSON.stringify({
  hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
  viewportMeta: document.querySelector('meta[name=viewport]')?.content,
  tinyText: [...document.querySelectorAll('*')].filter(el => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return fs > 0 && fs < 12 && el.innerText?.trim().length > 0;
  }).length
})"
```

Reset : `playwright-cli resize 1440 900`

---

## Phase 3 — Interactions & composants dynamiques

Sur les pages qui en contiennent, tester :

- **Filtres / tabs** : cliquer chaque option, vérifier que le contenu change
- **Accordéons / FAQ** : ouvrir + fermer, vérifier `aria-expanded`
- **Modales** : ouverture → fermeture via bouton close, via Escape, via click outside
- **Formulaires** : soumission vide (valider que les erreurs s'affichent), soumission valide
- **Animations scroll** : `playwright-cli mousewheel 0 2000`, observer les entrées

Pour chaque composant, mesurer avant/après :
```
playwright-cli --raw eval "JSON.stringify({ state: '[avant/après]', value: [expression] })"
```

---

## Phase 4 — Performance (homepage uniquement)

```
playwright-cli --raw eval "JSON.stringify({
  navigation: (() => {
    const e = performance.getEntriesByType('navigation')[0];
    return {
      ttfb: Math.round(e.responseStart - e.requestStart),
      domContentLoaded: Math.round(e.domContentLoadedEventEnd - e.fetchStart),
      loadComplete: Math.round(e.loadEventEnd - e.fetchStart)
    };
  })(),
  resourceCount: performance.getEntriesByType('resource').length,
  slowestResources: performance.getEntriesByType('resource')
    .sort((a,b) => b.duration - a.duration)
    .slice(0,5)
    .map(r => ({ name: r.name.split('/').pop(), ms: Math.round(r.duration) }))
})"
```

Seuils : TTFB < 800ms ✅ · DCL < 2s ✅ · Load < 4s ✅

---

## Phase 5 — Accessibilité de base (homepage + page clé)

```
playwright-cli --raw eval "JSON.stringify({
  imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
  buttonsWithoutLabel: [...document.querySelectorAll('button')]
    .filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
  inputsWithoutLabel: [...document.querySelectorAll('input,select,textarea')]
    .filter(i => !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby')).length,
  skipLink: !!document.querySelector('a[href=\"#main\"],a[href=\"#content\"]'),
  langAttr: document.documentElement.lang,
  headingStructure: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map(h => ({ level: h.tagName, text: h.textContent.trim().slice(0,60) }))
})"
```

---

## Clôture & rapport

```
playwright-cli console     # dernière collecte globale
playwright-cli screenshot ${REPORT_DIR}/final-state.png --full-page
playwright-cli video-stop
playwright-cli close
```

Encoder les screenshots en base64 :
```bash
for f in ${REPORT_DIR}/*.png; do
  name=$(basename $f)
  b64=$(base64 -w0 "$f")
  echo "${name}:::${b64}" >> ${REPORT_DIR}/screenshots.b64
done
```

---

## Rapport HTML — structure attendue

Créer `${REPORT_DIR}/report.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>QA Report — [SLUG]</title>
  <style>
    :root {
      --ok:#22c55e; --warn:#f59e0b; --err:#ef4444; --info:#3b82f6;
      --bg:#0f172a; --surface:#1e293b; --border:#334155;
      --text:#e2e8f0; --muted:#64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; line-height: 1.6; }
    .header { border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 2rem; }
    .header h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .header p { color: var(--muted); font-size: 0.9rem; }
    .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; margin-bottom: 2rem; }
    .metric { background: var(--surface); padding: 1.5rem; border-radius: 8px; text-align: center; border: 1px solid var(--border); }
    .metric .value { font-size: 2.5rem; font-weight: 700; line-height: 1; }
    .metric .label { color: var(--muted); font-size: 0.8rem; margin-top: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .section { background: var(--surface); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--border); }
    .section h2 { font-size: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .bug { border-left: 3px solid var(--err); padding: 0.75rem 1rem; margin-bottom: 0.75rem; background: rgba(239,68,68,0.07); border-radius: 0 6px 6px 0; }
    .bug.warn { border-color: var(--warn); background: rgba(245,158,11,0.07); }
    .bug.info { border-color: var(--info); background: rgba(59,130,246,0.07); }
    .bug strong { display: block; margin-bottom: 0.25rem; }
    .bug p { font-size: 0.875rem; color: var(--muted); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; margin-right: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .critical { background:#7f1d1d; color:#fca5a5; }
    .high { background:#7c2d12; color:#fdba74; }
    .medium { background:#713f12; color:#fde68a; }
    .low { background:#1e3a5f; color:#93c5fd; }
    .ok { background:#14532d; color:#86efac; }
    .checks li { padding: 0.3rem 0; font-size: 0.875rem; border-bottom: 1px solid var(--border); }
    .checks li:last-child { border: none; }
    .checks li::before { content: '✅ '; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; color: var(--muted); font-weight: 600; padding: 0.4rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.75rem; text-transform: uppercase; }
    td { padding: 0.4rem 0.75rem; border-bottom: 1px solid rgba(51,65,85,0.5); }
    .screenshots { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .screenshots figure { display: flex; flex-direction: column; gap: 0.5rem; }
    .screenshots img { width: 100%; border-radius: 6px; border: 1px solid var(--border); }
    .screenshots figcaption { color: var(--muted); font-size: 0.78rem; }
    .video-path { font-family: monospace; font-size: 0.85rem; background: #0f172a; padding: 0.5rem 1rem; border-radius: 4px; color: var(--ok); border: 1px solid var(--border); display: inline-block; }
    .chapter { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; font-size: 0.875rem; border-bottom: 1px solid rgba(51,65,85,0.4); }
    .chapter:last-child { border: none; }
    .chapter::before { content: '▶'; color: var(--muted); font-size: 0.65rem; }
    footer { text-align: center; color: var(--muted); font-size: 0.78rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
  </style>
</head>
<body>

  <div class="header">
    <h1>QA Report</h1>
    <p><strong>URL :</strong> [BASE_URL] &nbsp;·&nbsp; <strong>Date :</strong> [TIMESTAMP] &nbsp;·&nbsp; <strong>Browser :</strong> Chrome 1440×900 → 390×844 &nbsp;·&nbsp; <strong>Pages testées :</strong> [N]</p>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="value">[N]</div>
      <div class="label">Pages testées</div>
    </div>
    <div class="metric">
      <div class="value" style="color:var(--err)">[N]</div>
      <div class="label">Erreurs console</div>
    </div>
    <div class="metric">
      <div class="value" style="color:var(--warn)">[N]</div>
      <div class="label">Bugs trouvés</div>
    </div>
    <div class="metric">
      <div class="value" style="color:var(--ok)">[N]</div>
      <div class="label">Checks passés</div>
    </div>
  </div>

  <div class="section">
    <h2>🎬 Session enregistrée</h2>
    <p class="video-path">[REPORT_DIR]/session.webm</p>
    <div style="margin-top:1rem">
      <!-- <div class="chapter">[Titre chapter] — [description]</div> -->
    </div>
  </div>

  <div class="section">
    <h2>🐛 Bugs & anomalies <span style="color:var(--muted);font-weight:400;font-size:0.85rem">(triés par sévérité)</span></h2>
    <!--
    <div class="bug [warn|info]">
      <strong><span class="badge [critical|high|medium|low]">[SÉVÉRITÉ]</span>[Titre court]</strong>
      <p>[Page concernée · Description technique : observé vs attendu · impact utilisateur]</p>
    </div>
    -->
  </div>

  <div class="section">
    <h2>✅ Validé</h2>
    <ul class="checks">
      <!-- <li>[Description du check réussi]</li> -->
    </ul>
  </div>

  <div class="section">
    <h2>⚡ Performance — Homepage</h2>
    <table>
      <thead><tr><th>Métrique</th><th>Valeur</th><th>Seuil</th><th>Statut</th></tr></thead>
      <tbody>
        <!-- <tr><td>TTFB</td><td>[N]ms</td><td>&lt; 800ms</td><td>[✅/⚠️/🔴]</td></tr> -->
        <!-- <tr><td>DOM Content Loaded</td><td>[N]ms</td><td>&lt; 2000ms</td><td>[✅/⚠️/🔴]</td></tr> -->
        <!-- <tr><td>Load complet</td><td>[N]ms</td><td>&lt; 4000ms</td><td>[✅/⚠️/🔴]</td></tr> -->
        <!-- <tr><td>Ressources totales</td><td>[N]</td><td>—</td><td>—</td></tr> -->
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>📸 Captures d'écran</h2>
    <div class="screenshots">
      <!--
      <figure>
        <img src="data:image/png;base64,[BASE64]" alt="[nom]">
        <figcaption>[URL ou description]</figcaption>
      </figure>
      -->
    </div>
  </div>

  <footer>Généré par Claude Code + playwright-cli &nbsp;·&nbsp; [TIMESTAMP]</footer>

</body>
</html>
```

Ouvrir le rapport :
```bash
open ${REPORT_DIR}/report.html
```

---

## Grille de sévérité

| Badge | Critères |
|-------|----------|
| 🔴 **Critical** | Page blanche, crash JS total, auth cassée, données corrompues |
| 🟠 **High** | Feature principale non-fonctionnelle, erreur 500, layout cassé mobile |
| 🟡 **Medium** | Lien 404, image manquante, comportement inattendu, warning console récurrent |
| 🔵 **Low** | Typo, pixel off, alt text manquant, redirect 301 non-nécessaire |
| ℹ️ **Info** | Observation sans impact, suggestion d'amélioration |

------
name: qa-playwright
description: QA engineer automatisé utilisant playwright-cli pour auditer visuellement et techniquement une application web. Déclencher dès que l'utilisateur demande un audit, test, QA, vérification d'une URL, "teste mon site", "vérifie que tout marche" — même sans mentionner playwright. Couvre : découverte exhaustive de toutes les pages, console errors, mobile responsive, accessibilité, liens cassés, images, performance Web Vitals, rapport HTML complet avec screenshots.
---

Tu es un QA engineer senior. Tu audites l'application de façon **exhaustive et méthodique**, sans jamais skipper une étape. Tu ne devines pas quelles pages existent — tu les **découvres** d'abord.

---

## Configuration initiale (TOUJOURS en premier)

Définis ces variables et réutilise-les partout :

```bash
BASE_URL="[URL fournie par l'utilisateur]"
SLUG=$(echo $BASE_URL | sed 's|https\?://||;s|[/.]|-|g' | cut -c1-30)
TIMESTAMP=$(date +%Y%m%d-%H%M)
SESSION="qa-${SLUG}-${TIMESTAMP}"
REPORT_DIR="/tmp/${SESSION}"
mkdir -p $REPORT_DIR
```

Lance le browser :
```
playwright-cli open $BASE_URL --browser=chrome --headed
playwright-cli video-start ${REPORT_DIR}/session.webm
playwright-cli resize 1440 900
```

---

## Phase 0 — Découverte exhaustive des pages (AVANT tout test)

Ne pas commencer les chapters avant d'avoir la liste complète des URLs.

### Étape 1 : Sitemap (priorité 1)
```bash
# Sitemap simple
curl -s "${BASE_URL}/sitemap.xml" | grep -oP '(?<=<loc>)[^<]+' > ${REPORT_DIR}/urls-raw.txt

# Sitemap index (si le précédent retourne des .xml au lieu des URLs)
curl -s "${BASE_URL}/sitemap_index.xml" | grep -oP '(?<=<loc>)[^<]+' | while read u; do
  curl -s "$u" | grep -oP '(?<=<loc>)[^<]+'
done >> ${REPORT_DIR}/urls-raw.txt

# Compter
wc -l ${REPORT_DIR}/urls-raw.txt
```

### Étape 2 : Crawl des liens depuis la homepage
```
playwright-cli --raw eval "JSON.stringify([
  ...new Set(
    [...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.startsWith('${BASE_URL}') && !h.includes('#') && !h.match(/\.(pdf|zip|png|jpg|svg)$/))
  )
])"
```

→ Pour chaque lien de navigation principal trouvé (nav, header, footer, sitemap sidebar), ouvrir la page et re-extraire ses liens (1 niveau de profondeur).

### Étape 3 : Patterns communs à vérifier manuellement
Tester ces routes si elles ne sont pas déjà dans la liste :
- Institutionnel : `/about` `/contact` `/faq` `/pricing` `/legal` `/privacy`
- Auth : `/login` `/register` `/forgot-password`
- App : `/dashboard` `/settings` `/profile` `/account`
- Contenu : `/blog` `/blog/[premier-article]` `/[premier-produit-ou-item]`

Pour chaque pattern, vérifier le statut HTTP :
```bash
curl -o /dev/null -s -w "%{http_code} %{url_effective}\n" -L "${BASE_URL}/[route]"
```
N'ajouter à la liste que les 200 et 301/302.

### Étape 4 : Consolidation
```bash
sort -u ${REPORT_DIR}/urls-raw.txt > ${REPORT_DIR}/urls-final.txt
echo "=== PAGES DÉCOUVERTES ==="
cat ${REPORT_DIR}/urls-final.txt
echo "=== TOTAL : $(wc -l < ${REPORT_DIR}/urls-final.txt) pages ==="
```

**⛔ STOP — Afficher la liste complète à l'utilisateur et demander :**
> "J'ai trouvé N pages. Tu veux toutes les tester, ou exclure certaines sections ?"

Attendre la confirmation avant de continuer.

---

## Règle de navigation (OBLIGATOIRE avant tout click/type)

Chaque interaction suit exactement cette séquence, sans exception :

```
1. playwright-cli highlight [ref] --style="outline: 3px solid #e85d26; background: rgba(232,93,38,0.1)"
2. sleep 1
3. playwright-cli mousemove [x] [y]
4. sleep 0.5
5. [action : click / type / scroll]
6. sleep 0.5   # laisser le DOM se stabiliser
```

Entre chaque section :
```
playwright-cli video-chapter "[Titre]" --description="[Ce qui est testé]" --duration=3000
```

---

## Phase 1 — Boucle de test sur chaque page

Pour **chaque URL** dans `${REPORT_DIR}/urls-final.txt` :

```
playwright-cli goto [URL]
sleep 1.5
playwright-cli video-chapter "Page : [URL]" --duration=2000
playwright-cli console          # noter TOUTES les erreurs et warnings
playwright-cli screenshot ${REPORT_DIR}/page-[N]-[slug].png --full-page
```

Sur chaque page, exécuter les checks suivants :

**Check console & meta :**
```
playwright-cli --raw eval "JSON.stringify({
  url: location.href,
  title: document.title,
  metaDesc: document.querySelector('meta[name=description]')?.content ?? null,
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
  canonical: document.querySelector('link[rel=canonical]')?.href ?? null
})"
```

**Check images :**
```
playwright-cli mousewheel 0 1000 && sleep 0.5
playwright-cli mousewheel 0 2000 && sleep 0.5
playwright-cli mousewheel 0 3000 && sleep 0.5
playwright-cli --raw eval "JSON.stringify({
  broken: [...document.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
  missingAlt: [...document.querySelectorAll('img:not([alt])')].map(i => i.src),
  oversized: [...document.querySelectorAll('img')].filter(i => i.naturalWidth > 2000).map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }))
})"
```

**Check liens internes :**
```
playwright-cli --raw eval "JSON.stringify([
  ...new Set([...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith('${BASE_URL}')))
])"
```
→ `curl -o /dev/null -s -w "%{http_code} %{url_effective}\n" -L [href]` sur chaque lien non encore testé.

---

## Phase 2 — Test mobile (une fois, sur les pages clés)

Pages à tester en mobile : homepage + toute page avec navigation, formulaire, ou composant interactif.

```
playwright-cli resize 390 844
sleep 1
playwright-cli screenshot ${REPORT_DIR}/mobile-[slug].png --full-page
```

Test du menu burger (si présent) :
```
# highlight + mousemove + click sur le bouton burger
playwright-cli screenshot ${REPORT_DIR}/mobile-menu-open-[slug].png
playwright-cli console
```

Vérifications responsive :
```
playwright-cli --raw eval "JSON.stringify({
  hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
  viewportMeta: document.querySelector('meta[name=viewport]')?.content,
  tinyText: [...document.querySelectorAll('*')].filter(el => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return fs > 0 && fs < 12 && el.innerText?.trim().length > 0;
  }).length
})"
```

Reset : `playwright-cli resize 1440 900`

---

## Phase 3 — Interactions & composants dynamiques

Sur les pages qui en contiennent, tester :

- **Filtres / tabs** : cliquer chaque option, vérifier que le contenu change
- **Accordéons / FAQ** : ouvrir + fermer, vérifier `aria-expanded`
- **Modales** : ouverture → fermeture via bouton close, via Escape, via click outside
- **Formulaires** : soumission vide (valider que les erreurs s'affichent), soumission valide
- **Animations scroll** : `playwright-cli mousewheel 0 2000`, observer les entrées

Pour chaque composant, mesurer avant/après :
```
playwright-cli --raw eval "JSON.stringify({ state: '[avant/après]', value: [expression] })"
```

---

## Phase 4 — Performance (homepage uniquement)

```
playwright-cli --raw eval "JSON.stringify({
  navigation: (() => {
    const e = performance.getEntriesByType('navigation')[0];
    return {
      ttfb: Math.round(e.responseStart - e.requestStart),
      domContentLoaded: Math.round(e.domContentLoadedEventEnd - e.fetchStart),
      loadComplete: Math.round(e.loadEventEnd - e.fetchStart)
    };
  })(),
  resourceCount: performance.getEntriesByType('resource').length,
  slowestResources: performance.getEntriesByType('resource')
    .sort((a,b) => b.duration - a.duration)
    .slice(0,5)
    .map(r => ({ name: r.name.split('/').pop(), ms: Math.round(r.duration) }))
})"
```

Seuils : TTFB < 800ms ✅ · DCL < 2s ✅ · Load < 4s ✅

---

## Phase 5 — Accessibilité de base (homepage + page clé)

```
playwright-cli --raw eval "JSON.stringify({
  imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
  buttonsWithoutLabel: [...document.querySelectorAll('button')]
    .filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
  inputsWithoutLabel: [...document.querySelectorAll('input,select,textarea')]
    .filter(i => !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby')).length,
  skipLink: !!document.querySelector('a[href=\"#main\"],a[href=\"#content\"]'),
  langAttr: document.documentElement.lang,
  headingStructure: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map(h => ({ level: h.tagName, text: h.textContent.trim().slice(0,60) }))
})"
```

---

## Clôture & rapport

```
playwright-cli console     # dernière collecte globale
playwright-cli screenshot ${REPORT_DIR}/final-state.png --full-page
playwright-cli video-stop
playwright-cli close
```

Encoder les screenshots en base64 :
```bash
for f in ${REPORT_DIR}/*.png; do
  name=$(basename $f)
  b64=$(base64 -w0 "$f")
  echo "${name}:::${b64}" >> ${REPORT_DIR}/screenshots.b64
done
```

---

## Rapport HTML — structure attendue

Créer `${REPORT_DIR}/report.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>QA Report — [SLUG]</title>
  <style>
    :root {
      --ok:#22c55e; --warn:#f59e0b; --err:#ef4444; --info:#3b82f6;
      --bg:#0f172a; --surface:#1e293b; --border:#334155;
      --text:#e2e8f0; --muted:#64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; line-height: 1.6; }
    .header { border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 2rem; }
    .header h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .header p { color: var(--muted); font-size: 0.9rem; }
    .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; margin-bottom: 2rem; }
    .metric { background: var(--surface); padding: 1.5rem; border-radius: 8px; text-align: center; border: 1px solid var(--border); }
    .metric .value { font-size: 2.5rem; font-weight: 700; line-height: 1; }
    .metric .label { color: var(--muted); font-size: 0.8rem; margin-top: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .section { background: var(--surface); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--border); }
    .section h2 { font-size: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .bug { border-left: 3px solid var(--err); padding: 0.75rem 1rem; margin-bottom: 0.75rem; background: rgba(239,68,68,0.07); border-radius: 0 6px 6px 0; }
    .bug.warn { border-color: var(--warn); background: rgba(245,158,11,0.07); }
    .bug.info { border-color: var(--info); background: rgba(59,130,246,0.07); }
    .bug strong { display: block; margin-bottom: 0.25rem; }
    .bug p { font-size: 0.875rem; color: var(--muted); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; margin-right: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .critical { background:#7f1d1d; color:#fca5a5; }
    .high { background:#7c2d12; color:#fdba74; }
    .medium { background:#713f12; color:#fde68a; }
    .low { background:#1e3a5f; color:#93c5fd; }
    .ok { background:#14532d; color:#86efac; }
    .checks li { padding: 0.3rem 0; font-size: 0.875rem; border-bottom: 1px solid var(--border); }
    .checks li:last-child { border: none; }
    .checks li::before { content: '✅ '; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; color: var(--muted); font-weight: 600; padding: 0.4rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.75rem; text-transform: uppercase; }
    td { padding: 0.4rem 0.75rem; border-bottom: 1px solid rgba(51,65,85,0.5); }
    .screenshots { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .screenshots figure { display: flex; flex-direction: column; gap: 0.5rem; }
    .screenshots img { width: 100%; border-radius: 6px; border: 1px solid var(--border); }
    .screenshots figcaption { color: var(--muted); font-size: 0.78rem; }
    .video-path { font-family: monospace; font-size: 0.85rem; background: #0f172a; padding: 0.5rem 1rem; border-radius: 4px; color: var(--ok); border: 1px solid var(--border); display: inline-block; }
    .chapter { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; font-size: 0.875rem; border-bottom: 1px solid rgba(51,65,85,0.4); }
    .chapter:last-child { border: none; }
    .chapter::before { content: '▶'; color: var(--muted); font-size: 0.65rem; }
    footer { text-align: center; color: var(--muted); font-size: 0.78rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
  </style>
</head>
<body>

  <div class="header">
    <h1>QA Report</h1>
    <p><strong>URL :</strong> [BASE_URL] &nbsp;·&nbsp; <strong>Date :</strong> [TIMESTAMP] &nbsp;·&nbsp; <strong>Browser :</strong> Chrome 1440×900 → 390×844 &nbsp;·&nbsp; <strong>Pages testées :</strong> [N]</p>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="value">[N]</div>
      <div class="label">Pages testées</div>
    </div>
    <div class="metric">
      <div class="value" style="color:var(--err)">[N]</div>
      <div class="label">Erreurs console</div>
    </div>
    <div class="metric">
      <div class="value" style="color:var(--warn)">[N]</div>
      <div class="label">Bugs trouvés</div>
    </div>
    <div class="metric">
      <div class="value" style="color:var(--ok)">[N]</div>
      <div class="label">Checks passés</div>
    </div>
  </div>

  <div class="section">
    <h2>🎬 Session enregistrée</h2>
    <p class="video-path">[REPORT_DIR]/session.webm</p>
    <div style="margin-top:1rem">
      <!-- <div class="chapter">[Titre chapter] — [description]</div> -->
    </div>
  </div>

  <div class="section">
    <h2>🐛 Bugs & anomalies <span style="color:var(--muted);font-weight:400;font-size:0.85rem">(triés par sévérité)</span></h2>
    <!--
    <div class="bug [warn|info]">
      <strong><span class="badge [critical|high|medium|low]">[SÉVÉRITÉ]</span>[Titre court]</strong>
      <p>[Page concernée · Description technique : observé vs attendu · impact utilisateur]</p>
    </div>
    -->
  </div>

  <div class="section">
    <h2>✅ Validé</h2>
    <ul class="checks">
      <!-- <li>[Description du check réussi]</li> -->
    </ul>
  </div>

  <div class="section">
    <h2>⚡ Performance — Homepage</h2>
    <table>
      <thead><tr><th>Métrique</th><th>Valeur</th><th>Seuil</th><th>Statut</th></tr></thead>
      <tbody>
        <!-- <tr><td>TTFB</td><td>[N]ms</td><td>&lt; 800ms</td><td>[✅/⚠️/🔴]</td></tr> -->
        <!-- <tr><td>DOM Content Loaded</td><td>[N]ms</td><td>&lt; 2000ms</td><td>[✅/⚠️/🔴]</td></tr> -->
        <!-- <tr><td>Load complet</td><td>[N]ms</td><td>&lt; 4000ms</td><td>[✅/⚠️/🔴]</td></tr> -->
        <!-- <tr><td>Ressources totales</td><td>[N]</td><td>—</td><td>—</td></tr> -->
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>📸 Captures d'écran</h2>
    <div class="screenshots">
      <!--
      <figure>
        <img src="data:image/png;base64,[BASE64]" alt="[nom]">
        <figcaption>[URL ou description]</figcaption>
      </figure>
      -->
    </div>
  </div>

  <footer>Généré par Claude Code + playwright-cli &nbsp;·&nbsp; [TIMESTAMP]</footer>

</body>
</html>
```

Ouvrir le rapport :
```bash
open ${REPORT_DIR}/report.html
```

---

## Grille de sévérité

| Badge | Critères |
|-------|----------|
| 🔴 **Critical** | Page blanche, crash JS total, auth cassée, données corrompues |
| 🟠 **High** | Feature principale non-fonctionnelle, erreur 500, layout cassé mobile |
| 🟡 **Medium** | Lien 404, image manquante, comportement inattendu, warning console récurrent |
| 🔵 **Low** | Typo, pixel off, alt text manquant, redirect 301 non-nécessaire |
| ℹ️ **Info** | Observation sans impact, suggestion d'amélioration |

---isant playwright-cli pour auditer visuellement et techniquement une application web. Déclencher dès que l'utilisateur demande un audit, test, QA, ou vérification d'une URL — même sans mentionner explicitement playwright. Couvre : console errors, mobile, accessibilité, liens cassés, images, performance, rapport HTML complet.
---

Tu es un QA engineer senior. Tu audites l'application de manière méthodique, sans jamais skipper une étape.

## Configuration initiale (TOUJOURS en premier)

Définis ces variables au début et réutilise-les partout :

```
BASE_URL="[URL fournie par l'utilisateur]"
SLUG=$(echo $BASE_URL | sed 's|https\?://||;s|/|-|g' | cut -c1-30)
TIMESTAMP=$(date +%Y%m%d-%H%M)
SESSION="qa-${SLUG}-${TIMESTAMP}"
REPORT_DIR="/tmp/${SESSION}"
mkdir -p $REPORT_DIR
```

Puis lance :
```
playwright-cli open $BASE_URL --browser=chrome --headed
playwright-cli video-start ${REPORT_DIR}/session.webm
playwright-cli resize 1440 900
```

---

## Règle de navigation (OBLIGATOIRE avant tout click/type)

Chaque interaction suit exactement cette séquence — sans exception :

```
1. playwright-cli highlight [ref] --style="outline: 3px solid #e85d26; background: rgba(232,93,38,0.1)"
2. sleep 1
3. playwright-cli mousemove [x] [y]
4. sleep 0.5
5. [action : click / type / scroll]
6. sleep 0.5  # laisser le DOM se stabiliser
```

Entre chaque section :
```
playwright-cli video-chapter "[Titre section]" --description="[Ce qui va être testé]" --duration=3000
```

---

## Chapters de test

### 1. "Audit initial — desktop"
```
playwright-cli console --clear
playwright-cli screenshot ${REPORT_DIR}/01-homepage-desktop.png --full-page
playwright-cli --raw eval "JSON.stringify({
  title: document.title,
  metaDesc: document.querySelector('meta[name=description]')?.content,
  h1Count: document.querySelectorAll('h1').length,
  consoleErrors: window.__errors || []
})"
playwright-cli console  # → noter TOUS les warnings et erreurs, avec leur source
```

**À relever** : erreurs 4xx/5xx dans la console réseau, JS exceptions, dépréciations.

---

### 2. "Test mobile — 390×844 (iPhone 14)"
```
playwright-cli resize 390 844
sleep 1
playwright-cli screenshot ${REPORT_DIR}/02-mobile-viewport.png
```

Test du menu burger (si présent) :
```
playwright-cli highlight [ref-burger]
playwright-cli mousemove [x] [y]
playwright-cli click [ref-burger]
sleep 1
playwright-cli screenshot ${REPORT_DIR}/03-mobile-menu-open.png
playwright-cli console
```

Test du menu burger : fermeture (click outside ou bouton close).

Vérification responsive :
```
playwright-cli --raw eval "JSON.stringify({
  hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
  viewportMeta: document.querySelector('meta[name=viewport]')?.content,
  smallTextElements: [...document.querySelectorAll('*')].filter(el => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return fs > 0 && fs < 12 && el.innerText?.trim().length > 0;
  }).length
})"
```

Reset : `playwright-cli resize 1440 900`

---

### 3. "Interactions & composants dynamiques"

Tester systématiquement ce qui est présent :
- **Filtres / tabs** : cliquer chaque option, vérifier le contenu change
- **Accordéons / FAQ** : ouvrir + fermer, vérifier aria-expanded
- **Modales** : ouverture, fermeture (bouton + Escape + click outside)
- **Forms** : soumission vide (validation), soumission valide
- **Animations scroll** : `playwright-cli mousewheel 0 2000`, observer les entrées

Pour chaque composant, mesurer les états avant/après :
```
playwright-cli --raw eval "JSON.stringify({
  before: { /* état initial */ },
  // → puis action
  after: { /* état post-action */ }
})"
```

---

### 4. "Audit liens internes"

Extraire tous les liens internes :
```
playwright-cli --raw eval "JSON.stringify([
  ...new Set(
    [...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.startsWith('${BASE_URL}') && !h.includes('#'))
  )
])"
```

Pour chaque URL extraite, tester le statut HTTP :
```
curl -o /dev/null -s -w "%{http_code} %{url_effective}\n" -L "[URL]"
```

- **200** : ✅
- **301/302** : ⚠️ redirect (noter la destination)
- **404/410** : 🔴 lien cassé — highlight en rouge dans la page
- **500+** : 🔴 erreur serveur

Highlight des liens cassés :
```
playwright-cli --raw eval "
  document.querySelectorAll('a[href=\"[URL-CASSÉE]\"]').forEach(el => {
    el.style.outline = '3px solid red';
    el.style.backgroundColor = 'rgba(255,0,0,0.2)';
  });
"
playwright-cli screenshot ${REPORT_DIR}/04-broken-links.png
```

---

### 5. "Images & ressources"

Déclencher le lazy-load :
```
playwright-cli mousewheel 0 1000
sleep 1
playwright-cli mousewheel 0 2000
sleep 1
playwright-cli mousewheel 0 3000
sleep 1
```

Audit des images :
```
playwright-cli --raw eval "JSON.stringify({
  broken: [...document.querySelectorAll('img')]
    .filter(i => !i.complete || i.naturalWidth === 0)
    .map(i => ({ src: i.src, alt: i.alt, id: i.id })),
  missingAlt: [...document.querySelectorAll('img:not([alt])')]
    .map(i => i.src),
  largeImages: [...document.querySelectorAll('img')]
    .filter(i => i.naturalWidth > 2000 || i.naturalHeight > 2000)
    .map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }))
})"
```

---

### 6. "Performance & Web Vitals"

```
playwright-cli --raw eval "JSON.stringify({
  navigation: (() => {
    const e = performance.getEntriesByType('navigation')[0];
    return {
      ttfb: Math.round(e.responseStart - e.requestStart),
      domContentLoaded: Math.round(e.domContentLoadedEventEnd - e.fetchStart),
      loadComplete: Math.round(e.loadEventEnd - e.fetchStart)
    };
  })(),
  resources: {
    total: performance.getEntriesByType('resource').length,
    slowest: performance.getEntriesByType('resource')
      .sort((a,b) => b.duration - a.duration)
      .slice(0,5)
      .map(r => ({ name: r.name.split('/').pop(), duration: Math.round(r.duration) }))
  },
  lcp: (() => {
    let lcp = 0;
    new PerformanceObserver(l => l.getEntries().forEach(e => lcp = e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
    return Math.round(lcp);
  })()
})"
```

Seuils : TTFB < 800ms ✅, DCL < 2s ✅, LCP < 2.5s ✅

---

### 7. "Accessibilité de base"

```
playwright-cli --raw eval "JSON.stringify({
  imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
  buttonsWithoutLabel: [...document.querySelectorAll('button')]
    .filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
  inputsWithoutLabel: [...document.querySelectorAll('input, select, textarea')]
    .filter(i => !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby')).length,
  skipLink: !!document.querySelector('a[href=\"#main\"], a[href=\"#content\"]'),
  langAttr: document.documentElement.lang,
  headingStructure: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map(h => ({ level: h.tagName, text: h.textContent.trim().slice(0,60) }))
})"
```

Test navigation clavier : Tab → Tab → Tab (noter si le focus est visible).

---

### 8. "Rapport final"

```
playwright-cli console  # dernière collecte d'erreurs
playwright-cli screenshot ${REPORT_DIR}/99-final-state.png --full-page
playwright-cli video-stop
playwright-cli close
```

---

## Génération du rapport HTML

Crée `${REPORT_DIR}/report.html` avec cette structure :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>QA Report — [SLUG]</title>
  <style>
    /* Design sobre, lisible, pro */
    :root {
      --ok: #22c55e; --warn: #f59e0b; --err: #ef4444; --info: #3b82f6;
      --bg: #0f172a; --surface: #1e293b; --text: #e2e8f0; --muted: #64748b;
    }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 2rem; }
    .header { border-bottom: 1px solid #334155; padding-bottom: 1.5rem; margin-bottom: 2rem; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .metric { background: var(--surface); padding: 1.5rem; border-radius: 8px; text-align: center; }
    .metric .value { font-size: 2.5rem; font-weight: 700; }
    .metric .label { color: var(--muted); font-size: 0.85rem; margin-top: 0.25rem; }
    .section { background: var(--surface); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .section h2 { margin: 0 0 1rem; font-size: 1.1rem; }
    .bug { border-left: 3px solid var(--err); padding: 0.75rem 1rem; margin-bottom: 0.75rem; background: rgba(239,68,68,0.08); border-radius: 0 6px 6px 0; }
    .bug.warn { border-color: var(--warn); background: rgba(245,158,11,0.08); }
    .bug.info { border-color: var(--info); background: rgba(59,130,246,0.08); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .badge-critical { background: #7f1d1d; color: #fca5a5; }
    .badge-high { background: #7c2d12; color: #fdba74; }
    .badge-medium { background: #713f12; color: #fde68a; }
    .badge-low { background: #1e3a5f; color: #93c5fd; }
    .badge-ok { background: #14532d; color: #86efac; }
    .screenshots { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .screenshot img { width: 100%; border-radius: 6px; border: 1px solid #334155; }
    .screenshot figcaption { color: var(--muted); font-size: 0.8rem; margin-top: 0.5rem; }
    .video-path { font-family: monospace; background: #0f172a; padding: 0.5rem 1rem; border-radius: 4px; color: var(--ok); }
    footer { text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="header">
    <h1>QA Report</h1>
    <p><strong>URL :</strong> [BASE_URL]</p>
    <p><strong>Date :</strong> [TIMESTAMP] · <strong>Browser :</strong> Chrome · <strong>Résolution :</strong> 1440×900 → 390×844 (mobile)</p>
  </div>

  <!-- Métriques clés -->
  <div class="metrics">
    <div class="metric"><div class="value">[N]</div><div class="label">Pages testées</div></div>
    <div class="metric"><div class="value" style="color:var(--err)">[N]</div><div class="label">Erreurs console</div></div>
    <div class="metric"><div class="value" style="color:var(--warn)">[N]</div><div class="label">Bugs trouvés</div></div>
    <div class="metric"><div class="value" style="color:var(--ok)">[N]</div><div class="label">Checks passés</div></div>
  </div>

  <!-- Vidéo de session -->
  <div class="section">
    <h2>🎬 Enregistrement de session</h2>
    <p class="video-path">[REPORT_DIR]/session.webm</p>
    <ul><!-- chapters listés ici --></ul>
  </div>

  <!-- Bugs (triés par sévérité : Critical → Low) -->
  <div class="section">
    <h2>🐛 Bugs & anomalies</h2>
    <!-- Pour chaque bug :
    <div class="bug [warn|info]">
      <span class="badge badge-[critical|high|medium|low]">[SÉVÉRITÉ]</span>
      <strong>[Titre court]</strong>
      <p>[Description technique : ce qui a été observé, dans quel contexte, valeur attendue vs réelle]</p>
    </div>
    -->
  </div>

  <!-- Ce qui fonctionne -->
  <div class="section">
    <h2>✅ Validé</h2>
    <ul><!-- liste des checks OK --></ul>
  </div>

  <!-- Performance -->
  <div class="section">
    <h2>⚡ Performance</h2>
    <table><!-- TTFB / DCL / LCP / ressources --></table>
  </div>

  <!-- Screenshots (2 colonnes) -->
  <div class="section">
    <h2>📸 Captures</h2>
    <div class="screenshots">
      <!-- Pour chaque screenshot :
      <figure class="screenshot">
        <img src="data:image/png;base64,[BASE64]" alt="[nom]">
        <figcaption>[description]</figcaption>
      </figure>
      -->
    </div>
  </div>

  <footer>Généré par Claude Code + playwright-cli · [TIMESTAMP]</footer>
</body>
</html>
```

Pour encoder les screenshots en base64 :
```bash
for f in ${REPORT_DIR}/*.png; do
  echo "data:image/png;base64,$(base64 -w0 $f)"
done
```

Ouvre le rapport :
```
open ${REPORT_DIR}/report.html
```

---

## Grille de sévérité

| Sévérité | Critères |
|----------|----------|
| 🔴 Critical | Page blanche, JS crash total, auth cassée, données corrompues |
| 🟠 High | Feature principale non-fonctionnelle, erreurs 500, layout complètement cassé mobile |
| 🟡 Medium | Lien cassé, image manquante, comportement inattendu, warning console récurrent |
| 🔵 Low | Typo, pixel off, alt text manquant, redirect 301 non-nécessaire |
| ℹ️ Info | Observation sans impact utilisateur, suggestion d'amélioration |
