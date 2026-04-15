# FurniCore Design System

This design system standardizes auth and storefront visuals using reusable tokens and primitives.

## Color Palette

- `--ds-brand` / `--ds-brand-foreground`: primary CTA and important actions
- `--ds-brand-alt`: alternate brand action (shop continuation CTA)
- `--ds-surface`: card/sheet/background surfaces
- `--ds-border`: form and card borders
- `--ds-text`, `--ds-text-muted`: primary and helper text
- `--ds-success`, `--ds-danger`: validation and status states

## Typography

- Heading: Inter, semibold (`600`)
- Body: Inter, regular (`400`)
- Helper: Inter, medium (`500`)
- Global defaults remain in `index.css`; DS utility classes add auth-focused hierarchy.

## Reusable Components

- `DsButton` (`primary` | `secondary` | `social`)
- `DsInput` (standardized focus, border, and sizing)
- `DsCard` (consistent auth/storefront panel surface)

## Spacing and Layout Rules

- Vertical section spacing: `16px` (`ds-stack-md`) or `24px` (`ds-stack-lg`)
- Form control spacing: `12px`
- Touch targets: minimum `44px` height
- Auth panel width: `max-w-[460px]`

## Usage

Prefer DS primitives on all auth and customer-facing entry pages. Keep business logic in hooks/pages and styling in DS utilities for consistency.

