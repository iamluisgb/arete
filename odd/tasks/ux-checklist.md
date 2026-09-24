# Feature: UX checklist implementation (mejoras_ux.md)

Goal: implement every item of the UX/UI audit checklist (`mejoras_ux.md`) — 17 items across
dashboard, onboarding, Quirón errors, training friction, sync diagnostics visibility,
accessibility, and copy polish — then review, PR, merge, and deploy.

## Tasks

- [x] U1: cheap polish — toast aria-live (UX-3), PR celebration focus (UX-4), missing
      accents in copy (UX-13), Quirón silent localStorage failure toast (UX-16).
- [x] U2: Hoy + onboarding — limiter line + CTA in dashLevel (UX-1), first-run starter
      card sequence (UX-2), CTA on empty dashboard activity (UX-12).
- [x] U3: critical flows — human-readable Quirón errors by class (UX-5), inline set input
      feedback on blur (UX-6), draft discard explanation toast (UX-7).
- [x] U4: visibility & a11y — sync diagnostic row in backup settings (UX-8), browser GPS
      explanation line (UX-9), non-color HR zone marker (UX-10), sr-only radar table (UX-11).
- [x] U5: remaining P2 — documented decisions, no code needed:
  - UX-15 (fs-2xs 11px): VERIFIED INTENTIONAL — app.css section 1.4 declares
    the 11px floor deliberately ("se lee con el movil en el suelo, sudado y
    entre series") and the >=1024px media query already bumps the scale.
    Changing it would contradict DESIGN_SYSTEM.md. No change.
  - UX-14 (skeletons): measure first — local synchronous renders; no data.
  - UX-17 (SW save warnings): evaluate only — the draft already persists the
    session; adding notification plumbing for an edge case is not justified.
- [x] Full suite green (717/717).
- [ ] Native RDD review, PR, merge, deploy.

## Evidence

23f802f — U1 (657/657)
(more per unit)
U2 commit pending — see next

## Close (2026-09-24)
- Native review: lineage `review-835719973a49fc71`, risk medium, APPROVED with one
  lens captured (review-reliability, 4 WARNINGs: quiron classifier order, toast
  import, repeat mismatch toast, GPS probe) — authority burned (ack consumed
  revision `sha256:3e7dc873…`).
- PR #5 merged (`721dcfe`), deployed via deploy:pages — build.json confirms
  `721dcfe00e11752160deff40254de1032d0a8935`, sw v147.
- Known risk: one order-dependent flake seen twice in cold first runs of the full
  suite (draft mismatch toast case); 6 consecutive green runs after hardening.
