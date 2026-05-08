---
version: alpha
name: YouTube
description: YouTube's design system (Material You derivative, "Cobalt") powers a dark-first video platform across homepage, watch page, search results, channel pages, and the Studio dashboard. The system is built on a stark bimodal palette — near-black surfaces in dark mode, near-white in light — unified by a saturated YouTube Red (#FF0000) for brand moments and a softer coral (#FF4E45) for primary interactive CTAs. Roboto is the universal typeface across all roles. Pill-shaped filter chips, rounded-rectangle thumbnails (12px), circular avatars, and a consistent "compact-then-expand" hover pattern define the spatial signature.

colors:
  # Brand
  yt-red: "#FF0000"
  yt-red-deep: "#CC0000"
  yt-red-soft: "#FF4E45"
  on-yt-red: "#FFFFFF"

  # Light mode surfaces
  canvas: "#FFFFFF"
  surface-elevated: "#F9F9F9"
  surface-overlay: "#F2F2F2"
  surface-chip: "#F2F2F2"
  surface-chip-selected: "#0F0F0F"

  # Dark mode surfaces
  dark-canvas: "#0F0F0F"
  dark-surface-elevated: "#212121"
  dark-surface-overlay: "#272727"
  dark-surface-chip: "#272727"
  dark-surface-chip-selected: "#FFFFFF"

  # Ink / Text — light mode
  ink: "#0F0F0F"
  ink-secondary: "#606060"
  ink-tertiary: "#909090"
  ink-disabled: "#AAAAAA"
  ink-on-dark: "#FFFFFF"
  ink-on-dark-secondary: "#AAAAAA"

  # Ink / Text — dark mode (same tokens, different resolved values)
  dark-ink: "#F1F1F1"
  dark-ink-secondary: "#AAAAAA"
  dark-ink-tertiary: "#717171"

  # Interactive
  link: "#065FD4"
  link-visited: "#6A0DAD"
  focus-ring: "#065FD4"
  subscribe-cta: "#FF0000"
  subscribe-cta-pressed: "#CC0000"
  subscribed-state: "#272727"   # dark pill post-subscription
  like-active: "#0F0F0F"        # filled thumb icon
  dislike-active: "#0F0F0F"

  # Semantic
  live-badge: "#FF0000"
  members-only: "#2BA640"
  premium-gold: "#FFD600"
  error: "#D93025"
  progress-red: "#FF0000"       # video progress bar fill
  buffered-gray: "#909090"      # buffered section of progress bar

  # Hairlines / borders
  hairline: "#E5E5E5"
  hairline-dark: "#3D3D3D"

  # Overlay backgrounds (floating menus, tooltips)
  scrim: "rgba(0, 0, 0, 0.6)"
  tooltip-bg: "#606060"

typography:
  # Display / Hero
  hero-display:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.22
  display-lg:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.33

  # Headings
  heading-lg:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.30
  heading-md:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.33
  heading-sm:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.375

  # Body
  body-lg:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
  body-sm:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.46

  # Video metadata (the canonical thumbnail caption stack)
  video-title:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    maxLines: 2
    letterSpacing: 0
  video-meta:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    color: "{colors.ink-secondary}"

  # Labels / captions
  label-bold:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: 0.5px
  label-md:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
  caption:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.27

  # Buttons
  button-md:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0.25px
  button-sm:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.23
    letterSpacing: 0.25px

  # Chip / filter tabs
  chip-label:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43

  # Input
  input-md:
    fontFamily: Roboto, Arial, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 500px       # filter chips, subscribe buttons — effectively infinite radius
  circle: 50%       # avatars, icon buttons

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px
  section: 48px
  section-lg: 64px
  gutter: 24px      # standard horizontal gutter between grid columns

