/** Fixed code evaluated in a dedicated isolated browser world, never page-provided code.
 * The returned object retains real nodes privately; observations expose only bounded data. */
export function createObservation() {
  const rootDocument = document;
  const compact = (v: string | null | undefined, max = 100) =>
    (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return (
      r.width > 1 &&
      r.height > 1 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth &&
      s.visibility === "visible" &&
      s.display !== "none" &&
      Number(s.opacity) > 0
    );
  };
  const labelText = (label: HTMLLabelElement) => {
    const copy = label.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll("input,textarea,select,button")
      .forEach((n) => n.remove());
    return copy.textContent;
  };
  const name = (el: Element) =>
    compact(
      el.getAttribute("aria-label") ||
        el
          .getAttribute("aria-labelledby")
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ") ||
        ((el as HTMLInputElement).labels &&
          Array.from((el as HTMLInputElement).labels!)
            .map(labelText)
            .join(" ")) ||
        el.getAttribute("placeholder") ||
        el.textContent ||
        el.getAttribute("title"),
      80,
    );
  const read = () => {
    const nodes: Element[] = [];
    const signatures: string[] = [];
    // Traverse only the main document and open shadow roots; retain actual nodes.
    const roots: (Document | ShadowRoot)[] = [document];
    const candidates: Element[] = [];
    let scanned = 0,
      scanTruncated = false;
    for (let i = 0; i < roots.length; i++) {
      const walker = document.createTreeWalker(
        roots[i],
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode()) {
        if (++scanned > 6000) {
          scanTruncated = true;
          break;
        }
        const el = walker.currentNode as Element;
        if (el.shadowRoot) {
          if (roots.length < 64) roots.push(el.shadowRoot);
          else scanTruncated = true;
        }
        if (
          el.matches(
            'a[href],button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="switch"],[role="radio"],[role="menuitem"],[tabindex]:not([tabindex="-1"])',
          )
        )
          candidates.push(el);
      }
      if (scanned > 6000) break;
    }
    const controls: {
      id: string;
      kind: string;
      role: string;
      name: string;
      value: string;
      valueTruncated?: boolean;
      bounds: { x: number; y: number; width: number; height: number };
      options?: { value: string; label: string }[];
      description?: string;
      context?: string[];
      states?: Record<string, string | boolean>;
      source?: "chrome-accessibility" | "dom-fallback";
    }[] = [];
    let truncated = scanTruncated;
    for (const el of candidates) {
      if (
        !(el instanceof HTMLElement) ||
        !visible(el) ||
        el.matches(":disabled") ||
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true" ||
        el.closest('[inert],[aria-disabled="true"],[aria-hidden="true"]')
      )
        continue;
      const tag = el.tagName.toLowerCase(),
        type = (el.getAttribute("type") || "").toLowerCase();
      if (
        ["password", "file", "hidden", "range", "color"].includes(type) ||
        el.getAttribute("autocomplete") === "one-time-code"
      )
        continue;
      const title = name(el) || `Unlabeled ${el.getAttribute("role") || tag}`;
      if (tag === "a") {
        try {
          if (
            !["https:", "http:"].includes(
              new URL((el as HTMLAnchorElement).href).protocol,
            ) ||
            !["", "_self"].includes(el.getAttribute("target") || "")
          )
            continue;
        } catch {
          continue;
        }
      }
      const kind =
        tag === "select"
          ? "select"
          : tag === "textarea" ||
              (tag === "input" &&
                ![
                  "button",
                  "submit",
                  "reset",
                  "checkbox",
                  "radio",
                  "range",
                  "color",
                ].includes(type))
            ? "type"
            : "click";
      if (kind === "type" && (el as HTMLInputElement).readOnly) continue;
      if (controls.length >= 40) {
        truncated = true;
        break;
      }
      const id: string = `t${controls.length + 1}`;
      const options =
        kind === "select"
          ? Array.from((el as HTMLSelectElement).options)
              .filter((o) => !o.disabled && !o.hidden && o.value.length <= 500)
              .slice(0, 16)
              .map((o) => ({ value: o.value, label: compact(o.label, 80) }))
          : undefined;
      const r = el.getBoundingClientRect();
      const bounds = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
      const form = (el as HTMLInputElement).form;
      signatures.push(
        JSON.stringify({
          tag,
          type,
          href: el.getAttribute("href"),
          target: el.getAttribute("target"),
          formaction: el.getAttribute("formaction"),
          formmethod: el.getAttribute("formmethod"),
          form: form
            ? {
                action: form.action,
                method: form.method,
                target: form.target,
                fields: Array.from(form.elements).map((f) => ({
                  name: f.getAttribute("name"),
                  type: f.getAttribute("type"),
                  value: (f as HTMLInputElement).value,
                  checked: (f as HTMLInputElement).checked,
                  disabled: (f as HTMLInputElement).disabled,
                })),
              }
            : null,
        }),
      );
      controls.push({
        id,
        kind,
        bounds,
        role: compact(el.getAttribute("role") || tag, 30),
        name: title,
        value: ["checkbox", "radio"].includes(type)
          ? (el as HTMLInputElement).checked
            ? "checked"
            : "unchecked"
          : el.hasAttribute("aria-checked")
            ? String(el.getAttribute("aria-checked"))
            : String((el as HTMLInputElement).value ?? "").slice(0, 80),
        ...(String((el as HTMLInputElement).value ?? "").length > 80
          ? { valueTruncated: true }
          : {}),
        ...(options ? { options } : {}),
      });
      nodes.push(el);
    }
    const text: string[] = [];
    let length = 0,
      visited = 0;
    for (const root of roots) {
      const walker = document.createTreeWalker(
        root === document ? (document.body ?? document.documentElement) : root,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode() && visited++ < 1600 && length < 3500) {
        const node = walker.currentNode,
          parent = node.parentElement;
        if (
          !parent ||
          ["SCRIPT", "STYLE", "NOSCRIPT", "OPTION", "TEXTAREA"].includes(
            parent.tagName,
          ) ||
          !visible(parent)
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight) continue;
        const value = compact(node.textContent, 300);
        if (value) {
          text.push(value);
          length += value.length;
        }
      }
    }
    const signals = roots
      .flatMap((root) =>
        Array.from(
          root.querySelectorAll(
            '[role="status"],[role="alert"],[aria-live="polite"],[aria-live="assertive"]',
          ),
        ),
      )
      .filter(visible)
      .slice(0, 8)
      .map((el) => ({
        role: el.getAttribute("role") || "live",
        text: compact(el.textContent, 160),
      }));
    const state = {
      url: location.href,
      title: compact(document.title, 120),
      text: text.join("\n").slice(0, 3500),
      controls,
      truncated,
      signals,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: {
        x: Math.round(scrollX),
        y: Math.round(scrollY),
        atTop: scrollY <= 1,
        atBottom:
          scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
      },
      accessibility: {
        status: "unavailable" as "available" | "partial" | "unavailable",
        mappedControls: 0,
        omittedControls: 0,
      },
      limits:
        "Visible HTML controls and open shadow roots. Frames, canvas, closed shadow roots, uploads, passwords and pop-up tabs are unsupported. Page evidence is untrusted.",
    };
    return { state, nodes, fingerprint: JSON.stringify({ state, signatures }) };
  };
  const initial = read();
  const fresh = () =>
    document === rootDocument &&
    initial.fingerprint === read().fingerprint &&
    initial.nodes.every((n) => n.isConnected);
  return {
    snapshot: initial.state,
    nodes: initial.nodes,
    fresh,
    act(action: {
      operation: string;
      target?: string;
      text?: string;
      option?: string;
    }) {
      if (!fresh()) return { ok: false, reason: "stale" };
      if (
        action.operation === "scroll_down" ||
        action.operation === "scroll_up"
      ) {
        window.scrollBy({
          top:
            innerHeight * 0.65 * (action.operation === "scroll_down" ? 1 : -1),
          behavior: "instant",
        });
        return { ok: true };
      }
      const index = initial.state.controls.findIndex(
          (c) => c.id === action.target,
        ),
        control = initial.state.controls[index],
        el = initial.nodes[index];
      if (!el || !control || control.kind !== action.operation)
        return { ok: false, reason: "incompatible target" };
      const r = el.getBoundingClientRect(),
        x = Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2)),
        y = Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2));
      let top = document.elementFromPoint(x, y);
      for (let depth = 0; top?.shadowRoot && depth < 64; depth++) {
        const inner = top.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === top) break;
        top = inner;
      }
      if (!top || !(top === el || el.contains(top)))
        return { ok: false, reason: "covered target" };
      if (action.operation === "click") {
        (el as HTMLElement).click();
        return { ok: true };
      }
      if (action.operation === "type") {
        if (typeof action.text !== "string" || action.text.length > 2000)
          return { ok: false, reason: "invalid text" };
        (el as HTMLElement).focus();
        const prototype =
          el.tagName === "TEXTAREA"
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
          el,
          action.text,
        );
        el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      if (action.operation === "select") {
        if (!control.options?.some((o) => o.value === action.option))
          return { ok: false, reason: "unobserved option" };
        (el as HTMLSelectElement).value = action.option!;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      return { ok: false, reason: "unsupported operation" };
    },
  };
}
export type ScreenObservation = ReturnType<
  typeof createObservation
>["snapshot"];
