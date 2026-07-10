import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type JSX } from "solid-js";
import { render } from "solid-js/web";
import { initParser } from "../render/parse";
import { resetStore, setDoc, readPageProperty, type FeedPage } from "../store";
import { openPageProps, closePageProps } from "../ui";
import { PageProps } from "./PageProps";

beforeAll(async () => {
  await initParser();
});

afterEach(() => {
  closePageProps();
  resetStore();
  document.body.innerHTML = "";
});

function page(name: string, preBlock: string | null): FeedPage {
  return { name, kind: "page", title: name, preBlock, roots: [], format: "md", readOnly: false, guide: false };
}

function mount(node: () => JSX.Element) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispose = render(node, root);
  return { root, dispose };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("PageProps icon field — no raw emoji glyph is ever painted", () => {
  it("shows the current icon as a Twemoji <img>, with the input left empty", async () => {
    setDoc({ pages: [page("metalogseq", "icon:: 🤯")], byId: {}, feed: ["metalogseq"], loaded: true });
    const { root, dispose } = mount(() => <PageProps />);
    openPageProps("metalogseq", 100, 100);
    await tick();

    // The emoji is rendered as an <img> (font-independent), not raw text.
    const img = root.querySelector<HTMLImageElement>(".pp-icon-preview img.emoji");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("alt")).toBe("🤯");

    // Crucially: NO input on the panel contains the raw emoji.
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("input"));
    expect(inputs.some((i) => i.value.includes("🤯"))).toBe(false);
    const iconInput = root.querySelector<HTMLInputElement>(".pp-icon-input");
    expect(iconInput!.value).toBe("");
    dispose();
  });

  it("typing an emoji commits it but leaves the input blank", async () => {
    setDoc({ pages: [page("Plain", null)], byId: {}, feed: ["Plain"], loaded: true });
    const { root, dispose } = mount(() => <PageProps />);
    openPageProps("Plain", 100, 100);
    await tick();

    const iconInput = root.querySelector<HTMLInputElement>(".pp-icon-input")!;
    iconInput.value = "🍃";
    iconInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(readPageProperty("Plain", "icon")).toBe("🍃");
    expect(iconInput.value).toBe(""); // never left holding the glyph
    expect(root.querySelector(".pp-icon-preview img.emoji")?.getAttribute("alt")).toBe("🍃");
    dispose();
  });

  it("Clear removes the icon", async () => {
    setDoc({ pages: [page("Has", "icon:: 🏭")], byId: {}, feed: ["Has"], loaded: true });
    const { root, dispose } = mount(() => <PageProps />);
    openPageProps("Has", 100, 100);
    await tick();

    root.querySelector<HTMLButtonElement>(".pp-icon-clear")!.click();
    await tick();
    expect(readPageProperty("Has", "icon")).toBe(null);
    dispose();
  });
});
