# Checklist Parser

Parses York University degree checklist **PDF** or **DOCX** files uploaded by the user.

## Setup

```bash
cd services/checklist-parser
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Usage

```bash
python parse_checklist.py path/to/checklist.pdf
```

Outputs JSON to stdout. Called by the Express API after file upload.

## Supported course code formats

Examples extracted from official checklists:

- `LE/EECS 1012 3.00`
- `SC/MATH 1300 3.00`
- `EECS 2001 3.00`

## Limitations

- Checklist layout varies by faculty. Test with your programme PDF.
- Scanned PDFs (image only) will not parse. Use text-based exports.
- Complex rules ("pick 6 credits from list") are not expanded. Courses listed in the file are imported; elective rules come later.

## Official checklist sources

Users are directed to faculty pages before upload. See `apps/api/src/data/faculty-checklists.ts`.
