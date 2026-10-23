"""API 集成测试（需要 requirements-dev.txt：pytest、httpx）"""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

EXAMPLE = "我想做一个绿色的 MIYUKI 串珠项链，日系极简风格，有植物元素，适合夏天佩戴，制作难度不要太高。"
H = {"X-User-Id": "alice"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_and_catalog(client):
    assert client.get("/health").json()["status"] == "ok"
    cat = client.get("/api/v1/catalog").json()
    assert cat["verified"] is False and len(cat["colors"]) > 0
    assert len(client.get("/api/v1/catalog/s15/alternatives").json()) == 3


def test_ai_flow_to_project_and_exports(client):
    brief = client.post("/api/v1/ai/parse", json={"prompt": EXAMPLE}).json()
    assert brief["itemType"] == "necklace" and brief["difficulty"] == "beginner"

    task = client.post("/api/v1/ai/ideas", json={"prompt": EXAMPLE, "count": 4}, headers=H).json()
    assert task["status"] == "succeeded", task
    ideas = task["result"]["ideas"]
    assert len(ideas) == 4 and ideas[0]["name"] == "Matcha Garden"
    assert client.get(f"/api/v1/tasks/{task['id']}", headers=H).status_code == 200
    assert client.get(f"/api/v1/tasks/{task['id']}", headers={"X-User-Id": "bob"}).status_code == 404

    v = client.post(f"/api/v1/ai/ideas/{ideas[0]['id']}/refine", json={"instruction": "改成手链"}, headers=H).json()
    assert v["idea"]["itemType"] == "bracelet"

    p = client.post("/api/v1/projects/from-idea", json={"ideaId": ideas[0]["id"], "variantId": v["id"]}, headers=H).json()
    assert p["itemType"] == "bracelet" and p["pattern"]["width"] == 12 and p["pattern"]["height"] == 60
    pid = p["id"]

    m = client.get(f"/api/v1/projects/{pid}/materials", headers=H).json()
    assert sum(l["required"] for l in m["lines"]) == 720
    assert all(l["purchaseNeeded"] == l["required"] + l["reserve"] for l in m["lines"])

    # 修改一颗珠子 → 材料立即同步
    pat = p["pattern"]
    cells = list(pat["cells"])
    old = cells[0]
    cells[0] = "s12" if old != "s12" else "s01"
    r = client.put(f"/api/v1/projects/{pid}/pattern", json={"width": 12, "height": 60, "cells": cells, "baseRevision": pat["revision"]}, headers=H)
    assert r.status_code == 200
    m2 = {l["colorId"]: l["required"] for l in client.get(f"/api/v1/projects/{pid}/materials", headers=H).json()["lines"]}
    m1 = {l["colorId"]: l["required"] for l in m["lines"]}
    assert m2.get(old, 0) == m1[old] - 1

    # 过期 revision → 409
    assert client.put(f"/api/v1/projects/{pid}/pattern", json={"width": 12, "height": 60, "cells": cells, "baseRevision": 1}, headers=H).status_code == 409
    # 不在色卡中的色号 → 422
    bad = ["fake"] * 720
    assert client.put(f"/api/v1/projects/{pid}/pattern", json={"width": 12, "height": 60, "cells": bad}, headers=H).status_code == 422

    le = client.post(f"/api/v1/projects/{pid}/pattern/local-edit", json={"rect": {"x": 0, "y": 0, "w": 12, "h": 10}, "instruction": "改成金色"}, headers=H)
    assert le.status_code == 200 and "金色" in le.json()["summary"]

    assert client.post(f"/api/v1/projects/{pid}/versions", json={"note": "v2"}, headers=H).status_code == 201
    assert len(client.get(f"/api/v1/projects/{pid}/versions", headers=H).json()) == 2
    assert client.post(f"/api/v1/projects/{pid}/versions/1/restore", headers=H).status_code == 200

    sl = client.patch(f"/api/v1/projects/{pid}/shopping-list", json={"toggle": {"kind": "outOfStock", "itemId": m["lines"][0]["colorId"], "value": True}}, headers=H).json()
    assert sl["lines"][0]["outOfStock"] and len(sl["lines"][0]["alternatives"]) == 2

    for fmt, magic in (("png", b"\x89PNG"), ("svg", b"<svg"), ("pdf", b"%PDF"), ("csv", "﻿".encode()), ("xlsx", b"PK"), ("json", b"{")):
        r = client.get(f"/api/v1/projects/{pid}/export/{fmt}", headers=H)
        assert r.status_code == 200 and r.content.startswith(magic), fmt
    assert client.get(f"/api/v1/projects/{pid}", headers=H).json()["status"] == "exported"

    merged = client.post("/api/v1/shopping-lists/merge", json={"projectIds": [pid, pid]}, headers=H).json()
    assert merged["totalBeads"] == 720


def test_image_upload_and_convert(client):
    img = Image.new("RGB", (200, 200), (250, 249, 246))
    img.paste((229, 154, 174), (50, 50, 150, 150))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    up = client.post("/api/v1/images", files={"file": ("flower.png", buf.getvalue(), "image/png")}, headers=H)
    assert up.status_code == 201, up.text
    asset = up.json()
    t = client.post(
        f"/api/v1/images/{asset['id']}/convert",
        json={"cols": 20, "maxColors": 4, "mode": "pixel", "prep": {"removeBackground": True}, "createProject": {"name": "测试花", "itemType": "brooch"}},
        headers=H,
    ).json()
    assert t["status"] == "succeeded", t
    res = t["result"]
    assert res["width"] == 20 and len(res["cells"]) == res["width"] * res["height"] and res["colorCount"] <= 4
    assert client.get(f"/api/v1/projects/{res['projectId']}", headers=H).status_code == 200

    bad = client.post("/api/v1/images", files={"file": ("x.png", b"not an image", "image/png")}, headers=H)
    assert bad.status_code == 415


def test_isolation_between_users(client):
    p = client.post("/api/v1/projects", json={"name": "x", "itemType": "brooch", "creationMode": "image", "width": 2, "height": 1, "cells": ["s01", "s02"]}, headers=H).json()
    assert client.get(f"/api/v1/projects/{p['id']}", headers={"X-User-Id": "bob"}).status_code == 404
    assert client.post("/api/v1/projects", json={"name": "x", "itemType": "brooch", "creationMode": "image", "width": 2, "height": 2, "cells": ["s01"]}, headers=H).status_code == 422
    assert client.delete(f"/api/v1/projects/{p['id']}", headers=H).status_code == 204


def test_necklace_strand_flow(client):
    task = client.post("/api/v1/ai/ideas", json={"prompt": EXAMPLE, "count": 4}, headers=H).json()
    idea = task["result"]["ideas"][0]
    assert idea["itemType"] == "necklace" and all(not c.startswith("#") for c in idea["strandSequence"])

    p = client.post("/api/v1/projects/from-idea", json={"ideaId": idea["id"]}, headers=H).json()
    pat, pid = p["pattern"], p["id"]
    assert pat["strand"] == {"sequence": idea["strandSequence"], "lengthCm": 40}
    assert (pat["width"], pat["height"]) == (20, 24) and pat["validationErrors"] == []

    # 材料 = 吊坠方格 + 串链 308 颗；配件含串链用线
    m = client.get(f"/api/v1/projects/{pid}/materials", headers=H).json()
    assert m["totalBeads"] == 20 * 24 + 308
    assert any(a["id"] == "strand-thread" for a in m["accessories"])

    # PUT 不传 strand 时保留，改长度后用量随之变化
    put = {"width": pat["width"], "height": pat["height"], "cells": pat["cells"]}
    assert client.put(f"/api/v1/projects/{pid}/pattern", json=put, headers=H).json()["strand"]["lengthCm"] == 40
    r = client.put(f"/api/v1/projects/{pid}/pattern", json=put | {"strand": {"sequence": ["s01", "s14"], "lengthCm": 13}}, headers=H)
    assert r.json()["strand"] == {"sequence": ["s01", "s14"], "lengthCm": 13}
    assert client.get(f"/api/v1/projects/{pid}/materials", headers=H).json()["totalBeads"] == 20 * 24 + 100
    bad = client.put(f"/api/v1/projects/{pid}/pattern", json=put | {"strand": {"sequence": ["nope"], "lengthCm": 40}}, headers=H)
    assert bad.status_code == 422

    # 版本快照包含串链；删除串链后恢复版本可找回
    assert client.post(f"/api/v1/projects/{pid}/versions", json={"note": "v2"}, headers=H).json()["strand"]["lengthCm"] == 13
    assert client.put(f"/api/v1/projects/{pid}/pattern", json=put | {"strand": None}, headers=H).json()["strand"] is None
    assert client.post(f"/api/v1/projects/{pid}/versions/2/restore", headers=H).json()["strand"]["lengthCm"] == 13

    pdf = client.get(f"/api/v1/projects/{pid}/export/pdf", headers=H)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    csv = client.get(f"/api/v1/projects/{pid}/export/csv", headers=H).content.decode("utf-8-sig")
    assert "串链用线" in csv
