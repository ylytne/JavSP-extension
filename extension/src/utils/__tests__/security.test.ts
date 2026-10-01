import { describe, it, expect } from "vitest";
import { sanitizeHttpUrl } from "../security";

describe("sanitizeHttpUrl", () => {
  it("allows standard http and https URLs", () => {
    expect(sanitizeHttpUrl("https://www.javbus.com")).toBe("https://www.javbus.com");
    expect(sanitizeHttpUrl("http://localhost:8765/api")).toBe("http://localhost:8765/api");
    expect(sanitizeHttpUrl("https://airav.io/video/123")).toBe("https://airav.io/video/123");
  });

  it("rejects dangerous pseudo-protocols like javascript: and data:", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeHttpUrl("javascript:void(0)")).toBeUndefined();
    expect(sanitizeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(sanitizeHttpUrl("vbscript:msgbox(1)")).toBeUndefined();
    expect(sanitizeHttpUrl("file:///C:/Windows/System32")).toBeUndefined();
  });

  it("handles null, undefined, empty and invalid strings", () => {
    expect(sanitizeHttpUrl(null)).toBeUndefined();
    expect(sanitizeHttpUrl(undefined)).toBeUndefined();
    expect(sanitizeHttpUrl("")).toBeUndefined();
    expect(sanitizeHttpUrl("   ")).toBeUndefined();
    expect(sanitizeHttpUrl("not-a-url")).toBeUndefined();
  });
});
