# ADR-0003: Reusable transfer interface

Status: Accepted
Date: 2026-10-08

## Problem

The SDK hooks were copyable, but the demo App mixed session orchestration, financial eligibility and all display modules. Integrators could not copy the complete interface independently of the demo layout.

## Options considered

- Split JSX alone: financial guards remain tied to the demo.
- Add a global store/provider: introduces another lifecycle and dependency surface.
- Compose the existing hooks in one controller and export separate display modules.

## Decision

Use one headless controller per integration and pass it to display modules. Keep everything reusable inside `src/invisible/`, with separate headless/UI exports and scoped CSS. App owns demo configuration, layout and navigation. Keep draft input in the form and SDK protocol behavior in the existing hooks/package.

## Why

A consumer can copy one folder, use the complete widget or replace its presentation, while retaining the same command guards and authoritative status handling.

## Risks

A consumer composing individual modules must retain eligibility and review confirmation. Scoped CSS requires native nesting; dialogs/popovers/Web Locks retain their existing browser requirements. Widgets on the same origin share mutation markers.

## Follow-up

Verify the copied folder in an independent host, multiple instances, keyboard/mobile behavior and financial failure guards. Revisit dependencies only for a measured requirement.

## References

- [Integration interfaces](../../src/invisible/README.md)
- [Original integration decision](0001-copyable-public-sdk-hooks.md)
