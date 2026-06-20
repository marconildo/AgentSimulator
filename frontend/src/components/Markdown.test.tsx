// Agent answers are Markdown source from the model; the chat must render them as
// formatted HTML (bold/headings/lists/code), not show literal `**` / `#` syntax.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders **bold** as <strong>, not literal asterisks", () => {
    const { container } = render(<Markdown text="**Título:** olá" />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("Título:");
    expect(container.textContent).not.toContain("**");
  });

  it("renders headings, lists and inline code structurally", () => {
    const md = "# Capítulo 1\n\n- um\n- dois\n\nUse `código` aqui.";
    const { container } = render(<Markdown text={md} />);
    expect(container.querySelector("h1")?.textContent).toBe("Capítulo 1");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelector("code")?.textContent).toBe("código");
  });

  it("opens links in a new tab", () => {
    render(<Markdown text="[RAG](https://example.com)" />);
    const link = screen.getByRole("link", { name: "RAG" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("href")).toBe("https://example.com");
  });
});
