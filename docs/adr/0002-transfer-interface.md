# Transfer interface

Status: accepted. Date: 2026-10-08.

## Problem

The sequential integration demo exposed connection controls before the transfer form. A compact interface was requested, closely following Uniswap while requiring no wallet connection.

## Decision

Use Uniswap's dark palette, centered 480 px card, amount hierarchy and pill controls with Invisible branding. Map the second token selector to a Solana recipient dialog; expose only transfer, activity and supported payout windows. Automatically open the SDK session. Require an explicit review confirmation before creating a transfer.

Native dialogs and popovers handle focus, Escape and dismissal. Keep the existing copyable SDK hooks and financial safeguards.

## Alternatives and limits

Adding a UI library or reproducing trading/LP controls would add unsupported behavior. System fonts replace Uniswap's Basel typeface. Browser support for native dialogs, popovers and Web Locks is required. Recheck mobile and keyboard behavior when changing these controls.

Reference: https://app.uniswap.org/swap
