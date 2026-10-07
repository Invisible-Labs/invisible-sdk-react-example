# ADR-0001: Copyable public SDK hooks

Status: Accepted
Date: 2026-10-07

## Problem

Consumers need a readable private-transfer example they can copy into a React frontend and deploy as static assets.

## Options considered

- Copy the complete product UI: couples consumers to unrelated product state and LP behavior.
- Implement the coordinator protocol here: duplicates the SDK's validation and security boundary.
- Thin hooks over the public SDK: leaves protocol ownership in the published package.

## Decision

Use Vite/React, one copyable integration folder and the public SDK. Use SDK persistence, authenticated sync and refresh hints. Host static assets on Cloudflare Pages. Leave wallet funding to the host wallet layer.

## Why

Consumers can replace the UI without inheriting a router, store framework, backend or private package registry.

## Risks

Browser persistence is not a secure vault. An unknown mutation outcome must not trigger another submission. Local markers and Web Locks protect cooperating tabs/reloads, not other origins or applications. Pre-delegation resume requires additional protected material beyond automatic SDK records.

## Follow-up

Revisit persistence for a product requiring an encrypted vault or pre-delegation crash recovery. Verify live coordinator and on-chain behavior independently of adapter tests.

## References

- [SDK documentation](https://docs.invisible.exchange/docs/sdk/)
- [Integration folder](../../src/invisible/README.md)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
