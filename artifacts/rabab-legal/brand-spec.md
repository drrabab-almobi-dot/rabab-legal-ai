# RABAB LEGAL AI — Public Domain Brand Specification

## Scope

This identity is intentionally limited to the public domain landing page at `/` and the domain-level favicon/structured metadata. It must not be imported into shared navigation, dashboards, consultation workflows, administration screens, or other internal platform pages.

## Approved asset

| Use | Asset | Notes |
|---|---|---|
| Public domain header and footer | `src/assets/brand/domain-rabab-legal-ai-mark.webp` | Cropped R mark from the latest approved RABAB LEGAL AI artwork. |
| Google Search and browser identity | `public/favicon-48.png`, `public/favicon-192.png`, `public/favicon-512.png` | Square PNG icons generated from the approved artwork. |
| iOS/browser shortcut | `public/apple-touch-icon.png` | 180×180 PNG generated from the approved artwork. |

## Domain colors

| Token | Value | Use |
|---|---:|---|
| Ink | `#071529` | Header, footer, high-contrast public sections |
| Navy | `#12335B` | Public-domain support surfaces |
| Paper | `#F6F2E9` | Editorial reading surfaces |
| Gold | `#D6A447` | Primary action and title accent |
| Blue | `#2BB9ED` | Numbering and secondary accent |

## Guardrails

The existing Hero and lawyer imagery remain unchanged. The public domain uses `home-domain.css`, whose selectors are scoped beneath `.domain-home`; new domain styles must not be added to shared global styles or shared layout components.
