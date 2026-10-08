# Transfer interface

Status: accepted. Date: 2026-10-08.

## Problem

The sequential integration demo exposed connection controls before the transfer form. A compact interface was requested, inspired by Uniswap while requiring no wallet connection. The recipient modal added an unnecessary step, and the browser select did not fit the visual style.

## Decision

Use Uniswap's dark palette, centered 480 px card, amount hierarchy and pill controls with Invisible branding. Show the destination address directly in the second card; expose only transfer, activity and supported payout windows. Use styled native radio inputs for the four SDK-supported windows in Settings. Automatically open the SDK session. Require an explicit review confirmation before creating a transfer.

The review dialog and popovers handle focus, Escape and dismissal. Native radio inputs handle keyboard selection without a custom state machine. Keep the existing copyable SDK hooks and financial safeguards.

## Alternatives and limits

Adding a UI library or reproducing trading/LP controls would add unsupported behavior. System fonts replace Uniswap's Basel typeface. Browser support for native dialogs, popovers and Web Locks is required. Recheck mobile and keyboard behavior when changing these controls.

Reference: https://app.uniswap.org/swap
