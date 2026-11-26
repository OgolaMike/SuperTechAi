# Deprecated proposal — do not use for the independent platform

> **Superseded on 2026-11-25.** This document describes an earlier dual-provider proposal in which Supabase remained primary. That architecture is rejected for the independent SuperTech AI deployment. It is retained only as historical context; do not implement its dual-write, shadow-sync, fallback, or Supabase-primary instructions.

The independent deployment must use Appwrite for identity, application data, permissions, and file storage, with Cloudflare Pages/Workers for hosting and secured backend services. It must not call Supabase Auth, PostgREST, Storage, Realtime, Edge Functions, or any Supabase-hosted endpoint.

The existing Bolt/Supabase deployment is a separate product instance and must remain untouched. Reusing its source code or business rules is allowed only after removing provider dependencies from the independent build.

See [APPWRITE_ZERO_SUPABASE_CONTRACT.md](./APPWRITE_ZERO_SUPABASE_CONTRACT.md) for the binding architecture and migration sequence.
