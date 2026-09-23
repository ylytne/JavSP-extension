"""海报批量重裁剪功能测试。"""

from pathlib import Path
from PIL import Image
import pytest
from starlette.testclient import TestClient

from app.core.poster_recropper import (
    derive_poster_path,
    backup_file,
    recrop_directory_posters,
)
from app.main import app


def test_derive_poster_path():
    """测试各种命名前缀与风格的 poster 文件名推导。"""
    assert derive_poster_path(Path("/movies/fanart.jpg")) == Path("/movies/poster.jpg")
    assert derive_poster_path(Path("/movies/Fanart.jpg")) == Path("/movies/Poster.jpg")
    assert derive_poster_path(Path("/movies/FANART.PNG")) == Path("/movies/POSTER.PNG")
    assert derive_poster_path(Path("/movies/IPX-111-fanart.jpg")) == Path("/movies/IPX-111-poster.jpg")
    assert derive_poster_path(Path("/movies/ABP_001_fanart.webp")) == Path("/movies/ABP_001_poster.webp")
    # 不含 fanart 时拼接
    assert derive_poster_path(Path("/movies/cover.jpg")) == Path("/movies/cover-poster.jpg")


def test_backup_file(tmp_path: Path):
    """测试原海报文件备份与递增命名逻辑。"""
    target = tmp_path / "poster.jpg"
    target.write_text("dummy original poster", encoding="utf-8")

    # 首次备份生成 .bak
    bak1 = backup_file(target)
    assert bak1.exists()
    assert bak1.name == "poster.jpg.bak"
    assert bak1.read_text(encoding="utf-8") == "dummy original poster"

    # 再次备份生成 .bak.1
    bak2 = backup_file(target)
    assert bak2.exists()
    assert bak2.name == "poster.jpg.bak.1"

    # 第三次备份生成 .bak.2
    bak3 = backup_file(target)
    assert bak3.exists()
    assert bak3.name == "poster.jpg.bak.2"


def test_recrop_directory_posters_and_dry_run(tmp_path: Path):
    """测试批量重裁剪、Dry Run 预检与比例过滤。"""
    # 1. 构造标准 800x538 图片
    std_fanart = tmp_path / "IPX-111-fanart.jpg"
    Image.new("RGB", (800, 538), color="blue").save(std_fanart, format="JPEG")

    # 2. 构造非标准 800x600 图片
    non_std_fanart = tmp_path / "FC2-999-fanart.jpg"
    Image.new("RGB", (800, 600), color="green").save(non_std_fanart, format="JPEG")

    # 3. 构造已存在的旧 poster
    old_poster = tmp_path / "IPX-111-poster.jpg"
    old_poster.write_bytes(b"old poster content")

    # 先执行 dry_run
    summary_dry = recrop_directory_posters(
        dir_path=tmp_path,
        recursive=False,
        dry_run=True,
        backup=True,
        only_standard_fanza=True,
    )
    assert summary_dry.scanned_files == 2
    assert summary_dry.matched_files == 1
    assert summary_dry.skipped_files == 1
    assert summary_dry.cropped_files == 0  # dry_run 不实际裁剪写入
    # 旧 poster 未被备份覆盖
    assert old_poster.read_bytes() == b"old poster content"

    # 正式执行
    summary_run = recrop_directory_posters(
        dir_path=tmp_path,
        recursive=False,
        dry_run=False,
        backup=True,
        only_standard_fanza=True,
    )
    assert summary_run.scanned_files == 2
    assert summary_run.matched_files == 1
    assert summary_run.skipped_files == 1
    assert summary_run.cropped_files == 1
    assert summary_run.backed_up_files == 1

    # 验证旧 poster 已备份，新 poster 已生成且尺寸符合 2:3 (358x538)
    bak_file = tmp_path / "IPX-111-poster.jpg.bak"
    assert bak_file.exists()
    assert bak_file.read_bytes() == b"old poster content"

    with Image.open(old_poster) as new_img:
        assert new_img.size == (358, 538)


def test_recrop_posters_api(tmp_path: Path):
    """测试 REST API 端点 /api/tools/recrop-posters。"""
    fanart_path = tmp_path / "fanart.jpg"
    Image.new("RGB", (800, 538), color="red").save(fanart_path, format="JPEG")

    client = TestClient(app)
    resp = client.post(
        "/api/tools/recrop-posters",
        json={
            "directory": str(tmp_path),
            "recursive": True,
            "dry_run": False,
            "backup": True,
            "only_standard_fanza": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["scanned_files"] == 1
    assert data["cropped_files"] == 1
    assert (tmp_path / "poster.jpg").exists()
