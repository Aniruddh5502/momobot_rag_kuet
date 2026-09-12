# Notion — Design System Teardown
*A senior UI/UX engineering read of Notion's visual language, interaction patterns, and motion system.*

---

## 1. Design Philosophy (the "why" behind every choice below)

Notion's whole visual system is built around **one rule: the UI should disappear so the user's content becomes the interface.** Every decision below traces back to that:

- **Achromatic chrome, chromatic content.** The app shell (sidebar, topbar, buttons) is almost entirely black/white/gray. Color is reserved for *user-generated* content — block colors, icons, callouts. This is why Notion feels calm even when a page is dense.
- **Paper-like warmth, not clinical white.** Backgrounds and body text use warm off-white/off-black rather than pure `#FFFFFF`/`#000000`, evoking paper and ink rather than "software."
- **Restraint over delight.** Unlike Linear (snappy, kinetic) or Stripe (showy gradients), Notion's motion is quiet — animations exist to explain state changes, almost never to entertain.
- **Everything is a block.** The entire interaction model (drag handles, hover affordances, `/` commands, nested toggles) flows from treating every UI element as a manipulable object, mirroring the document model itself.

---

## 2. Color System

### Core brand/neutral tokens (verified)
| Token | Hex | Usage |
|---|---|---|
| Notion Black | `#000000` | Logo, primary icons, highest-emphasis text |
| Notion White | `#FFFFFF` | Light-mode canvas |
| Body text (light) | `#37352F` | Primary reading text — warm near-black, *not* `#000` (softer on eyes for long docs) |
| Body text (dark) | `rgba(255,255,255,0.9)` | Primary text in dark mode |
| Secondary/UI gray | `#787774` / `#9B9A97` | Icons, secondary text, placeholder text |
| Notion Blue (accent) | `#2EAADC` | Links, selection highlights, focus affordances |
| Dark-mode canvas | `#191919` – `#2F3437` | App background / block backgrounds in dark mode |

### Content-block palette (the 10 "Notion Colors" — light mode)
These are the only colors exposed to users for text/background/callouts — deliberately desaturated so blocks never fight for attention:

| Color | Text hex | Background hex |
|---|---|---|
| Gray | `#9B9A97` | `#EBECED` |
| Brown | `#64473A` | `#E9E5E3` |
| Orange | `#D9730D` | `#FAEBDD` |
| Yellow | `#DFAB01` | `#FBF3DB` |
| Green | `#0F7B6C` | `#DDEDEA` |
| Blue | `#0B6E99` | `#DDEBF1` |
| Purple | `#6940A5` | `#EAE4F2` |
| Pink | `#AD1A72` | `#F4DFEB` |
| Red | `#E03E3E` | `#FBE4E4` |

### Dark mode equivalents
| Color | Text hex | Background hex |
|---|---|---|
| Gray | `rgba(151,154,155,.95)` | `#454B4E` |
| Brown | `#937264` | `#434040` |
| Orange | `#FFA344` | `#594A3A` |
| Yellow | `#FFDC49` | `#59563B` |
| Green | `#4DAB9A` | `#354C4B` |
| Blue | `#529CCA` | `#364954` |
| Purple | `#9A6DD7` | `#443F57` |
| Pink | `#E255A1` | `#533B4C` |
| Red | `#FF7369` | `#594141` |

**Design principle to steal:** notice text-color and background-color for each hue are *not* simple tint/shade pairs of one value — text colors are pulled darker/more saturated for legibility, backgrounds are pulled to near-desaturated pastels (~90% lightness) so they read as "highlighter," not "paint." If you're building a similar system, generate each pair independently against a fixed contrast target rather than deriving one from the other algorithmically.

**Icon colors** run a shade more saturated than text colors of the same name (e.g., link-blue text `#487CA5` vs. icon-blue `#337EA9`) — a subtle trick to keep small glyphs from looking washed out at 16–20px.

---

## 3. Typography

