---
name: Next Build
description: Linear-style desktop workspace for operating AI-assisted software delivery.
colors:
  canvas: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  muted-surface: "oklch(0.97 0 0)"
  muted-ink: "oklch(0.556 0 0)"
  hairline: "oklch(0.922 0 0)"
  purple-signal: "oklch(0.546 0.245 262.881)"
  success: "oklch(0.545 0.166 156.743)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    height: "32px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "32px"
    padding: "4px 10px"
---

# Design System: Next Build

## Overview

**Creative North Star: "The Delivery Ledger"**

Next Build is a dense desktop operating surface: quiet enough to scan for hours, explicit enough to expose every delivery state. Brand expression comes from precise hierarchy, hairline structure, and rare purple signals—not decorative containers.

The project workspace follows Linear's contextual model: global navigation, a narrow project rail, a path toolbar, a continuous work surface, and an optional inspector. Information stays close to the action that changes it.

**Key Characteristics:**

- Flat cold-gray surfaces separated by one-pixel rules.
- Compact 12–14px operating copy with 18px page titles.
- Purple marks selection or identity in small areas only.
- Lists and inspectors replace dashboard card grids.

## Colors

The palette is neutral-first. Canvas and ink carry almost the entire interface; semantic colors appear only when state requires them.

**The Rare Signal Rule.** Purple identifies the current context or selected item. It never becomes a large background field.

## Typography

Inter and the platform sans stack provide the primary voice; Geist Mono is reserved for repository names, branches, SHAs, and identifiers. Page titles use 18px semibold type with slight negative tracking. Body copy remains 14px; labels and table metadata use 11–12px.

**The Tool Density Rule.** Hierarchy comes from weight, spacing, and alignment before font-size escalation.

## Layout

The project workspace is desktop-only at 1280px and above. Its local navigation is 228px wide, path toolbar is 48px high, and the work surface uses a main column plus a 280px property rail or 340px task inspector. Content sections use 20–28px outer spacing and continuous `divide-y` rows.

Transitions use 160–180ms with `cubic-bezier(0.22, 1, 0.36, 1)`. Reduced-motion paths use zero duration. The interface must not overflow horizontally at the supported desktop widths.

## Elevation & Depth

The workspace is flat by default. Depth is expressed through tonal layering and hairline borders. Small controls may use the existing `shadow-xs`/`shadow-sm`; content regions do not combine borders with ambient card shadows.

**The Flat Workspace Rule.** Navigation, content, and inspector remain one continuous plane; cards do not become page structure.

## Shapes

Controls use restrained 6–10px corners. Pills are reserved for compact statuses. Workspace regions, list rows, and property panels stay rectangular and are separated by rules rather than rounded shells.

## Components

### Buttons

Primary actions are 32px high, near-black on white, medium weight, and rounded 6px. Outline and ghost variants carry secondary actions. Focus uses the shared ring token; disabled controls remain visible at reduced opacity.

### Inputs / Fields

Inputs are 32px high with a hairline border, white background, 6px corners, and a one-pixel focus ring. Textareas follow the same grammar and remain compact.

### Navigation

The active row uses a low-contrast muted surface and a small purple icon. Hover uses the same tonal family; navigation never uses a large saturated block.

### Lists and Inspectors

Operational data is presented as aligned rows with `divide-y` rules. The right rail holds context, creation forms, or properties; an empty rail must still explain the contract or next action.

## Do's and Don'ts

### Do:

- **Do** keep one visually dominant action per state.
- **Do** expose requirements, execution, delivery, and knowledge freshness in the project context.
- **Do** use mono type only for technical identifiers and measurements.
- **Do** preserve 160–180ms transitions and the reduced-motion zero-duration path.

### Don't:

- **Don't** rebuild the workspace as a grid of same-size cards or hero metrics.
- **Don't** duplicate a CTA between a toolbar and its empty state.
- **Don't** use decorative gradients, glass, or large accent surfaces.
- **Don't** leave an inspector as unexplained empty space.
