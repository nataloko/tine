// Live syntax highlighting while EDITING a fenced code block: a highlighted
// overlay is painted behind the (still sole-owner) textarea, whose text is made
// transparent with a visible caret — so code is coloured as you type, in a box
// that looks like the rendered block (see src/components/Block.tsx + app.css).
// ON by default; a toggle in Settings → "mine (extras)" is the escape hatch if the
// transparent-text caret misbehaves on a given WebKitGTK build. Persisted device-
// locally via the app_bool backend (WebKitGTK localStorage isn't kept across launches).

import { createSignal } from "solid-js";
import { backend } from "./backend";

const KEY = "code_hl_editing";

const [enabled, setEnabledSig] = createSignal(true);

/** Reactive: highlight code blocks while editing them? Default ON. */
export const codeHlEnabled = enabled;

export function setCodeHlEnabled(on: boolean): void {
  setEnabledSig(on);
  void backend().setAppBool(KEY, on).catch(() => {});
}

/** Load the persisted preference at startup. Default: ON. */
export async function initCodeHlSettings(): Promise<void> {
  try {
    setEnabledSig(await backend().getAppBool(KEY, true));
  } catch {
    /* default on */
  }
}