- **UI font:** System font stack (`-apple-system`, `Segoe UI`, `Roboto` fallback chain) for the app chrome — not a custom webfont. This is a deliberate performance + "feels native" choice, same logic as GitHub/Linear.
- **Editor/content default font:** Renders as **Inter** (neo-grotesque, tall x-height, open apertures — designed by Rasmus Andersson, originally for Figma). Labeled simply "Default" in-app.
- **Alternate content fonts:** Serif (book-like, for long-form writing) and Mono (for code/technical tables) — user-toggleable per page, not per-workspace.
- **Marketing/editorial serif:** Notion's marketing site uses a licensed serif (commonly identified as Lyon) for headline moments — signals "considered writing tool," distinct from the product's functional sans.
- **Type scale (practical, observed):** Small, tight steps rather than a dramatic scale — body copy ~16px/1.5 line-height, block-level headings (H1/H2/H3) step up moderately (≈1.875rem / 1.5rem / 1.25rem) rather than the aggressive jumps you'd see in a marketing site. Reinforces the "document," not "poster," feel.

**Takeaway if building your own tool:** system-font-for-chrome + Inter-or-equivalent-for-content is a proven pattern for "productivity tool that feels fast and native" — it also sidesteps FOUT/FOIT for the UI shell entirely.

---

## 4. Shape Language — Border Radius

Notion's radius scale is small and tiered, not a single global value. Reasoning: **smaller elements get tighter radii, larger surfaces get proportionally larger ones**, so nothing ever looks "over-rounded" relative to its own size.

| Tier | ~Value | Applied to |
|---|---|---|
| Tight | 3px | Inline pills, small tags, tooltip chips |
| Small | 4–6px | Buttons, inputs, hover-state backgrounds behind sidebar items |
| Medium | 8–10px | Cards, popovers, dropdown menus |
| Large | 12–16px | Modals, larger panel surfaces |
| Full | 9999px (pill) | Avatars, status badges, toggle switches |

Border width is consistently **1px**, and borders are usually low-alpha black (`rgba(0,0,0,.1)`-ish) rather than a flat gray — this keeps edges visible against both white and colored block backgrounds without needing separate light/dark border tokens.

*(Note: exact pixel values above are triangulated from public teardown sources and general observation, not from Notion's internal design tokens, which aren't published — treat as "close enough to build from," not gospel.)*

---

## 5. Elevation / Shadow System

Notion uses **soft, low-opacity, multi-layer shadows** rather than a single hard drop shadow — the same technique Material and Stripe use for "paper stack" depth:

```css
/* resting card / popover */
box-shadow: rgba(15,15,15,0.05) 0px 0px 0px 1px,
            rgba(15,15,15,0.1) 0px 3px 6px,
            rgba(15,15,15,0.2) 0px 9px 24px;

/* hover-elevated state */
box-shadow: rgba(15,15,15,0.03) 0px 0px 0px 1px,
            rgba(15,15,15,0.08) 0px 2px 4px;
```
The pattern: a hairline 1px shadow acts as a border substitute, then 2–3 soft layers build up ambient depth. Nothing ever gets a hard, high-contrast shadow — that would read as "material design," which is not the vibe.

---

## 6. Motion System

### Timing & easing (the actual "feel")
- **Duration:** almost everything sits in the **100–250ms** band. Nothing in the core chrome exceeds ~300ms except large panel slides.
- **Easing:** `ease-out` for anything entering/expanding (fast start, soft landing), `ease-in` for anything collapsing/exiting. Standard `cubic-bezier(0.4, 0, 0.2, 1)`-style curves — no bounce, no elastic, no spring physics. Notion never uses playful overshoot; it's a "serious tool" signal.
- **Properties animated:** almost exclusively `opacity`, `transform` (translate/scale), and `background-color` — never animating `width`/`height`/`top`/`left` directly, for GPU-accelerated 60fps smoothness.

### Button click behavior
- **Hover:** background fades in from transparent to a light gray wash (`~120–150ms ease`), no scale change on hover — restraint again.
- **Active/press:** subtle background darkens a step further; primary (colored) buttons may scale to ~0.98 on `:active` for tactile feedback, released instantly on mouseup — no lingering animation.
- **No ripple effects, no shadow pop.** This is a flat, quiet click language, closer to a native desktop app than a "webby" one.

