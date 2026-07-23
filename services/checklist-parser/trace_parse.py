#!/usr/bin/env python3
from __future__ import annotations

import pdfplumber

from parse_checklist import (
    COURSE_PATTERN,
    SKIP_LINE_PATTERN,
    STUB_SECTION_RULES,
    detect_stub_section,
    extract_courses_from_line,
    is_required_section,
    make_stub_course,
    parse_credit_requirement,
    parse_section_label_hint,
    parse_year_header,
    should_collapse_line_to_stub,
    should_treat_as_option_choice,
)


def trace(text: str) -> None:
    current_year = 1
    in_stub_section = False
    seen_codes: set[str] = set()

    for i, raw_line in enumerate(text.splitlines()):
        line = raw_line.strip()
        if not line or SKIP_LINE_PATTERN.search(line):
            continue

        year_num = parse_year_header(line)
        if year_num is not None and len(line) < 60 and not COURSE_PATTERN.search(line):
            print(f"{i} YEAR->{year_num} (was stub={in_stub_section})")
            in_stub_section = False
            current_year = year_num
            continue

        stub_match = detect_stub_section(line)
        if stub_match is not None and COURSE_PATTERN.search(line) is None:
            in_stub_section = True
            print(f"{i} STUB-SECTION {stub_match[1]} year={current_year}")
            continue

        if is_required_section(line) and COURSE_PATTERN.search(line) is None:
            in_stub_section = False
            continue

        section_label = parse_section_label_hint(line)
        if section_label is not None and COURSE_PATTERN.search(line) is None:
            if detect_stub_section(line) is None:
                in_stub_section = False
            continue

        line_courses = extract_courses_from_line(line)

        if in_stub_section:
            if current_year >= 4 and line_courses:
                print(f"{i} ABSORB-INTO-STUB year={current_year} {[c['code'] for c in line_courses]}")
            continue

        if should_collapse_line_to_stub(line, len(line_courses), in_stub_section):
            in_stub_section = True
            print(
                f"{i} COLLAPSE year={current_year} "
                f"codes={[c['code'] for c in line_courses]} line={line[:70]!r}"
            )
            continue

        for course in line_courses:
            code = course["code"]
            if should_treat_as_option_choice(code, current_year):
                in_stub_section = True
                print(f"{i} OPTION-CHOICE {code} year={current_year}")
                continue
            if code in seen_codes:
                print(f"{i} DEDUP-SKIP {code} year={current_year}")
                continue
            seen_codes.add(code)
            if current_year == 4:
                print(f"{i} ADD-Y4 {code}")


if __name__ == "__main__":
    with pdfplumber.open("samples/2023-2024-Degree-Checklist-BEng-Software-Big-Data.pdf") as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    trace(text)
