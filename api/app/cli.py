"""命令行工具

  python -m app.cli import-catalog path/to/delica-11-0.csv   导入已核实色卡到数据库（之后设置 CATALOG_SOURCE=db）
  python -m app.cli validate-catalog path/to/file.csv        只校验，不写入

CSV 表头：code,name,nameZh,nameJa,hex,finish,discontinued,packBeads,gramsPerPack,beadsPerGram,vendor
code 必须是来自官方色卡或授权商家数据的 MIYUKI 官方色号，禁止估填。
"""
from __future__ import annotations

import argparse
import csv
import re
import sys

from .engines.catalog import BeadColor, validate_catalog


def _float(v: str | None) -> float | None:
    v = (v or "").strip()
    return float(v) if v else None


def _int(v: str | None) -> int | None:
    v = (v or "").strip()
    return int(v) if v else None


def read_csv(path: str) -> list[tuple[BeadColor, dict]]:
    out = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for i, row in enumerate(csv.DictReader(f)):
            code = row["code"].strip()
            color = BeadColor(
                id=re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-") or f"row-{i}",
                code=code,
                name=row["name"].strip(),
                name_zh=(row.get("nameZh") or row["name"]).strip(),
                name_ja=(row.get("nameJa") or "").strip() or None,
                hex=row["hex"].strip().upper(),
                finish=(row.get("finish") or "opaque").strip(),
                discontinued=(row.get("discontinued") or "").strip().lower() in ("1", "true", "yes"),
                verified=True,
                pack_beads=_int(row.get("packBeads")),
                grams_per_pack=_float(row.get("gramsPerPack")),
                beads_per_gram=_float(row.get("beadsPerGram")),
            )
            out.append((color, {"vendor": (row.get("vendor") or "").strip() or None, "sort_order": i}))
    return out


def import_catalog(path: str, dry_run: bool) -> int:
    rows = read_csv(path)
    issues = validate_catalog([c for c, _ in rows])
    for x in issues:
        print(f"[warn] {x.id}: {x.problem}")
    if dry_run:
        print(f"校验完成：{len(rows)} 个色号，{len(issues)} 个问题")
        return 1 if issues else 0

    from .db import Base, SessionLocal, engine
    from .models import BeadCatalogRow

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for c, extra in rows:
            db.merge(
                BeadCatalogRow(
                    id=c.id, code=c.code, name=c.name, name_zh=c.name_zh, name_ja=c.name_ja, hex=c.hex, finish=c.finish,
                    discontinued=c.discontinued, pack_beads=c.pack_beads, grams_per_pack=c.grams_per_pack,
                    beads_per_gram=c.beads_per_gram, verified=True, **extra,
                )
            )
        db.commit()
    print(f"已导入 {len(rows)} 个色号。设置 CATALOG_SOURCE=db 后重启服务生效。")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("import-catalog", "validate-catalog"):
        sp = sub.add_parser(name)
        sp.add_argument("csv")
    args = ap.parse_args(argv)
    return import_catalog(args.csv, dry_run=args.cmd == "validate-catalog")


if __name__ == "__main__":
    sys.exit(main())
