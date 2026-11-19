#!/usr/bin/env python3
"""Validate Cloudflare D1 migrations locally using only Python's sqlite3 module.

No network access, Cloudflare credentials, or production database connection is used.
"""
from __future__ import annotations

import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
EXPECTED_INITIAL_TABLES = 75  # 74 Supabase public tables plus app_users


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def files() -> list[pathlib.Path]:
    result = sorted(MIGRATIONS.glob("*.sql"))
    if not result:
        fail(f"No SQL migrations found in {MIGRATIONS}")
    return result


def apply(conn: sqlite3.Connection, path: pathlib.Path) -> None:
    try:
        conn.executescript(path.read_text(encoding="utf-8"))
    except sqlite3.Error as exc:
        fail(f"{path.name} failed: {exc}")


def schema_objects(conn: sqlite3.Connection) -> set[tuple[str, str, str]]:
    return {
        (row[0], row[1], row[2])
        for row in conn.execute(
            "SELECT type, name, tbl_name FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        )
    }


def main() -> None:
    migrations = files()
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    print(f"SQLite runtime: {sqlite3.sqlite_version}")
    if sqlite3.sqlite_version_info < (3, 25, 0):
        fail("SQLite 3.25.0 or newer is required")

    # Validate the base schema count independently of later catalog tables.
    apply(conn, migrations[0])
    base_tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    if len(base_tables) != EXPECTED_INITIAL_TABLES:
        fail(
            f"Base migration should create {EXPECTED_INITIAL_TABLES} tables; "
            f"created {len(base_tables)}"
        )

    for path in migrations[1:]:
        apply(conn, path)

    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    fk_count = 0
    for table in sorted(tables):
        for fk in conn.execute(f'PRAGMA foreign_key_list("{table}")'):
            fk_count += 1
            if fk[2] not in tables:
                fail(f"{table} references missing table {fk[2]}")

    violations = list(conn.execute("PRAGMA foreign_key_check"))
    if violations:
        fail(f"Foreign-key check failed: {violations[:10]}")

    # Verify the operational indexes needed for signal feeds, push dispatch,
    # and order execution are present in the SQLite shadow schema.
    required_indexes = {
        "signal_records_signal_epoch_idx",
        "signal_records_symbol_idx",
        "super_signal_records_epoch_idx",
        "super_signal_records_symbol_epoch_idx",
        "push_events_pending_idx",
        "push_events_recipient_pending_idx",
        "ctrader_intents_dispatch_idx",
        "ctrader_intents_lease_idx",
        "ctrader_positions_open_idx",
        "binance_futures_orders_user_created_idx",
        "binance_futures_signal_intents_symbol_epoch_idx",
        "okx_futures_intents_pending_idx",
    }
    actual_indexes = {
        row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
        )
    }
    missing_indexes = required_indexes - actual_indexes
    if missing_indexes:
        fail(f"Required operational indexes are missing: {sorted(missing_indexes)}")

    # All migrations must be safe to replay without changing schema objects.
    before = schema_objects(conn)
    for path in migrations:
        apply(conn, path)
    if schema_objects(conn) != before:
        fail("Reapplying migrations changed the schema objects")

    # Exercise SQLite features used by the migrations.
    json_result = conn.execute("SELECT json_valid(?)", ('{"ok":true}',)).fetchone()[0]
    if json_result != 1:
        fail("SQLite JSON validation function is unavailable or returned an unexpected result")
    timestamp = conn.execute(
        "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')"
    ).fetchone()[0]
    if not timestamp:
        fail("SQLite strftime timestamp expression returned NULL")

    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        fail(f"SQLite integrity_check returned: {integrity}")

    print(f"PASS: {len(migrations)} migration files applied successfully")
    print(f"PASS: base schema contains {len(base_tables)} tables")
    print(f"PASS: {len(tables)} total tables and {fk_count} declared foreign keys")
    print("PASS: all foreign-key targets exist and foreign_key_check is clean")
    print("PASS: migrations are rerunnable; JSON, timestamp, and integrity checks pass")


if __name__ == "__main__":
    main()