components:
  # ── Buttons ──
  button-subscribe:
    backgroundColor: "{colors.subscribe-cta}"
    textColor: "{colors.on-yt-red}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: 36px
  button-subscribe-pressed:
    backgroundColor: "{colors.subscribe-cta-pressed}"
  button-subscribed:
    backgroundColor: "{colors.subscribed-state}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: 36px
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: 36px
  button-secondary:
    backgroundColor: "{colors.surface-chip}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: 36px
    border: "none"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: 36px
  button-icon-circular:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    size: 40px

  # ── Filter chips ──
  chip-filter:
    backgroundColor: "{colors.surface-chip}"
    textColor: "{colors.ink}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
    height: 32px
  chip-filter-active:
    backgroundColor: "{colors.surface-chip-selected}"
    textColor: "{colors.canvas}"

  # ── Like / Dislike pill ──
  like-dislike-pill:
    backgroundColor: "{colors.surface-chip}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    height: 36px
    divider: "1px solid {colors.hairline}"   # vertical divider between thumb-up and thumb-down

  # ── Cards ──
  card-video-grid:
    backgroundColor: "transparent"
    rounded: "{rounded.lg}"           # thumbnail only; no card chrome
    aspectRatio: "16 / 9"
    thumbnailRadius: "{rounded.lg}"

  card-video-list:
    backgroundColor: "transparent"
    thumbnailWidth: 246px
    thumbnailRadius: "{rounded.lg}"
    aspectRatio: "16 / 9"

  card-short-vertical:
    backgroundColor: "{colors.dark-canvas}"
    rounded: "{rounded.xl}"
    aspectRatio: "9 / 16"
    thumbnailRadius: "{rounded.xl}"

  card-channel-feature:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
    border: "1px solid {colors.hairline}"

  card-playlist:
    backgroundColor: "{colors.surface-chip}"
    rounded: "{rounded.lg}"
    aspectRatio: "16 / 9"

  card-mix-strip:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"

  # ── Overlays on thumbnails ──
  badge-duration:
    backgroundColor: "rgba(0, 0, 0, 0.8)"
    textColor: "#FFFFFF"
    typography: "{typography.label-bold}"
    rounded: "{rounded.xs}"
    padding: "2px 4px"

  badge-live:
    backgroundColor: "{colors.live-badge}"
    textColor: "#FFFFFF"
    typography: "{typography.label-bold}"
    rounded: "{rounded.xs}"
    padding: "2px 4px"

  badge-new:
    backgroundColor: "{colors.live-badge}"
    textColor: "#FFFFFF"
    typography: "{typography.label-bold}"
    rounded: "{rounded.xs}"
    padding: "2px 4px"

  badge-members:
    backgroundColor: "{colors.members-only}"
    textColor: "#FFFFFF"
    typography: "{typography.label-bold}"
    rounded: "{rounded.xs}"
    padding: "2px 4px"

  # ── Progress bar ──
  video-progress-bar:
    trackColor: "rgba(255,255,255,0.3)"
    fillColor: "{colors.progress-red}"
    bufferedColor: "{colors.buffered-gray}"
    height: 3px
    height-hover: 5px
    scrubberSize: 12px    # appears on hover/drag only

  # ── Search bar ──
  search-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.input-md}"
    rounded: "{rounded.pill}"
    border: "1px solid {colors.hairline}"
    height: 40px
    padding: "0 16px"
  search-bar-focused:
    border: "1px solid {colors.focus-ring}"
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)"

  # ── Comment input ──
  comment-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    borderBottom: "1px solid {colors.hairline}"
    padding: "4px 0"

  # ── Avatar ──
  avatar-lg:
    size: 40px
    rounded: "{rounded.circle}"
  avatar-xl:
    size: 48px
    rounded: "{rounded.circle}"
  avatar-channel-hero:
    size: 80px
    rounded: "{rounded.circle}"
  avatar-channel-hero-lg:
    size: 160px
    rounded: "{rounded.circle}"

  # ── Tooltips & menus ──
  tooltip:
    backgroundColor: "{colors.tooltip-bg}"
    textColor: "#FFFFFF"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"

  context-menu:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xs} 0"
    shadow: "0 4px 6px 0 rgba(0,0,0,0.2), 0 4px 10px 4px rgba(0,0,0,0.1)"
    minWidth: 200px

  # ── Notification badge ──
  notification-dot:
    backgroundColor: "{colors.yt-red}"
    textColor: "#FFFFFF"
    typography: "{typography.caption}"
    rounded: "{rounded.circle}"
    size: 16px

  # ── Chapter marker ──
  chapter-marker:
    backgroundColor: "#FFFFFF"
    height: 3px
    gap: 2px     # white gap between chapter segments on progress bar

  # ── Settings panel ──
  settings-panel:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "0"
    shadow: "0 4px 6px rgba(0,0,0,0.15)"
    width: 256px

  # ── Player controls ──
  player-control-bar:
    backgroundColor: "linear-gradient(transparent, rgba(0,0,0,0.7))"
    padding: "0 12px 8px"
    height: 48px

  # ── Sidebar nav item ──
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: 40px
  nav-item-active:
    backgroundColor: "{colors.surface-chip}"
    fontWeight: 700

  # ── Shelf section header ──
  shelf-header:
    typography: "{typography.heading-md}"
    padding: "0 0 {spacing.md}"

  # ── Studio components ──
  studio-sidebar-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: 40px

  studio-data-card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
    border: "1px solid {colors.hairline}"
    shadow: "none"
