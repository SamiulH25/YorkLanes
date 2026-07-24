"""Upload raw scrape outputs to the Supabase Storage data lake."""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import requests

from db_importer import resolve_database_url

DATA_LAKE_BUCKET = "data-lake"
SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9._-]+")


@dataclass
class DataLakeConfig:
    supabase_url: str
    service_role_key: str
    database_url: str


@dataclass
class DataLakeUploadResult:
    bucket_id: str
    object_path: str
    byte_size: int
    record_count: int | None
    catalog_id: str | None


class DataLakeError(RuntimeError):
    pass


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_api_env() -> None:
    env_path = _repo_root() / "apps" / "api" / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def resolve_data_lake_config() -> DataLakeConfig | None:
    """Return config when lake uploads are enabled, else None."""
    _load_api_env()

    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    service_role_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not service_role_key:
        return None

    return DataLakeConfig(
        supabase_url=supabase_url,
        service_role_key=service_role_key,
        database_url=resolve_database_url(),
    )


def is_data_lake_configured() -> bool:
    return resolve_data_lake_config() is not None


def sanitize_segment(value: str) -> str:
    cleaned = SAFE_SEGMENT.sub("-", (value or "").strip().lower()).strip("-")
    return cleaned or "unknown"


def build_object_path(
    dataset_kind: str,
    label: str,
    *,
    suffix: str = ".json",
    timestamp: datetime | None = None,
) -> str:
    moment = timestamp or datetime.now(timezone.utc)
    date_prefix = moment.strftime("%Y/%m/%d")
    stamp = moment.strftime("%Y%m%dT%H%M%SZ")
    kind = sanitize_segment(dataset_kind)
    name = sanitize_segment(label)
    return f"{kind}/{date_prefix}/{stamp}_{name}{suffix}"


def _infer_record_count(payload: dict[str, Any]) -> int | None:
    for key in ("sections", "courses"):
        value = payload.get(key)
        if isinstance(value, list):
            return len(value)
    return None


def upload_bytes(
    config: DataLakeConfig,
    object_path: str,
    content: bytes,
    *,
    content_type: str = "application/json",
    upsert: bool = True,
) -> None:
    url = f"{config.supabase_url}/storage/v1/object/{DATA_LAKE_BUCKET}/{object_path}"
    headers = {
        "Authorization": f"Bearer {config.service_role_key}",
        "Content-Type": content_type,
    }
    if upsert:
        headers["x-upsert"] = "true"

    response = requests.post(url, data=content, headers=headers, timeout=120)
    if response.status_code >= 400:
        raise DataLakeError(
            f"Storage upload failed ({response.status_code}) for {object_path}: {response.text[:500]}"
        )


def register_catalog_entry(
    config: DataLakeConfig,
    *,
    object_path: str,
    dataset_kind: str,
    source: str | None,
    content_type: str | None,
    byte_size: int,
    record_count: int | None,
    metadata: dict[str, Any] | None = None,
) -> str:
    conn = psycopg2.connect(config.database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO data_lake_catalog
                  (bucket_id, object_path, dataset_kind, source, content_type, byte_size, record_count, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (bucket_id, object_path) DO UPDATE SET
                  dataset_kind = EXCLUDED.dataset_kind,
                  source = EXCLUDED.source,
                  content_type = EXCLUDED.content_type,
                  byte_size = EXCLUDED.byte_size,
                  record_count = EXCLUDED.record_count,
                  metadata = EXCLUDED.metadata,
                  uploaded_at = NOW()
                RETURNING id::text
                """,
                (
                    DATA_LAKE_BUCKET,
                    object_path,
                    dataset_kind,
                    source,
                    content_type,
                    byte_size,
                    record_count,
                    json.dumps(metadata or {}),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return str(row[0]) if row else ""
    finally:
        conn.close()


def archive_json_file(
    local_path: Path,
    *,
    dataset_kind: str,
    label: str | None = None,
    source: str | None = None,
    metadata: dict[str, Any] | None = None,
    config: DataLakeConfig | None = None,
) -> DataLakeUploadResult:
    """Upload a JSON file to Storage and register it in data_lake_catalog."""
    resolved = config or resolve_data_lake_config()
    if resolved is None:
        raise DataLakeError(
            "Data lake is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.env"
        )

    path = Path(local_path)
    if not path.is_file():
        raise DataLakeError(f"File not found: {path}")

    raw = path.read_bytes()
    payload: dict[str, Any] = {}
    try:
        parsed = json.loads(raw.decode("utf-8"))
        if isinstance(parsed, dict):
            payload = parsed
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass

    object_path = build_object_path(dataset_kind, label or path.stem)
    upload_bytes(resolved, object_path, raw, content_type="application/json")

    catalog_id = register_catalog_entry(
        resolved,
        object_path=object_path,
        dataset_kind=dataset_kind,
        source=source or path.name,
        content_type="application/json",
        byte_size=len(raw),
        record_count=_infer_record_count(payload),
        metadata={
            **(metadata or {}),
            "local_path": str(path),
        },
    )

    return DataLakeUploadResult(
        bucket_id=DATA_LAKE_BUCKET,
        object_path=object_path,
        byte_size=len(raw),
        record_count=_infer_record_count(payload),
        catalog_id=catalog_id or None,
    )


def maybe_archive_json_file(
    local_path: Path,
    *,
    dataset_kind: str,
    label: str | None = None,
    source: str | None = None,
    metadata: dict[str, Any] | None = None,
    enabled: bool = True,
) -> DataLakeUploadResult | None:
    """Upload when configured; return None when skipped or not configured."""
    if not enabled:
        return None

    config = resolve_data_lake_config()
    if config is None:
        return None

    return archive_json_file(
        local_path,
        dataset_kind=dataset_kind,
        label=label,
        source=source,
        metadata=metadata,
        config=config,
    )
