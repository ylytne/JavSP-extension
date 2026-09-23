import { describe, it, expect } from "vitest";
import {
  buildDvdidMatcher,
  isExactDvdidMatch,
  countHanzi,
  isChineseText,
  cleanDvdidPrefix,
  normalizeDvdid,
  detectTextLanguage,
} from "../dvdid";

describe("dvdid utility", () => {
  describe("normalizeDvdid", () => {
    it("should strip dashes, underscores, spaces and convert to uppercase", () => {
      expect(normalizeDvdid("ipx-177")).toBe("IPX177");
      expect(normalizeDvdid("fc2_ppv 123456")).toBe("FC2PPV123456");
      expect(normalizeDvdid("")).toBe("");
    });
  });

  describe("isExactDvdidMatch & buildDvdidMatcher", () => {
    it("should match standard dvdid with dash, underscore, space, or no delimiter", () => {
      expect(isExactDvdidMatch("IPX-100", "IPX-100 纯情女友")).toBe(true);
      expect(isExactDvdidMatch("IPX-100", "IPX100 纯情女友")).toBe(true);
      expect(isExactDvdidMatch("IPX-100", "IPX_100 纯情女友")).toBe(true);
      expect(isExactDvdidMatch("IPX-100", "IPX 100 纯情女友")).toBe(true);
      expect(isExactDvdidMatch("IPX-100", "[IPX-100] 纯情女友")).toBe(true);
      expect(isExactDvdidMatch("IPX-100", "【IPX-100】 纯情女友")).toBe(true);
      expect(isExactDvdidMatch("IPX-100", "IPX-100-CD1")).toBe(true);
    });

    it("should reject prefix-matching edge cases (e.g. IPX-100 vs IPX-1001)", () => {
      expect(isExactDvdidMatch("IPX-100", "IPX-1001 混淆影片")).toBe(false);
      expect(isExactDvdidMatch("IPX-100", "IPX1001 混淆影片")).toBe(false);
      expect(isExactDvdidMatch("IPX-100", "IPX-1000 混淆影片")).toBe(false);
      expect(isExactDvdidMatch("IPX-100", "TIPX-100 前缀粘连")).toBe(false);
      expect(isExactDvdidMatch("IPX-100", "AIPX-100")).toBe(false);
      expect(isExactDvdidMatch("IPX-100", "IPX-10")).toBe(false);
    });

    it("should handle leading zeros properly (SOE-1 vs SOE-10 vs SOE-001)", () => {
      expect(isExactDvdidMatch("SOE-1", "SOE-1 标题")).toBe(true);
      expect(isExactDvdidMatch("SOE-1", "SOE-01 标题")).toBe(true);
      expect(isExactDvdidMatch("SOE-1", "SOE-001 标题")).toBe(true);
      expect(isExactDvdidMatch("SOE-001", "SOE-1 标题")).toBe(true);

      // 绝不能误匹配 10 或 100
      expect(isExactDvdidMatch("SOE-1", "SOE-10 标题")).toBe(false);
      expect(isExactDvdidMatch("SOE-1", "SOE-100 标题")).toBe(false);
      expect(isExactDvdidMatch("SOE-1", "SOE-11 标题")).toBe(false);
    });

    it("should support FC2 and FC2-PPV variants while rejecting extra digits", () => {
      expect(isExactDvdidMatch("FC2-PPV-123456", "FC2-PPV-123456 素人妹子")).toBe(true);
      expect(isExactDvdidMatch("FC2-PPV-123456", "FC2-123456 素人妹子")).toBe(true);
      expect(isExactDvdidMatch("FC2-123456", "FC2-PPV-123456 素人妹子")).toBe(true);

      // 多位数字绝不误匹配
      expect(isExactDvdidMatch("FC2-PPV-123456", "FC2-PPV-1234567 错误番号")).toBe(false);
      expect(isExactDvdidMatch("FC2-PPV-123456", "FC2-PPV-12345 少一位")).toBe(false);
    });

    it("should support date-based uncensored IDs", () => {
      expect(isExactDvdidMatch("012717-472", "012717-472 一本道")).toBe(true);
      expect(isExactDvdidMatch("012717-472", "1pondo_012717_472 一本道")).toBe(true);
      expect(isExactDvdidMatch("012717-472", "012717-4720 错误番号")).toBe(false);
      expect(isExactDvdidMatch("012717-472", "012717-47 少一位")).toBe(false);
    });
  });

  describe("countHanzi", () => {
    it("should count CJK Hanzi characters correctly", () => {
      expect(countHanzi("SNOS-168 最初也是最後的極限挑戰。")).toBe(11);
      expect(countHanzi("SNOS-168")).toBe(0);
      expect(countHanzi("IPX-177 女優 相沢みなみ")).toBe(4); // 女, 優, 相, 沢
      expect(countHanzi("")).toBe(0);
    });
  });

  describe("isChineseText", () => {
    it("should return true for Chinese text without Hiragana", () => {
      expect(isChineseText("最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 河北彩伽")).toBe(true);
      expect(isChineseText("相澤南")).toBe(true);
      expect(isChineseText("迷你裙與過膝襪間的絕對領域！")).toBe(true);
    });

    it("should return false for Japanese text containing Hiragana", () => {
      expect(isChineseText("最初で最後の限界突破。2ヶ月の禁欲が生んだ潜在的覚醒SEX 河北彩伽")).toBe(
        false
      ); // 包含 で, の, が, んだ
      expect(isChineseText("プレステージ専属『瀬名 きらり』があなたの妄想を実現させます！")).toBe(
        false
      );
    });

    it("should return false for pure alphanumeric or empty strings", () => {
      expect(isChineseText("SNOS-168")).toBe(false);
      expect(isChineseText("")).toBe(false);
    });
  });

  describe("cleanDvdidPrefix", () => {
    it("should strip dvdid prefix cleanly", () => {
      expect(cleanDvdidPrefix("SNOS-168 最初也是最後的極限挑戰", "SNOS-168")).toBe(
        "最初也是最後的極限挑戰"
      );
      expect(cleanDvdidPrefix("[IPX-177] 妹妹的秘密", "IPX-177")).toBe("妹妹的秘密");
      expect(cleanDvdidPrefix("【FC2-PPV-123456】 素人美少女", "FC2-PPV-123456")).toBe("素人美少女");
      expect(cleanDvdidPrefix("IPX100纯情女友", "IPX-100")).toBe("纯情女友");
      expect(cleanDvdidPrefix("IPX-100", "IPX-100")).toBe("");
    });
  });

  describe("detectTextLanguage", () => {
    it("should classify invalid text", () => {
      expect(detectTextLanguage("")).toBe("invalid");
      expect(detectTextLanguage("   ")).toBe("invalid");
      expect(detectTextLanguage("a")).toBe("invalid");
      expect(detectTextLanguage("1")).toBe("invalid");
      expect(detectTextLanguage("...")).toBe("invalid");
      expect(detectTextLanguage("!@#$%^&*")).toBe("invalid");
      expect(detectTextLanguage("--- \t\n ---")).toBe("invalid");
    });

    it("should classify pure numeric titles", () => {
      expect(detectTextLanguage("42")).toBe("num");
      expect(detectTextLanguage("117134")).toBe("num");
      expect(detectTextLanguage("2024")).toBe("num");
    });

    it("should classify Japanese titles with Kana", () => {
      expect(detectTextLanguage("相思相愛の温泉旅行")).toBe("ja");
      expect(detectTextLanguage("アイ")).toBe("ja");
      expect(detectTextLanguage("最初で最後の限界突破")).toBe("ja");
      expect(detectTextLanguage("プレステージ専属")).toBe("ja");
      expect(detectTextLanguage("泥酔痴女に絡まれて朝まで10発")).toBe("ja");
    });

    it("should classify English titles", () => {
      expect(detectTextLanguage("BEAUTY")).toBe("en");
      expect(detectTextLanguage("Tokyo Hot")).toBe("en");
      expect(detectTextLanguage("Special Edition")).toBe("en");
    });

    it("should classify Chinese titles with CJK Hanzi and no Kana", () => {
      expect(detectTextLanguage("最初也是最後的極限挑戰")).toBe("zh");
      expect(detectTextLanguage("相澤南")).toBe("zh");
      expect(detectTextLanguage("小心被纏上※ 三田真鈴喝醉變成甜美痴女")).toBe("zh");
      expect(detectTextLanguage("中文标题测试")).toBe("zh");
    });
  });
});
