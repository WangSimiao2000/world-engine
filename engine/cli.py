"""World Engine CLI — worldengine command."""

from __future__ import annotations

import argparse
import json
import sys

from engine.loader import load_world


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="worldengine",
        description="World Engine — epic worldbuilding as code",
    )
    sub = parser.add_subparsers(dest="command")

    val = sub.add_parser("validate", help="Validate world data")
    val.add_argument("--schema", action="store_true", help="Schema validation only")
    val.add_argument("--rules", action="store_true", help="Rule validation only")
    val.add_argument("--world-root", default="world", help="Path to world data root")

    ai = sub.add_parser("ai-review", help="Run AI semantic review")
    ai.add_argument("files", nargs="*", help="Files to review")
    ai.add_argument("--changed-only", action="store_true")
    ai.add_argument("--output", choices=["text", "json"], default="text")
    ai.add_argument("--world-root", default="world")

    exp = sub.add_parser("export-schema", help="Export JSON schemas")
    exp.add_argument("--output-dir", default="schemas/generated")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 0

    if args.command == "validate":
        return _cmd_validate(args)
    elif args.command == "ai-review":
        return _cmd_ai_review(args)
    elif args.command == "export-schema":
        return _cmd_export_schema(args)
    return 0


def _cmd_validate(args) -> int:
    world, schema_errors = load_world(args.world_root)

    has_hard = False
    has_warn = False

    # Schema validation
    if args.schema or not args.rules:
        if schema_errors:
            for e in schema_errors:
                print(f"  SCHEMA  {e}")
            has_hard = True
        if args.schema:
            if has_hard:
                print(f"\n✗ {len(schema_errors)} schema error(s).")
                return 1
            print("✓ Schema validation passed.")
            return 0

    # Rule validation
    if args.rules or not args.schema:
        if world:
            from engine.rules import run_all_rules

            violations = run_all_rules(world)
            for v in violations:
                tag = "  HARD " if v.severity == "hard" else "  WARN "
                loc = f" ({v.file})" if v.file else ""
                print(f"{tag} [{v.rule}] {v.message}{loc}")
            hard = [v for v in violations if v.severity == "hard"]
            warn = [v for v in violations if v.severity == "warn"]
            if hard:
                has_hard = True
            if warn:
                has_warn = True

            if args.rules:
                if has_hard:
                    print(f"\n✗ {len(hard)} hard error(s), {len(warn)} warning(s).")
                    return 1
                if has_warn:
                    print(f"\n⚠ {len(warn)} warning(s).")
                    return 2
                print("✓ Rule validation passed.")
                return 0

    # Combined summary
    if has_hard:
        print("\n✗ Validation failed.")
        return 1
    if has_warn:
        print("\n⚠ Validation passed with warnings.")
        return 2
    entity_count = len(world.entities) if world else 0
    rel_count = len(world.relations) if world else 0
    meta_count = len(world.meta_annotations) if world else 0
    print(f"\n✓ All validations passed. ({entity_count} entities, {rel_count} relations, {meta_count} meta annotations)")
    return 0


def _cmd_ai_review(args) -> int:
    import os

    if not os.environ.get("OPENAI_API_KEY"):
        print("AI review requires OPENAI_API_KEY. Skipping.")
        return 0

    world, schema_errors = load_world(args.world_root)
    if schema_errors or not world:
        print("Fix schema errors before running AI review.")
        return 1

    from engine.ai.reviewer import review_files

    files = args.files or []
    results = review_files(world, files, changed_only=args.changed_only)

    if args.output == "json":
        print(json.dumps([r.model_dump() for r in results], indent=2, ensure_ascii=False))
    else:
        for r in results:
            print(f"\n--- {r.file} ---")
            for c in r.checks:
                icon = "✓" if c.passed else "✗" if c.severity == "error" else "⚠"
                print(f"  {icon} [{c.check}] {c.message}")
                if c.suggestion:
                    print(f"    → {c.suggestion}")
    return 0


def _cmd_export_schema(args) -> int:
    from engine.schema_export import export_schemas

    export_schemas(args.output_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
