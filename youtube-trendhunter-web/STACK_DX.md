# STACK_DX.md — Developer Experience & Quality Toolchain

> Guide reproductible pour intégrer une stack DX moderne sur n'importe quel projet Next.js / TypeScript.
> Généré depuis le projet PromptBearer — copiez/adaptez librement.

---

## Vue d'ensemble

| Couche | Outil | Rôle |
|---|---|---|
| Format/Lint | **Biome** (formateur) + **ESLint** (linter) | Formate le code, ESLint conserve les règles Next.js |
| Git hooks | **Husky** + **lint-staged** | Vérifie uniquement les fichiers stagés avant commit |
| Commits | **commitlint** + Conventional Commits | Force un format de message standard |
| Types | **TypeScript strict** | `strict: true`, `tsc --noEmit` |
| Tests | **Vitest** + Testing Library | Unit/intégration avec `jsdom` |
| CI | **GitHub Actions** | Lint, typecheck, build, audit, test, size |
| Dépendances | **Dependabot** | Mise à jour automatique hebdomadaire |
| Bundle | **size-limit** | Surveille la taille du build |
| Sécurité | **CodeQL** (GitHub) | SAST gratuit sur GitHub |
| Éditeurs | **.editorconfig** + **.nvmrc** | Cohérence entre contributeurs |

---

## Phase 1 — Fondations locales

### 1.1 `.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

### 1.2 `.nvmrc`

```
24
```

### 1.3 Biome (formateur)

```bash
npm install --save-dev @biomejs/biome
```

**`biome.json`** :

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "includes": ["**/*"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": false
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSpacing": true
    }
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  }
}
```

> **Note :** Le linter Biome est désactivé pour coexister avec ESLint (`eslint-config-next`).
> Si votre projet n'utilise pas Tailwind, supprimez la section `css`.
> Pour exclure des dossiers (ex: `extension/`), utilisez `"includes": ["**/*", "!extension/**"]`.

**Scripts `package.json`** :

```json
"format": "biome format --write .",
"format:check": "biome format ."
```

**`.gitignore`** — ajouter :

```
.biome/
```

### 1.4 commitlint

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

**`.commitlintrc.json`** :

```json
{
  "extends": ["@commitlint/config-conventional"]
}
```

**`.husky/commit-msg`** :

```sh
npx --no -- commitlint --edit "$1"
```

### 1.5 Câbler lint-staged avec Husky

```bash
npm install --save-dev husky lint-staged
```

**`package.json`** — script `prepare` :

```json
"prepare": "husky"
```

**`package.json`** — config `lint-staged` :

```json
"lint-staged": {
  "*": [
    "biome format --write --no-errors-on-unmatched --files-ignore-unknown=true"
  ],
  "*.{ts,tsx}": [
    "eslint --fix",
    "npm run typecheck"
  ]
}
```

**`.husky/pre-commit`** :

```sh
npx lint-staged
```

**`.husky/pre-push`** :

```sh
npm run check
```

### 1.6 Script `check`

```json
"check": "npm run format:check && npm run lint && npm run typecheck"
```

---

## Phase 2 — CI GitHub Actions

### 2.1 Pipeline principal — `.github/workflows/ci.yaml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Lint, TypeCheck, Build, Audit
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Check formatting (Biome)
        run: npm run format:check

      - name: Lint (ESLint)
        run: npm run lint

      - name: Type check (TypeScript)
        run: npm run typecheck

      - name: Build (Next.js)
        run: npm run build

      - name: Security audit
        run: npm audit --audit-level=high

      - name: Test
        run: npm test

      - name: Check bundle size
        run: npm run size
```

### 2.2 CodeQL — `.github/workflows/codeql.yml`

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "30 1 * * 1"

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      actions: read
      contents: read

    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

### 2.3 Dependabot — `.github/dependabot.yml`

```yaml
version: 2

updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Europe/Paris"
    open-pull-requests-limit: 10
    groups:
      all-dependencies:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Europe/Paris"
```

---

## Phase 3 — Tests & Monitoring

### 3.1 Vitest + Testing Library

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8
```

**`vitest.config.ts`** :

```ts
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/**/types.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**`tests/setup.ts`** :

```ts
import "@testing-library/jest-dom/vitest";
```

**Scripts `package.json`** :

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Test exemple `src/lib/utils.test.ts`** :

```ts
import { describe, expect, it } from "vitest";

const add = (a: number, b: number): number => a + b;

describe("utils", () => {
  it("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

### 3.2 size-limit

```bash
npm install --save-dev size-limit @size-limit/preset-app
```

**`package.json`** — config :

```json
"size-limit": [
  {
    "name": "Static assets",
    "path": ".next/static",
    "limit": "2 MB",
    "gzip": false,
    "running": false
  }
]
```

**Script** :

```json
"size": "size-limit"
```

> **Note :** `size-limit` doit tourner **après** le build (`npm run build` puis `npm run size`).
> Le CI le fait dans l'ordre. Adaptez `limit` et `path` selon votre projet.

---

## Résumé des fichiers à créer

| Fichier | Rôle |
|---|---|
| `.editorconfig` | Standardisation éditeurs |
| `.nvmrc` | Version Node épinglée |
| `biome.json` | Configuration Biome |
| `.commitlintrc.json` | Règles Conventional Commits |
| `.husky/commit-msg` | Hook validation message de commit |
| `.husky/pre-commit` | Hook lint-staged |
| `.husky/pre-push` | Hook check rapide |
| `.github/workflows/ci.yaml` | Pipeline CI principal |
| `.github/workflows/codeql.yml` | Analyse de sécurité SAST |
| `.github/dependabot.yml` | Mise à jour automatique dépendances |
| `vitest.config.ts` | Configuration Vitest |
| `tests/setup.ts` | Setup Testing Library |

## Résumé des dépendances à installer

```bash
npm install --save-dev \
  @biomejs/biome \
  @commitlint/cli @commitlint/config-conventional \
  vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8 \
  size-limit @size-limit/preset-app \
  husky lint-staged
```

## Commandes utiles après installation

| Commande | Action |
|---|---|
| `npm run format` | Formate tout le projet (Biome) |
| `npm run format:check` | Vérifie le formatage |
| `npm run check` | Format + lint + typecheck |
| `npm test` | Lance les tests |
| `npm run test:coverage` | Tests + couverture |
| `npm run size` | Vérifie la taille du bundle (après build) |

---

## Notes d'adaptation

- **Pas de Next.js ?** Supprimez `eslint-config-next`, utilisez Biome en linter complet (activez `linter.enabled = true` dans `biome.json`, supprimez ESLint).
- **Pas de Tailwind ?** Supprimez la section `css.parser` de `biome.json`.
- **pnpm / yarn ?** Remplacez `npm` par votre package manager dans les scripts et le CI.
- **Node version différente ?** Ajustez `.nvmrc` et `package.json` `engines`.
- **Autre CI (GitLab, CircleCI) ?** Les steps sont les mêmes, adaptez la syntaxe du pipeline.