---

## Overview

YouTube's design system ("Cobalt") operates at massive scale across a dark-first video platform — homepage, watch page, search results, Shorts, Studio, and mobile apps. The system is a Material You derivative that has been heavily customized away from generic Material 3. Its identity rests on a small set of highly recognizable signatures: thumbnail-first layouts with no card chrome, Roboto at every text role, pill-shaped chips and subscribe buttons, and a disciplined bimodal palette (near-black in dark mode, near-white in light) punctuated by YouTube Red only at brand moments and the subscribe CTA.

The system is notable for what it does NOT do: no heavy shadows, no gradients in UI chrome, no illustration or decorative artwork. Surfaces are flat. Depth is conveyed through background tones (`{colors.dark-surface-elevated}` vs `{colors.dark-canvas}`) and scrims. Photography and thumbnails provide all visual richness.

**Key characteristics:**
- Thumbnail-first card system: no border, no shadow, no card chrome — the thumbnail IS the card surface, rounded at `{rounded.lg}` (12px)
- Dark-first palette: `{colors.dark-canvas}` (#0F0F0F) as the default page background in dark mode; `{colors.canvas}` (#FFFFFF) in light mode
- `{colors.yt-red}` (#FF0000) used with extreme scarcity: subscribe CTA, live badges, video progress bar, notification dot only. All other primary interactions use `{colors.ink}` (near-black) pills
- Roboto is the only typeface — no display or brand typeface; weight and size alone carry hierarchy
- Pill shape (`{rounded.pill}`) on all interactive chips and subscribe/join buttons; no squared buttons anywhere in the main UI
- Circular avatars (`{rounded.circle}`) at all size steps
- Compact density: the grid uses tight 8px gaps between metadata rows; video titles are clamped to 2 lines at `{typography.video-title}` (14px / 500)

## Colors

> Source surfaces: youtube.com/ (homepage dark + light), /watch (player page), /results (search), /@channel (channel page), studio.youtube.com/ (Studio dashboard). The token set is unified across all surfaces with dark/light mode switching only the surface and ink tokens — the brand and semantic tokens remain identical.

### Brand & Accent
- **YouTube Red** (`{colors.yt-red}`): Strictly reserved. Appears only on: the subscribe button pre-subscription, live/NEW thumbnail badges, the video progress bar fill, and the notification dot. Never used as a body link, never used decoratively.
- **Deep Red** (`{colors.yt-red-deep}`): Pressed state of the subscribe button.
- **Link Blue** (`{colors.link}`): Hyperlinks in descriptions, comment mentions, and chapter timestamps. A standard Google Blue, not a YouTube brand color.

### Surfaces — Dark Mode (default)
- **Dark Canvas** (`{colors.dark-canvas}`, #0F0F0F): Primary page background. Near-black, not pure black.
- **Dark Elevated** (`{colors.dark-surface-elevated}`, #212121): Sidebar, "Up next" rail, settings panels, context menus.
- **Dark Overlay** (`{colors.dark-surface-overlay}`, #272727): Chip rest state, subscribed-state button, secondary hover highlights.

### Surfaces — Light Mode
- **Canvas White** (`{colors.canvas}`, #FFFFFF): Primary page background.
- **Soft Gray** (`{colors.surface-elevated}`, #F9F9F9): Sidebar, elevated containers.
- **Chip Gray** (`{colors.surface-chip}`, #F2F2F2): Filter chip rest state, secondary button rest state, active nav item.

### Text
- **Ink** (`{colors.ink}`, #0F0F0F): Primary text on light surfaces. Mirrors dark canvas.
- **Secondary** (`{colors.ink-secondary}`, #606060): Video metadata — channel name, view count, upload date.
- **Tertiary** (`{colors.ink-tertiary}`, #909090): Timestamps, captions, de-emphasized states.
- **Dark Ink** (`{colors.dark-ink}`, #F1F1F1): Primary text on dark surfaces.
- **Dark Secondary** (`{colors.dark-ink-secondary}`, #AAAAAA): Metadata on dark surfaces.

### Semantic
- **Live Badge** (`{colors.live-badge}`): Red pill badge in the bottom-left corner of live thumbnails.
- **Members Only** (`{colors.members-only}`): Green badge for members-only content.
- **Premium Gold** (`{colors.premium-gold}`): YouTube Premium brand accent (used sparingly in upsell flows).
- **Progress Red** (`{colors.progress-red}`): Video player progress bar fill — same hue as `{colors.yt-red}`.

## Typography

### Font Family
**Roboto** is the sole typeface across all YouTube surfaces. The fallback chain is `Roboto, Arial, sans-serif`. No custom display face, no serif, no monospace in the public-facing UI. Studio uses the same stack. YouTube has not introduced a proprietary variable typeface; the type system relies entirely on weight (400, 500, 700) and size variation for hierarchy.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.hero-display}` | 36px | 400 | 1.22 | Channel page subscriber counts, premium hero titles |
| `{typography.display-lg}` | 24px | 400 | 1.33 | Section openers, empty-state headlines |
| `{typography.heading-lg}` | 20px | 500 | 1.30 | Watch page video title (full), channel name on channel page |
| `{typography.heading-md}` | 18px | 500 | 1.33 | Shelf section headers ("Recommended", "Latest from...") |
| `{typography.heading-sm}` | 16px | 500 | 1.375 | Comment sort label, settings section heads |
| `{typography.body-lg}` | 16px | 400 | 1.5 | Video description body, comment input placeholder |
| `{typography.body-md}` | 14px | 400 | 1.43 | Comment body, channel about text, Studio table cells |
| `{typography.body-sm}` | 13px | 400 | 1.46 | Sidebar nav labels, Studio secondary copy |
| `{typography.video-title}` | 14px | 500 | 1.43 | Grid thumbnail caption — the most frequently rendered text on the platform |
| `{typography.video-meta}` | 12px | 400 | 1.33 | Channel name + view count + date beneath thumbnail |
| `{typography.label-bold}` | 12px | 700 | 1.33 | Duration badge, LIVE badge, NEW badge overlay text |
| `{typography.chip-label}` | 14px | 500 | 1.43 | Filter chip text ("All", "Music", "Gaming", "Live") |
| `{typography.button-md}` | 14px | 500 | 1.43 | Subscribe, Join, Share, Download buttons |
| `{typography.caption}` | 11px | 400 | 1.27 | Tooltip text, legal fine print |

### Principles
- The video-title + video-meta stack is the most frequently rendered typographic pattern on YouTube. The two-line clamp on `{typography.video-title}` is a performance and layout constraint, not a stylistic choice — titles exceeding 2 lines are truncated with an ellipsis.
- YouTube avoids negative letter-spacing. Tracking is at 0 for all body roles; `{typography.label-bold}` and `{typography.button-md}` use a small positive `+0.25–0.5px` to improve legibility at small sizes and all-caps contexts.
- Weight contrast is tight — only 400/500/700 are in use. The platform avoids the 300 (light) weight used decoratorially in other Google products. The result is a denser, information-efficient feel rather than an editorial open aesthetic.
- All-caps is NOT used anywhere in the main YouTube UI. Text is always sentence case or title case for proper nouns (channel names, video titles).

## Layout

### Spacing System
- **Base unit**: 8px increment.
- Core tokens: `{spacing.xxs}` (2px) · `{spacing.xs}` (4px) · `{spacing.sm}` (8px) · `{spacing.md}` (12px) · `{spacing.base}` (16px) · `{spacing.lg}` (20px) · `{spacing.xl}` (24px) · `{spacing.xxl}` (32px) · `{spacing.xxxl}` (40px) · `{spacing.section}` (48px) · `{spacing.section-lg}` (64px).
- **Between thumbnail and title**: `{spacing.md}` (12px) vertical gap.
- **Between title and meta**: `{spacing.xs}` (4px) vertical gap — the two metadata rows (channel + views/date) are `{spacing.xxs}` (2px) apart.
- **Between grid columns**: 16px gap.
- **Shelf padding**: `{spacing.section}` (48px) top, `{spacing.xxl}` (32px) bottom.

### Grid — Homepage
- **Desktop wide (≥1280px)**: 4-column video grid, 360px max-width thumbnails, 16px column gap. Sidebar is 240px; collapses to 72px (icon-only mini-rail) on smaller desktops.
- **Desktop standard (1024–1279px)**: 3-column video grid.
- **Tablet (768–1023px)**: 2-column video grid; sidebar hidden, bottom nav appears.
- **Mobile (<768px)**: 1-column full-width cards.

### Watch Page Layout
- Primary layout: 2-column (player left + recommendations right rail).
- Player column: max-width ~854px (16:9 at desktop), fills available width minus right rail.
- Right rail: 402px fixed width on wide desktop; collapses fully to below the player on tablet/mobile.
- Description and comments render below the player, full width of the player column.
- "Theater mode" expands player to full viewport width, moves rail below.

### Whitespace Philosophy
YouTube is information-dense. The system deliberately runs tighter than Material Design defaults: section gaps are narrower, line heights are modest, and the thumbnail grid is packed. Whitespace is reserved for separation between major sections (shelves) and around the player in watch mode. Inside the recommendation rail, cards are 0-gap stacked lists.

## Elevation & Depth

YouTube runs essentially flat — no drop shadows on grid thumbnails, no elevation on the nav bar. Depth is communicated through background-tone layering only.

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, transparent bg | Thumbnails, nav bar |
| 1 (surface) | Background tone shift (`{colors.dark-surface-elevated}` vs `{colors.dark-canvas}`) | Sidebar, "Up next" panel |
| 2 (context menu) | `0 4px 6px rgba(0,0,0,0.2), 0 4px 10px 4px rgba(0,0,0,0.1)` | Context menus, settings panel, suggestion dropdowns |
| 3 (scrim) | `{colors.scrim}` full-viewport overlay | Modal dialogs, share sheets |
| Player | `linear-gradient(transparent, rgba(0,0,0,0.7))` | Player control bar gradient over video |

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Progress bar track, chapter segments |
| `{rounded.xs}` | 2px | Duration/LIVE/NEW badges on thumbnails |
| `{rounded.sm}` | 4px | Tooltips, Studio table accents |
| `{rounded.md}` | 8px | Context menus, sidebar active state, settings panel |
| `{rounded.lg}` | 12px | Video thumbnails (the dominant card shape), search results cards |
| `{rounded.xl}` | 16px | Shorts thumbnails, channel feature cards |
| `{rounded.xxl}` | 24px | Shorts overlay cards, large modal corners |
| `{rounded.pill}` | 500px | Filter chips, subscribe/join/share buttons, like-dislike pill, search bar |
| `{rounded.circle}` | 50% | All avatars, circular icon buttons |

### Thumbnail Geometry
- Standard video thumbnails: `{rounded.lg}` (12px), 16:9 aspect ratio. No border, no shadow.
- Shorts thumbnails: `{rounded.xl}` (16px), 9:16 aspect ratio.
- Playlist thumbnails: `{rounded.lg}` with a stacked-paper visual effect (two offset drop-shadow rects) on the right edge to imply a collection.
- Live thumbnails carry a `{badge-live}` overlay in the bottom-left corner.

## Components

### Buttons

**`button-subscribe`** — The red pill CTA, the most recognized affordance on the platform.
- Background `{colors.subscribe-cta}` (#FF0000), text white, typography `{typography.button-md}`, height 36px, rounded `{rounded.pill}`, padding `10px 16px`.
- Pressed state `button-subscribe-pressed` deepens to `{colors.subscribe-cta-pressed}` (#CC0000).
- After subscription, transitions to `button-subscribed`: dark pill with a "Subscribed ▾" label and a dropdown indicating notification preferences.

**`button-primary`** — Near-black pill for primary non-subscribe actions (e.g., "Join", "Try Premium").
- Background `{colors.ink}` (#0F0F0F), text `{colors.canvas}`, rounded `{rounded.pill}`.

**`button-secondary`** — Surface-toned pill for secondary actions ("Share", "Download", "Clip", "Thanks").
- Background `{colors.surface-chip}`, text `{colors.ink}`, rounded `{rounded.pill}`. No border.

**`button-ghost`** — Text-only pill for tertiary actions.
- Transparent background, text `{colors.ink}`, rounded `{rounded.pill}`.

**`button-icon-circular`** — 40px circular tap target for icon-only actions (search, notifications, profile, menu, cast, next video, fullscreen).
- Transparent background. Never uses a visible resting border or background — the icon alone communicates affordance.

### Filter Chips

**`chip-filter`** + **`chip-filter-active`** — Horizontal scrolling row below the search bar on homepage and search results.
- Inactive: `{colors.surface-chip}` background, `{colors.ink}` text, `{rounded.pill}`, 32px height, padding `6px 12px`.
- Active: `{colors.surface-chip-selected}` background, white text (dark mode inverted).
- Chips never display an icon in the standard filter row (text-only). On the watch page, chapter navigation can use small icon-chips.

### Cards & Thumbnails

**`card-video-grid`** — The fundamental unit of the platform. Pure thumbnail — no card chrome.
- 16:9 thumbnail, `{rounded.lg}` corners. Below: `{typography.video-title}` (2-line clamp), then `{typography.video-meta}` channel name on row 1, view count + upload date on row 2.
- Channel avatar (32px circle) sits in the top-left of the metadata zone, adjacent to the title.
- Three-dot "more" icon button appears top-right of the metadata zone — only on hover (desktop).
- A hover-preview animation plays after ~1s hover on desktop: a short looping clip replaces the thumbnail, and chapter markers appear on a mini progress bar overlaid at the thumbnail bottom.

**`card-video-list`** — Search results, "Up next" rail. Horizontal layout: 246px thumbnail left, metadata right.
- Same thumbnail rounding and metadata hierarchy as grid card.

**`card-short-vertical`** — Shorts shelf. 9:16 ratio, `{rounded.xl}` corners. Title and channel name overlaid bottom-left in white on a gradient scrim.

**`card-playlist`** — Playlist tiles in grid. Same as video thumbnail but with stacked-paper visual effect on right edge.

### Like / Dislike Pill

**`like-dislike-pill`** — A segmented pill containing thumb-up icon + count and thumb-down icon, separated by a hairline divider.
- Background `{colors.surface-chip}`, rounded `{rounded.pill}`, height 36px.
- Active (liked) state: thumb-up icon fills to `{colors.like-active}`, count animates.
- This pill never uses the YouTube Red color for the active like state — it uses the standard `{colors.ink}` filled icon.

### Progress Bar

**`video-progress-bar`** — The player's seek bar.
- Track: `rgba(255,255,255,0.3)`, height 3px at rest expanding to 5px on hover.
- Fill: `{colors.progress-red}`.
- Buffered section: `{colors.buffered-gray}` between fill and track.
- Scrubber dot: 12px circle, white, appears only on hover/drag.
- Chapter markers: white 2px gaps separating chapters on the fill and track simultaneously.

### Search Bar

**`search-bar`** — Top nav center. Pill shape (`{rounded.pill}`), 40px height, bordered at rest (`1px solid {colors.hairline}`), receives `box-shadow` on focus.
- Adjacent to the search bar: a mic icon circular button (voice search) and a camera icon button (visual search).
- Suggestions dropdown uses `context-menu` chrome with `{rounded.lg}`.

### Navigation

**Top Navigation (Desktop)** — Fixed top bar, transparent/dark-canvas background.
- Left: hamburger menu icon + YouTube logo (wordmark with red `▶` play icon).
- Center: search bar + mic + camera icons.
- Right: upload button (ghost), notifications bell + dot, profile avatar circle.
- Height: 56px.

**Sidebar Navigation (Desktop)** — Left rail, `{colors.dark-surface-elevated}` or `{colors.surface-elevated}` background.
- Expanded state: 240px. Icon-only mini state: 72px. Toggled by the hamburger.
- Items use `nav-item` chrome: 40px height, `{rounded.md}` active highlight.
- Sections: Home / Shorts / Subscriptions / divider / Library / History / Playlists / divider / Subscriptions list.

**Bottom Navigation (Mobile)** — 5-icon tab bar (Home, Shorts, Create, Subscriptions, Library). Replaces sidebar. 48px height, transparent background, hairline top border.

**Channel Page Tabs** — Underline tab pattern below the channel header (Home / Videos / Shorts / Live / Playlists / Community / About). Active tab: 2px bottom border in `{colors.ink}` (light mode) or `{colors.dark-ink}` (dark mode). No pill shape — this is the one place YouTube uses an underline tab rather than a chip.

### Player Controls

**`player-control-bar`** — Overlaid on video, revealed on hover.
- Gradient scrim from transparent to `rgba(0,0,0,0.7)` covers the lower ~80px of the video.
- Left group: play/pause, skip-10s, volume + scrubber.
- Right group: subtitles, settings, theater, fullscreen, pip.
- All icons: white, 24px, circular touch targets.
- Settings panel (`{components.settings-panel}`): 256px floating panel, `{rounded.lg}`, dark-elevated background.

### Comments

Comment thread is below the player, full player-column width.
- Comment input: `{components.comment-input}` — bottom-border-only input (no outline box), avatar left.
- Top-level comment: 40px avatar left, `{typography.body-md}` body, `{typography.video-meta}` timestamp and channel name.
- Reply thread: 24px indent, same chrome as top-level.
- Like count + thumb-up icon + thumb-down icon appear inline right of each comment.

### Badges & Status

All thumbnail badges use `{rounded.xs}` (2px) — near-square corners, not pills. This distinguishes them visually from interactive chip pills.

**`badge-duration`** — Bottom-right of thumbnail. `rgba(0,0,0,0.8)` background, white `{typography.label-bold}` text. Always visible (not hover-only).

**`badge-live`** — Bottom-left of thumbnail or top of card. Red `{colors.live-badge}` background, "LIVE" in `{typography.label-bold}`.

**`badge-members`** — Green `{colors.members-only}`, "Members only" label.

### Notifications

**`notification-dot`** — 16px red circle overlaid on the bell icon, containing a count in `{typography.caption}` white.
- Count is clamped to "99+" for values above 99.

### Studio Components

YouTube Studio uses the same Roboto typeface and color tokens but has a denser, data-oriented layout.
- Studio sidebar: `{components.studio-sidebar-item}`, 40px items, left-icon pattern.
- Data cards: `{components.studio-data-card}` — white card, `{rounded.lg}`, hairline border, no shadow. Contains chart + stat + label.
- Table rows: hairline-separated, 52px height, sortable columns with up/down chevron icons.

## Do's and Don'ts

### Do
- Reserve `{colors.yt-red}` for the subscribe button, live/NEW badges, progress bar, and notification dot only. Its scarcity is what gives it signal strength.
- Use `{rounded.pill}` on every interactive chip and button — no squared buttons in the main UI.
- Use `{rounded.xs}` (2px) on thumbnail overlay badges (duration, LIVE, NEW) — this distinguishes badges from interactive chips.
- Clamp video titles to 2 lines using `{typography.video-title}` (14px / 500). Never let title text reflow to 3+ lines in a grid card.
- Use `{colors.surface-chip}` for the like-dislike pill, share, download, and clip buttons — not `{colors.yt-red}` and not `{colors.link}`.
- Keep thumbnail-to-title gap at exactly `{spacing.md}` (12px) — this is the canonical spacing for the most-repeated layout unit on the platform.
- Maintain the avatar-left pattern for all comment and channel-name rows: 32–40px circle avatar followed by name in `{typography.body-md}` weight 500.

### Don't
- Don't use `{colors.yt-red}` for body text links, hover states, or decorative accents — that is `{colors.link}` (blue) territory.
- Don't add card chrome (border, shadow, card background) to video grid thumbnails. The thumbnail is the card surface.
- Don't introduce a display or brand typeface. YouTube's system is Roboto only. Custom type reads as third-party widget.
- Don't use the underline tab pattern outside of channel page tab navigation. All other tab/filter patterns use pill chips.
- Don't render the video player progress bar in any color except `{colors.progress-red}`. The red is a functional affordance, not a decorative choice.
- Don't use shadows on nav bars or sidebar — elevation is tone-only in this system.
- Don't apply `{rounded.lg}` to Shorts thumbnails — they use `{rounded.xl}` (16px) to signal the different format.
- Don't size icon-button touch targets below 40px effective height/width.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | 1-column full-width cards. Bottom nav replaces sidebar. Player fills full width; rail below. Search collapses to icon → taps to expand full-width search overlay. |
| Tablet | 768 – 1023px | 2-column grid. Sidebar hidden. Bottom nav active. Player + below-player layout; no right rail. |
| Desktop compact | 1024 – 1279px | 3-column grid. Mini-sidebar (72px icon rail) default. Right rail appears on watch page. |
| Desktop standard | 1280 – 1535px | 4-column grid. Full sidebar (240px) default. |
| Desktop wide | ≥ 1536px | 4–5 column grid at max-width container. Larger thumbnails. |

### Player Responsive Modes
- **Default (windowed)**: 2-column layout, player left, recommendations right.
- **Theater mode**: Player expands to full container width, recommendations rail below.
- **Fullscreen**: Player at 100vw × 100vh, controls overlay, sidebar/nav hidden.
- **Miniplayer**: Pinned bottom-right 400×225px floating player (`{rounded.lg}`) with close and expand controls.

### Sidebar Collapse
- Full expanded (240px): icon + label for all nav items.
- Mini rail (72px): icon only, tooltip on hover.
- Hidden (0px): triggered on tablet and mobile; bottom nav takes over.
- The hamburger toggle animates width with `transition: width 0.2s ease`.

### Chip Row Behavior
- Homepage filter chips scroll horizontally on all breakpoints — no wrapping. Left/right fade + arrow affordance on desktop; touch-scroll on mobile.
- The chip row is sticky below the top nav on mobile (56px top nav + 48px chip row = 104px sticky zone).

### Thumbnail Hover Interactions (desktop only)
- After ~1s hover: silent video preview plays, thumbnail image fades.
- Mini progress bar and chapter markers appear at thumbnail bottom (3px height).
- Three-dot context menu button fades in at top-right of card.
- "Add to queue" / "Save to Watch Later" appears on left-hover edge.

## Iteration Guide

1. Start from the `card-video-grid` pattern — it is the most-rendered component. Getting it right compounds across every listing surface.
2. Token `{colors.yt-red}` is a trust signal; its overuse degrades the subscribe button's authority. Any new red usage must be justified against this constraint.
3. Roboto weight 500 is the "emphasis" weight — not 700. Use 700 only for badge labels (`{typography.label-bold}`) and nowhere in running body copy.
4. Dark mode is the primary experience for a majority of YouTube users. Always design dark-first and verify light mode as a second pass.
5. Touch targets: 40px minimum on mobile for all interactive elements. The like/dislike pill, chip filters, and icon buttons all sit at exactly 36–40px.
6. Never introduce pill-chip patterns on the channel page tab row — that surface uses an underline pattern deliberately. Mixing the two patterns on one surface breaks the affordance.
7. Thumbnail radius is `{rounded.lg}` (12px) for standard video and `{rounded.xl}` (16px) for Shorts. Never mix these within the same shelf.

## Known Gaps

- Exact animation timing functions for hover preview, chip transitions, and player control fade have not been extracted from source; recommend `cubic-bezier(0.2, 0, 0, 1)` (Material You standard) at 150–200ms for micro-interactions and 250ms for panel transitions.
- Dark mode resolved values for `{colors.link}` (blue) have not been formally verified — the blue adjusts slightly for contrast on dark surfaces but the exact hex is not captured.
- YouTube Shorts overlay typography (title, channel, CTA overlaid on video) uses white Roboto at larger sizes but exact tokens for this surface are not formally documented here; treat them as context-specific overrides.
- Audio-only mode and podcast surface tokens are not yet extracted — that product surface diverges from standard video card patterns.
- Right-to-left (RTL) layout mirroring rules for the player control bar and sidebar are not documented; the system supports RTL natively but tokens are not directional-aware.