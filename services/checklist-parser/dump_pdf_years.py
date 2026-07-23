#!/usr/bin/env python3
"""Debug helper: dump year-related lines from a checklist PDF."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pdfplumber

from parse_checklist import COURSE_PATTERN, parse_year_header


def main() -> None:
    path = Path(sys.argv[1])
    with pdfplumber.open(path) as pdf:
        for page_no, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            for line in text.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                lower = stripped.lower()
                if (
                    parse_year_header(stripped) is not None
                    or "fourth" in lower
                    or "year 4" in lower
                    or "full year" in lower
                    or "full-year" in lower
                    or "eng 4000" in lower
                    or COURSE_PATTERN.search(stripped)
                ):
                    year = parse_year_header(stripped)
                    tag = f"[Y{year}]" if year else "     "
                    safe = stripped.encode("ascii", "replace").decode("ascii")
                    print(f"p{page_no:02d} {tag} {safe[:120]}")


if __name__ == "__main__":
    main()
