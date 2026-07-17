# QA end-to-end avec Playwright (YoutubeTrendHunter)

Runbook de test E2E manuel/automatisÃ© pour $WebDir (Next.js, monorepo pnpm/Turborepo),
inspirÃ© de la dÃ©marche mise en place sur Motivygo. Ce document est volontairement **lÃ©ger** :
il consigne le smoke test reproductible + la mÃ©thode pour lancer une campagne E2E complÃ¨te
avec playwright-cli, sans supposer l'existence d'un bypass d'auth.

> Contexte : l'app est un monorepo pnpm. Le web est dans $WebDir/ (package $WebPkg).
> Le serveur de dev dÃ©marre sur http://localhost:3000.

---

## 1. PrÃ©requis

- Node + pnpm installÃ©s.
- DÃ©pendances installÃ©es (./node_modules prÃ©sent).
- playwright-cli (optionnel, pour la campagne navigateur) :
  pnpm add -D @playwright/cli @playwright/test puis pnpm exec playwright-cli install --skills.
- Droits pour lancer PowerShell et tuer des process (admin non requis).

### Chemins importants (Windows)

| Ã‰lÃ©ment | Chemin |
|---------|--------|
| Web app | $WebDir/ (package $WebPkg) |
| CLI JS | $WebDir/node_modules/@playwright/cli/playwright-cli.js (si installÃ©) |
| Node | D:\nodejs\node.exe (global) |
| Dev cmd | $DevCmd (depuis la racine) |

---

## 2. Smoke test reproductible (sans navigateur)

Valide que le serveur dÃ©marre et que la racine rÃ©pond. Utilise Invoke-WebRequest
(indÃ©pendant du navigateur). Depuis la racine du repo :

`powershell
# 1) DÃ©marrer le serveur web (background)
Start-Process -FilePath cmd -ArgumentList "/c","pnpm dev (depuis youtube-trendhunter-web)" 
  -RedirectStandardOutput "$env:TEMP\qa\YoutubeTrendHunter.dev.txt" 
  -RedirectStandardError "$env:TEMP\qa\YoutubeTrendHunter.err.txt" -WindowStyle Hidden

# 2) Attendre "Ready" puis sonder la racine.
#    Le port rÃ©el est Ã  lire dans le log : grep "Local: http://localhost:<port>"
$port = 3000   # ajuster si le log indique un autre port
$r = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing 
      -TimeoutSec 30 -Method Get -MaximumRedirection 0 -ErrorAction SilentlyContinue
"GET / -> status=$($r.StatusCode) location=$($r.Headers['Location'])"
`

### RÃ©sultat du smoke (2026-07-17)
- Serveur : dÃ©marre et atteint Ready (voir log).
- GET / â†’ **HTTP 200**.
GET / renvoie HTTP 200 avec le titre TrendHunter - Veille YouTube IA. Racine publique, aucun mur d auth sur /.

> âš ï¸ Sur une autre machine, le port peut diffÃ©rer (3000 occupÃ© â†’ 3001/3002â€¦). Toujours
> lire le port rÃ©el dans le log du serveur.

---

## 3. Authentification (Ã  documenter par repo)

Aucun bypass d auth dev trouve dans youtube-trendhunter-web. Pages publiques testables ; pages protegees redirigent vers /login. Ajouter un bypass dev ou identifiants de seed pour les tester.

---

## 4. PiÃ¨ges Windows (transposÃ©s de Motivygo)

### 4.1 playwright-cli open est un process PERSISTANT
open ne quitte jamais ; on le lance **dÃ©tachÃ©** et on borne les autres commandes par un
timeout (	askkill /PID <pid> /T /F si dÃ©passement).

### 4.2 console (et parfois eval) sont des "live listeners"
Ils ne terminent pas seuls â†’ borne chaque commande (~20â€“25 s) et tue l'arbre si besoin.

### 4.3 playwright-cli.cmd casse le quoting
Sous Windows, le .cmd re-tokenise les expressions JS contenant espaces/parenthÃ¨ses.
âž¡ï¸ Invoquer **directement 
ode.exe playwright-cli.js** et passer l'expression eval
**sans espace** (ex. ()=>JSON.stringify({title:document.title})).

### 4.4 eforeunload bloque la navigation
Beaucoup de pages SPA dÃ©clenchent un dialog eforeunload â†’ appeler dialog-accept
avant/aprÃ¨s chaque goto.

### 4.5 Ne pas tuer le serveur
Stop-Process -Name "node" tue aussi le dev server. âž¡ï¸ Cibler par **command-line**
(Get-CimInstance Win32_Process | Where CommandLine -match 'next/dist/bin/next').

---

## 5. Lancer une campagne E2E complÃ¨te (optionnel)

La mÃ©thode complÃ¨te (driver PowerShell bornÃ©, auth-bypass cookie, capture console/a11y/
screenshots sur toutes les pages) est documentÃ©e dans Motivygo :
docs/QA_E2E_PLAYWRIGHT.md. Elle s'applique telle quelle ici, Ã  ceci prÃ¨s :
- Remplacer motivygo-web par $WebDir et le port rÃ©el.
- Si pas de bypass d'auth, limiter la campagne aux **pages publiques** (ou ajouter un
  bypass, voir Â§3).
- RÃ©utiliser le pattern qa-pc.ps1 (wrapper bornÃ©) + driver2.ps1 (campagne) depuis le
  repo Motivygo comme base, adaptÃ©s au port et Ã  la liste des URLs publiques de $Repo.

### SÃ©vÃ©ritÃ© (grille du skill qa-playwright)
| Badge | CritÃ¨res |
|-------|----------|
| ðŸ”´ Critical | Page blanche, crash JS total, auth cassÃ©e, donnÃ©es corrompues |
| ðŸŸ  High | Feature principale non-fonctionnelle, erreur 500, layout cassÃ© mobile |
| ðŸŸ¡ Medium | Lien 404, image manquante, warning console rÃ©current |
| ðŸ”µ Low | Typo, pixel off, alt text manquant |
| â„¹ï¸ Info | Observation sans impact |

---

## 6. Arborescence suggÃ©rÃ©e des artefacts

`
youtube-trendhunter-web/scripts/qa\        # (Ã  crÃ©er si campagne complÃ¨te)
â”œâ”€â”€ qa-pc.ps1          # wrapper bornÃ© (open dÃ©tachÃ© + timeout + taskkill)
â”œâ”€â”€ driver2.ps1        # campagne N pages (meta/console/a11y/screenshot)
â””â”€â”€ urls.txt           # URLs publiques dÃ©couvertes
`
 
