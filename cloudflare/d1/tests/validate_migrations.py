#!/usr/bin/env python3
"""Validate the Cloudflare D1 SQLite migrations without connecting to production.

Uses Python's standard-library sqlite3 module. Runs every migration twice against
an in-memory database, then checks table creation, foreign-key declarations,
foreign-key integrity, and SQLite syntax/feature compatibility.
"""
from __future__ import annotations

import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
EXPECTED_INITIAL_TABLES = 75  # 74 mirrored public tables + app_users identity map


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def migration_files() -> list[pathlib.Path]:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        fail(f"No SQL migrations found in {MIGRATIONS}")
    return files


def run_migrations(conn: sqlite3.Connection, files: list[pathlib.Path]) -> None:
    for path in files:
        sql = path.read_text(encoding="utf-8")
        try:
            conn.executescript(sql)
        except sqlite3.Error as exc:
            fail(f"{path.name} failed: {exc}")


def main() -> None:
    files = migration_files()
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    version = sqlite3.sqlite_version
    print(f"SQLite runtime: {version}")
    if sqlite3.sqlite_version_info < (3, 25, 0):
        fail("SQLite 3.25.0+ is required for the project's supported SQL features")

    run_migrations(conn, files)

    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    initial_tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    if len(initial_tables) < EXPECTED_INITIAL_TABLES:
        fail(
            f"Expected at least {EXPECTED_INITIAL_TABLES} mirrored tables; "
            f"found {len(initial_tables)} after all migrations"
        )

    # Every declared FK must point to a table that exists in the resulting schema.
    fk_count = 0
    for table in sorted(tables):
        for fk in conn.execute(f'PRAGMA foreign_key_list("{table}")'):
            fk_count += 1
            if fk[2] not in tables:
                fail(f"{table} has a foreign key to missing table {fk[2]}")

    violations = list(conn.execute("PRAGMA foreign_key_check"))
    if violations:
        fail(f"Foreign-key check returned violations: {violations[:10]}")

    # Reapplying every migration must be safe and leave the schema intact.
    before = {
        (row[0], row[1], row[2])
        for row in conn.execute(
            "SELECT type, name, tbl_name FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        )
    }
    run_migrations(conn, files)
    after = {
        (row[0], row[1], row[2])
        for row in conn.execute(
            "SELECT type, name, tbl_name FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        )
    }
    if before != after:
        fail("Rerunning migrations changed the schema objects")

    # Check D1-relevant SQLite features used by these migrations.
    conn.execute("SELECT json_valid('{""ok"":true}')").fetchone()
    conn.execute("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')").fetchone()
    conn.execute("PRAGMA integrity_check")
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        fail(f"SQLite integrity_check returned: {integrity}")

    print(f"PASS: {len(files)} migration files executed twice")
    print(f"PASS: {len(tables)} tables created; {fk_count} foreign keys declared")
    print("PASS: all foreign-key targets exist; foreign_key_check is clean")
    print("PASS: migration rerun is idempotent; SQLite integrity_check is clean")


if __name__ == "__main__":
    main()
