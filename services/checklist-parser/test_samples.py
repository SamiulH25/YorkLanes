"""Run parser against all files in samples/."""
from __future__ import annotations

import json
from pathlib import Path

from parse_checklist import parse_file

SAMPLES = Path(__file__).parent / "samples"


def main() -> None:
    files = sorted(SAMPLES.glob("*.pdf")) + sorted(SAMPLES.glob("*.docx"))
    if not files:
        print("No sample files in samples/. Add PDF or DOCX checklists to test.")
        return

    for path in files:
        result = parse_file(path)
        total = sum(len(y["courses"]) for y in result["years"])
        print(f"\n{path.name}")
        print(f"  programme: {result.get('programme_hint')}")
        print(f"  courses:   {total}")
        for year in result["years"]:
            if year["courses"]:
                print(f"  year {year['year']}: {len(year['courses'])} courses")
        if result.get("warnings"):
            print(f"  warnings:  {result['warnings']}")
        if total <= 3:
            print("  sample:", json.dumps(result["years"][:1], indent=2)[:500])


if __name__ == "__main__":
    main()
