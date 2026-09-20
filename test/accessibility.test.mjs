import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { BrowserSession, computerQuestions } from "../dist/computer/index.js";
const html = `<!doctype html><title>Accessibility fixture</title><style>body{font:18px sans-serif;padding:20px}fieldset{display:inline-block}button,input{margin:8px}#shade{position:absolute;left:700px;top:0}</style>
<fieldset><legend>Draft settings</legend><label>Name<input required aria-invalid="true" aria-describedby="help"></label><p id="help">Use a short project name</p><button>Save</button></fieldset>
<fieldset><legend>Live settings</legend><button>Save</button></fieldset>
<button aria-expanded="false" aria-controls="details">More options</button><input type="checkbox" aria-label="Receive updates" checked>
<div role="group" aria-disabled="true"><button>Disabled inherited</button></div><button aria-hidden="true">Hidden from accessibility</button>
<input type="password" value="never-export-this"><p role="status">Changes are not saved</p>
<custom-action tabindex="0">★</custom-action><shadow-form></shadow-form>
<script>
customElements.define('custom-action', class extends HTMLElement { constructor(){super(); this.a=this.attachInternals(); this.a.role='button'; this.a.ariaLabel='Apply theme'; this.a.ariaDescription='Use the preview palette';} });
customElements.define('shadow-form', class extends HTMLElement { constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<label>Shadow name<input></label><button>Save shadow</button><output>Nothing saved</output>';this.shadowRoot.querySelector('button').onclick=()=>this.shadowRoot.querySelector('output').textContent='Saved '+this.shadowRoot.querySelector('input').value;} });
</script>`;
async function fixture(fn) {
  const http = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  });
  await new Promise((r) => http.listen(0, "127.0.0.1", r));
  const session = new BrowserSession({ headless: true });
  try {
    await session.start(`http://127.0.0.1:${http.address().port}`);
    await fn(session);
  } finally {
    await session.close();
    await new Promise((r) => http.close(r));
  }
}
test("Chrome computed names, descriptions, states and group context reach every Jev head", () =>
  fixture(async (s) => {
    const o = await s.observe(false);
    assert.equal(o.screen.accessibility.status, "available");
    const named = (name) => o.screen.controls.find((c) => c.name === name);
    assert.equal(named("Apply theme").source, "chrome-accessibility");
    assert.equal(named("Apply theme").description, "Use the preview palette");
    assert.equal(named("Name").states.required, true);
    assert.equal(named("Name").states.invalid, "true");
    assert.equal(named("Name").description, "Use a short project name");
    assert.equal(named("Receive updates").states.checked, "true");
    assert.equal(named("More options").states.expanded, false);
    assert.deepEqual(
      o.screen.controls.filter((c) => c.name === "Save").map((c) => c.context),
      [["Draft settings"], ["Live settings"]],
    );
    assert.ok(!named("Disabled inherited"));
    assert.ok(!named("Hidden from accessibility"));
    const q = computerQuestions(
      o.screen,
      "Save draft settings after correcting the name",
      [],
    );
    const state = JSON.parse(q.state);
    assert.deepEqual(state.page.facts.invalidFields, [named("Name").id]);
    assert.deepEqual(state.page.facts.emptyRequiredFields, [named("Name").id]);
    assert.ok(
      state.page.signals.some((x) => x.text === "Changes are not saved"),
    );
    assert.match(
      q.questions.click_target.criteria[
        o.screen.controls.find((c) => c.name === "Save").id
      ],
      /Draft settings/,
    );
    assert.ok(!JSON.stringify(q).includes("never-export-this"));
    assert.ok(!("scroll_up" in q.questions.operation.criteria));
  }));
test("open shadow roots retain executable node identity and visible text", () =>
  fixture(async (s) => {
    let o = await s.observe(false);
    await s.act(o.observationId, {
      operation: "type",
      target: o.screen.controls.find((c) => c.name === "Shadow name").id,
      text: "Aurora",
    });
    o = await s.observe(false);
    assert.equal(
      o.screen.controls.find((c) => c.name === "Shadow name").value,
      "Aurora",
    );
    await s.act(o.observationId, {
      operation: "click",
      target: o.screen.controls.find((c) => c.name === "Save shadow").id,
    });
    o = await s.observe(false);
    assert.match(o.screen.text, /Saved Aurora/);
  }));
test("AX-only ElementInternals changes invalidate an otherwise unchanged DOM observation", () =>
  fixture(async (s) => {
    const o = await s.observe(false);
    // Mutate only our owned fixture; DOM text, attributes and bounds stay identical.
    await s.page.evaluate(() => {
      document.querySelector("custom-action").a.ariaLabel = "Publish theme";
    });
    await assert.rejects(
      () =>
        s.act(o.observationId, {
          operation: "click",
          target: o.screen.controls.find((c) => c.name === "Apply theme").id,
        }),
      /Accessibility state changed/,
    );
    assert.equal(s.history.length, 0);
  }));
test("AX ignored custom control is not exposed or admitted through a guessed DOM ID", () =>
  fixture(async (s) => {
    await s.page.evaluate(() => {
      document.querySelector("custom-action").a.ariaHidden = "true";
    });
    const o = await s.observe(false);
    assert.ok(
      !o.screen.controls.some(
        (c) => c.name === "Apply theme" || c.name === "★",
      ),
    );
    assert.equal(o.screen.accessibility.omittedControls, 1);
    const offered = new Set(o.screen.controls.map((c) => c.id));
    const omitted = Array.from({ length: 15 }, (_, i) => `t${i + 1}`).find(
      (id) => !offered.has(id),
    );
    await assert.rejects(
      () => s.act(o.observationId, { operation: "click", target: omitted }),
      /inaccessible target/,
    );
  }));

test("exact value facts preserve whitespace and never treat a truncated prefix as a match", () => fixture(async s => {
  let o = await s.observe(false);
  let target = o.screen.controls.find(c => c.name === "Name");
  await s.act(o.observationId, { operation: "type", target: target.id, text: "Alpha   Beta" });
  o = await s.observe(false);
  let state = JSON.parse(computerQuestions(o.screen, "Use exact name", [], [{ name: "Name", kind: "type", value: "Alpha Beta" }]).state);
  assert.equal(state.desiredInputs[0].currentValueMatches, false);
  target = o.screen.controls.find(c => c.name === "Name");
  await s.act(o.observationId, { operation: "type", target: target.id, text: "x".repeat(100) });
  o = await s.observe(false);
  state = JSON.parse(computerQuestions(o.screen, "Use exact name", [], [{ name: "Name", kind: "type", value: "x".repeat(80) }]).state);
  assert.equal(state.desiredInputs[0].currentValueMatches, null);
}));
