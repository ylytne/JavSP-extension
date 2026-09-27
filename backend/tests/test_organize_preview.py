"""Tests for scrape preview simulation API (/api/organize/preview)."""

import base64
import io
from pathlib import Path
from PIL import Image
import pytest
from starlette.testclient import TestClient

from app.config import get_config
from app.core.models import MovieInfo
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def create_test_image_b64(width: int = 800, height: int = 538) -> str:
    """生成测试用 Base64 JPEG 展开图。"""
    img = Image.new("RGB", (width, height), color="navy")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def test_preview_organize_standard(client):
    """测试标准番号元数据模拟整理与 NFO XML 生成。"""
    req_body = {
        "metadata": {
            "dvdid": "IPX-177",
            "title": "純情美少女の放課後",
            "actress": ["相沢みなみ"],
            "genre": ["美少女", "制服"],
            "score": "8.5",
            "producer": "IDEA POCKET",
            "publish_date": "2018-05-19",
            "duration": "120",
            "plot": "这是一个测试剧情介绍",
            "cover": "https://example.com/ipx177.jpg",
        },
        "base_output_dir": "D:/Videos/Organized",
        "test_filename": "ipx-177.mp4",
        "hard_sub": False,
        "uncensored": False,
        "has_sample_fanart": False,
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    assert "IPX-177" in data["base_name"]
    assert data["video_filename"] == "IPX-177.mp4"
    assert data["nfo_filename"].endswith(".nfo")
    assert "相沢みなみ" in data["rel_folder"]
    assert "D:" in data["target_dir"] or "Videos" in data["target_dir"]

    # 验证 NFO XML 内容完整性
    nfo = data["nfo_content"]
    assert "<movie>" in nfo
    assert "<title>" in nfo
    assert "IPX-177" in nfo
    assert "<plot>这是一个测试剧情介绍</plot>" in nfo
    assert "<rating>8.5</rating>" in nfo
    assert "<runtime>120</runtime>" in nfo
    assert "<studio>IDEA POCKET</studio>" in nfo
    assert "<genre>" in nfo
    assert "相沢みなみ" in nfo


def test_preview_organize_with_sub_and_uncensored_flags(client):
    """测试 -C 与 -U 属性标志在文件名与路径中的表现。"""
    req_body = {
        "metadata": {
            "dvdid": "SSIS-001",
            "title": "新入社員の研修生活",
            "actress": ["三上悠亜"],
            "genre": ["巨乳"],
        },
        "test_filename": "ssis-001.mkv",
        "hard_sub": True,
        "uncensored": True,
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    assert data["base_name"].endswith("-UC")
    assert data["video_filename"] == f"{data['base_name']}.mkv"
    assert "-UC" in data["rel_folder"]


def test_preview_organize_with_cover_cropping(client):
    """测试携带 Base64 封面时的纯内存海报裁剪与角标生成。"""
    test_b64 = create_test_image_b64(800, 538)
    req_body = {
        "metadata": {
            "dvdid": "MIDE-123",
            "title": "テストタイトル",
            "actress": ["初川みなみ"],
        },
        "cover_base64": test_b64,
        "hard_sub": True,
        "uncensored": False,
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["cropped_poster_base64"] is not None
    assert data["cropped_poster_base64"].startswith("data:image/jpeg;base64,")

    # 验证裁切后图片可被 PIL 正常解析
    raw_b64 = data["cropped_poster_base64"].split(",", 1)[1]
    img_bytes = base64.b64decode(raw_b64)
    with Image.open(io.BytesIO(img_bytes)) as poster_img:
        w, h = poster_img.size
        # 裁剪比例应接近 1.5 (2:3)
        assert h > w
        assert abs((h / w) - 1.5) < 0.1


def test_preview_organize_long_title_truncation(client):
    """测试当标题过长时自动截短且保持安全。"""
    super_long_title = "超長" * 150  # 300字
    req_body = {
        "metadata": {
            "dvdid": "MIDV-999",
            "title": super_long_title,
            "actress": ["波多野結衣"],
        },
        "base_output_dir": "D:/ShortDir",
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    truncated = data["cleaned_dict"]["title"]
    assert len(truncated) < len(super_long_title)
    assert truncated.endswith("…") or len(truncated) <= 100


def test_preview_organize_sample_fanart_and_avatar(client):
    """测试剧照采样与女优本地头像模拟。"""
    req_body = {
        "metadata": {
            "dvdid": "JUL-500",
            "title": "テスト",
            "actress": ["河北彩花", "三上悠亜"],
        },
        "has_sample_fanart": True,
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    cfg = get_config()
    if cfg.summarizer.extra_fanarts.enabled:
        assert len(data["extrafanarts_files"]) == 1
        assert data["extrafanarts_files"][0] == "extrafanart/0.jpg"

    if cfg.summarizer.actress_avatar.enabled:
        assert len(data["actor_avatar_files"]) == 2
        assert ".actors/河北彩花.jpg" in data["actor_avatar_files"]
        assert ".actors/三上悠亜.jpg" in data["actor_avatar_files"]


def test_preview_organize_genre_norm_and_actress_cleaning(client):
    """测试分类标签规范化传递闭包与女优别名清洗回传。"""
    req_body = {
        "metadata": {
            "dvdid": "IPX-177",
            "title": "テスト",
            "actress": ["  相沢みなみ  ", "相沢みなみ"],  # 重复与多余空格
            "genre": ["單體作品", "美少女"],  # 繁体应当规范化
        },
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    # 女优应去重且规范
    assert data["normalized_actresses"] == ["相沢みなみ"]
    # 分类标签应包含规范化结果
    assert len(data["genre_norm"]) >= 1
    assert "单体作品" in data["genre_norm"] or "美少女" in data["genre_norm"]


def test_preview_organize_existing_suffix_deduplication(client):
    """测试当原番号已有 -C 后缀且同时开启 -C 与 -U 时不会重复追加成 -C-UC。"""
    req_body = {
        "metadata": {
            "dvdid": "IPX-177-C",
            "title": "テスト",
        },
        "hard_sub": True,
        "uncensored": True,
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["base_name"] == "IPX-177-UC"
    assert not data["base_name"].endswith("-C-UC")


def test_preview_organize_corrupt_cover_graceful_fallback(client):
    """测试当传入破损或无效的 Base64 图片时优雅降级不抛异常。"""
    req_body = {
        "metadata": {
            "dvdid": "IPX-177",
            "title": "テスト",
        },
        "cover_base64": "data:image/jpeg;base64,not-a-valid-image-data-xyz",
    }

    response = client.post("/api/organize/preview", json=req_body)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    assert data["cropped_poster_base64"] is None


def test_nfo_naming_with_filename_matching_video(client, monkeypatch):
    """测试 NFO 命名与视频主文件完全同名（包括默认 {filename} 及自定义复杂视频名）。"""
    cfg = get_config()
    # 1. 默认设置：视频为 IPX-177.mp4，NFO 必须为 IPX-177.nfo
    monkeypatch.setattr(cfg.summarizer.nfo, "basename_pattern", "{filename}")
    monkeypatch.setattr(cfg.summarizer.path, "basename_pattern", "{num}")

    req_body = {
        "metadata": {
            "dvdid": "IPX-177",
            "title": "测试影片",
        },
        "test_filename": "sample.mkv",
    }
    resp = client.post("/api/organize/preview", json=req_body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_filename"] == "IPX-177.mkv"
    assert data["nfo_filename"] == "IPX-177.nfo"

    # 2. 自定义复杂视频名模板：如 [{num}] {title}
    monkeypatch.setattr(cfg.summarizer.path, "basename_pattern", "[{num}] {title}")
    resp2 = client.post("/api/organize/preview", json=req_body)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["video_filename"] == "[IPX-177] 测试影片.mkv"
    assert data2["nfo_filename"] == "[IPX-177] 测试影片.nfo"


def test_nfo_naming_backward_compatible_movie_and_fallback(client, monkeypatch):
    """测试兼容旧配置 'movie' 生成 movie.nfo，以及空字符串配置优雅回退为同名。"""
    cfg = get_config()

    # 1. 兼容旧配置 movie -> movie.nfo
    monkeypatch.setattr(cfg.summarizer.nfo, "basename_pattern", "movie")
    monkeypatch.setattr(cfg.summarizer.path, "basename_pattern", "{num}")

    req_body = {
        "metadata": {
            "dvdid": "SSIS-001",
            "title": "经典旧配置测试",
        },
    }
    resp = client.post("/api/organize/preview", json=req_body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_filename"] == "SSIS-001.mp4"
    assert data["nfo_filename"] == "movie.nfo"

    # 2. 空白字符串回退 -> 自动回退为与视频同名
    monkeypatch.setattr(cfg.summarizer.nfo, "basename_pattern", "  ")
    resp2 = client.post("/api/organize/preview", json=req_body)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["nfo_filename"] == "SSIS-001.nfo"

