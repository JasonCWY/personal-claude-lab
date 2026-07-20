import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.backend.services.translator import detect_lang


def test_detect_lang_english():
    assert detect_lang("serendipity") == "en"
    assert detect_lang("a fleeting glimpse") == "en"


def test_detect_lang_chinese():
    assert detect_lang("邂逅") == "zh"
    assert detect_lang("这是一句话") == "zh"


def test_detect_lang_mixed_defaults_to_chinese():
    # Any CJK character present tips detection to Chinese
    assert detect_lang("hello 你好") == "zh"