### Sidebar behavior
- **Hover-reveal pattern:** action icons (add page, more-options "…") are `opacity: 0` at rest and fade to `opacity: 1` on row hover (~100ms) — keeps the sidebar visually quiet until you need controls.
- **Row hover background:** a full-row light-gray background fades in, radius ~4–6px, inset a few px from the sidebar edges (not full-bleed) — this is what gives Notion's sidebar its "soft chip" feel rather than a flat list.
- **Expand/collapse (nested pages):** the triangle/chevron rotates 90° on toggle (short, ease, ~100ms) while child rows animate in via a height/opacity combination — fast enough to feel instant, not fast enough to feel like a glitch.
- **Drag-to-reorder:** picks up with a slight scale/shadow increase on the dragged row, other rows animate out of the way with a smooth reflow rather than snapping — this is one of the more "designed" motions in the whole app, because reordering is a core, high-frequency action.
- **Resize handle:** sidebar width drag has zero animation (1:1 with cursor) — correctly, since anything you're actively dragging should never be animated/lagged.

### "Updating screen" / block transitions
- **Inline editing is instant** — no debounce animation on typing; state changes (checkbox toggle, block color change) apply their visual change immediately, then the *persistence* (saved-to-server) is invisible/optimistic — you're never shown a spinner for typing.
- **Block insertion (`/` command, new block on Enter):** new block fades/slides in from a few px above its final position over ~100–150ms — communicates "this appeared here," not just "content changed."
- **Drag handle (⠿) reordering blocks:** identical logic to sidebar drag — element lifts slightly (subtle shadow/scale), a thin blue insertion-line indicator shows the drop target, other blocks reflow smoothly.
- **Toggle blocks (▸ collapsible sections):** height animates via a max-height/opacity technique, ~150–200ms ease-out on expand, faster on collapse — expanding should feel deliberate, collapsing should feel efficient.
- **Page navigation:** near-zero transition — Notion intentionally treats page changes like an SPA route swap, not a slide/fade "screen transition." This is a deliberate choice to keep the tool feeling instantaneous rather than cinematic (contrast with e.g. mobile-native apps that slide new screens in).

### Loading conventions
- **Skeleton blocks, not spinners, for page content:** on first open of an unloaded page, Notion shows flat gray rectangular placeholders roughly matching the shape of blocks about to load (text lines, image boxes) — no shimmer/gradient sweep, just a static or very subtle pulse. This matches the overall "quiet" motion philosophy — a shimmer sweep would be more "flashy SaaS," Notion opts for restraint even in loading states.
- **Small inline spinners** (a simple rotating ring, not branded/custom) appear only for short async actions — file uploads, AI generation, search — where a skeleton wouldn't make sense.
- **Progressive/streaming reveal for Notion AI:** text streams in token-by-token similar to a chat interface, reinforcing "thinking," rather than a blocking spinner-then-dump.
- **Perceived-performance trick:** because typing/toggling is optimistic (UI updates before server confirms), the *only* place users see real loading is initial page load and AI generation — everywhere else "loading" doesn't visually exist, which is arguably Notion's biggest motion-design win.

---

## 7. Cross-Cutting Principles Worth Copying

1. **Motion budget is small and consistent.** A handful of durations (100/150/200/250ms) and two easing curves cover ~90% of the app. Consistency reads as "polished" more than variety does.
2. **Hierarchy of stillness:** chrome (sidebar, topbar, buttons) is almost static; content (blocks, drag interactions) gets the motion budget. Users' attention is steered by *what* moves, not just color/size.
3. **Optimistic UI everywhere it's safe.** Removing loading states from 95% of interactions is a bigger UX win than any animation could be.
4. **Desaturated-by-default, saturated-on-demand.** Neutral chrome + a tightly curated, muted content palette means user-added color always reads as intentional, never as noise competing with the UI.
5. **Radius and shadow scale with element size**, not a single global token — small things stay crisp, large surfaces get to feel soft.

---

### Sourcing note
Color hex values for the 10 content-block colors and neutral tokens are drawn from published CSS variables (docs.super.so's Notion color reference, cross-checked against community teardowns). Border-radius/shadow/motion-timing figures are triangulated from public reverse-engineering write-ups and direct product observation — Notion doesn't publish an official public design-token spec, so treat pixel/ms figures as strong estimates to build from, not verbatim internal constants.