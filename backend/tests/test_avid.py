"""Tests for avid.py module."""

import pytest
from app.core.avid import get_id, get_cid, guess_av_type, detect_special_attr


def test_fc2():
    assert get_id("(2017) [FC2-123456] 【個人撮影】") == "FC2-123456"
    assert get_id("fc2-ppv-123456-1.delogo.mp4") == "FC2-123456"
    assert get_id("FC2-PPV-123456.mp4") == "FC2-123456"
    assert get_id("FC2PPV-123456 Yuukiy") == "FC2-123456"
    assert get_id("fc2-ppv_1234567-2.mp4") == "FC2-1234567"


def test_normal():
    assert get_id("Yuukiy") == ""
    assert get_id("ABC-12_01.mkv") == "ABC-12"
    assert get_id("Sky Angel Vol.6 月丘うさぎ(ABC-123).avi") == "ABC-123"
    assert get_id("ABCD-123.mp4") == "ABCD-123"
    assert get_id("IPX177.mp4") == "IPX-177"


def test_cid_valid():
    assert get_cid("ab012st") == "ab012st"
    assert get_cid("ab012st.mp4") == "ab012st"
    assert get_cid("123_0456.mp4") == "123_0456"
    assert get_cid("123abc00045.mp4") == "123abc00045"
    assert get_cid("403abcd56789_1") == "403abcd56789"
    assert get_cid("h_001abc00001.mp4") == "h_001abc00001"
    assert get_cid("1234wvr00001rp.mp4") == "1234wvr00001rp"
    assert get_cid("402abc_hello000089.mp4") == "402abc_hello000089"
    assert get_cid("h_826zizd021.mp4") == "h_826zizd021"
    assert get_cid("403abcd56789cd1.mp4") == "403abcd56789"


def test_cid_invalid():
    assert get_cid("hasUpperletter.mp4") == ""
    assert get_cid("存在非ASCII字符.mp4") == ""
    assert get_cid("has-dash.mp4") == ""
    assert get_cid("403_abcd56789_fgh") == ""
    assert get_cid("many_parts1234-12.mp4") == ""
    assert get_cid("abc12.mp4") == ""
    assert get_cid("123_0456st.mp4") == ""


def test_guess_av_type():
    assert guess_av_type("FC2-123456") == "fc2"
    assert guess_av_type("GETCHU-1234") == "getchu"
    assert guess_av_type("GYUTTO-5678") == "gyutto"
    assert guess_av_type("ab012st") == "cid"
    assert guess_av_type("IPX-177") == "normal"


def test_detect_special_attr():
    assert "C" in detect_special_attr("IPX-177-C.mp4", "IPX-177")
    assert "U" in detect_special_attr("IPX-177-U.mp4", "IPX-177")
    assert "UC" == detect_special_attr("IPX-177-UC.mp4", "IPX-177")
    assert "U" in detect_special_attr("IPX-177 无码破解.mp4", "IPX-177")


def test_heydouga_and_nested_parent():
    assert get_id("hey-4030-2016_hd.mp4") == "HEYDOUGA-4030-2016"
    assert get_id("ABC-123/CD1/video.mp4") == "ABC-123"
    assert get_id("FC2-123456/Sub/Disc1/movie.mkv") == "FC2-123456"


def test_parent_boundary_and_leak_prevention():
    # If intermediate folder is not a disc/sub folder, do not climb up to ancestors
    assert get_id("ABC-123/unrec/random_video.mp4") == ""
    assert get_id("FC2-123456/other_folder/video.mp4") == ""
    # With stop_dir: files directly in stop_dir must not adopt stop_dir's name as DVD ID
    assert get_id("ABC-123/CD1/video.mp4", stop_dir="ABC-123/CD1") == ""
    assert get_id("ABC-123/video.mp4", stop_dir="ABC-123") == ""
    # Valid movie subfolder inside stop_dir should still be recognized
    assert get_id("ROOT-DIR/ABC-123/video.mp4", stop_dir="ROOT-DIR") == "ABC-123"
    assert get_id("ROOT-DIR/ABC-123/CD1/video.mp4", stop_dir="ROOT-DIR") == "ABC-123"



def test_models_censor_representation():
    from app.core.models import MovieInfo
    m1 = MovieInfo(dvdid="IPX-177", title="T", cover="C", uncensored=True)
    assert m1.get_info_dict()["censor"] == "无码"

    m2 = MovieInfo(dvdid="IPX-177", title="T", cover="C", uncensored=False)
    assert m2.get_info_dict()["censor"] == "有码"

    m3 = MovieInfo(dvdid="IPX-177", title="T", cover="C", uncensored=None)
    assert m3.get_info_dict()["censor"] == "打码情况未知"
