import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "./ChatMessage";

describe("chat message formatting", () => {
  it("renders useful headings, lists and HTTPS links", () => {
    const html = renderToStaticMarkup(createElement(ChatMessage, { body: '**Today**\n- Breakfast\n- Walk\n\n1. Start here\n2. Then rest\n[Calendar](https://calendar.google.com/)' }));
    expect(html).toContain("<strong>Today</strong>");
    expect(html).toContain("<ul><li>Breakfast</li><li>Walk</li></ul>");
    expect(html).toContain('<ol start="1">');
    expect(html).toContain('href="https://calendar.google.com/"');
    expect(html).not.toContain("**Today**");
  });
  it("escapes HTML and does not activate unsafe or credential-bearing links", () => {
    const html = renderToStaticMarkup(createElement(ChatMessage, { body: '<img src=x onerror=alert(1)> [run](javascript:alert(1)) https://user:pass@example.com' }));
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
  });
  it("keeps trailing prose punctuation outside links", () => {
    expect(renderToStaticMarkup(createElement(ChatMessage, { body: "Visit https://example.com. Next." }))).toContain('>https://example.com</a>. Next.');
  });
});
