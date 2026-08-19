import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;
const ROOT = process.cwd();
const QA_DIR = `${ROOT}\\qa`;
const qaProfile = `${ROOT}\\.chrome-qa-cdp`;
await mkdir(QA_DIR, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${qaProfile}`,
    "http://localhost:3000",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((response) => response.json());
      const page = pages.find((item) => item.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await delay(200);
  }
  throw new Error("Chrome debugging endpoint did not become ready.");
}

const socket = new WebSocket(await connect());
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const browserErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails.text);
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserErrors.push(`${message.params.entry.text} ${message.params.entry.url ?? ""}`.trim());
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    browserErrors.push(message.params.args.map((item) => item.value ?? item.description).join(" "));
  }
});

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if ((await evaluate("document.readyState")) === "complete") {
      await delay(850);
      return;
    }
    await delay(100);
  }
  throw new Error("Page did not finish loading.");
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 768,
  });
  await send("Page.reload", { ignoreCache: true });
  await waitForReady();
}

async function screenshot(filename) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(`${QA_DIR}\\${filename}`, Buffer.from(result.data, "base64"));
}

async function navigate(path) {
  await send("Page.navigate", { url: `http://localhost:3000${path}` });
  await waitForReady();
  await evaluate("window.scrollTo(0, 0)");
  await delay(250);
}

async function revealWholePage() {
  await evaluate(`new Promise(async resolve => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 280) {
      window.scrollTo(0, y);
      await new Promise(done => setTimeout(done, 130));
    }
    window.scrollTo(0, 0);
    await new Promise(done => setTimeout(done, 500));
    resolve(true);
  })`);
}

async function scrollToSelector(selector) {
  await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 105);
    return true;
  })()`);
  await delay(800);
}

async function setPhone(value) {
  await evaluate(`(() => {
    const input = document.querySelector('#phone');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
  await delay(100);
}

const results = {};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  await setViewport(1440, 1024);
  await evaluate("localStorage.clear()");
  await send("Page.reload", { ignoreCache: true });
  await waitForReady();
  await screenshot("tempo-desktop-1440.png");
  results.desktopOverflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");
  results.routes = await evaluate(`Promise.all(['/how-it-works','/pricing','/login','/terms','/privacy'].map(async path => ({ path, status: (await fetch(path)).status })))`);
  results.areaCodeOptionCount = await evaluate("document.querySelector('#area-code').options.length");
  results.selectedAreaCode = await evaluate(`(() => {
    const select = document.querySelector('#area-code');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, '415');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()`);
  await delay(100);
  results.selectedAreaCode = await evaluate("document.querySelector('#area-code').value");

  await navigate("/how-it-works");
  await screenshot("tempo-how-it-works-top.png");
  await revealWholePage();
  await scrollToSelector(".flow-section");
  await screenshot("tempo-how-it-works-flow.png");
  await scrollToSelector(".examples-section");
  await screenshot("tempo-how-it-works-examples.png");
  await scrollToSelector(".trust-section");
  await screenshot("tempo-how-it-works-trust.png");
  results.howItWorks = await evaluate(`({
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    stepCount: document.querySelectorAll('.step-card').length,
    exampleCount: document.querySelectorAll('.example-card').length,
    pageHeight: document.documentElement.scrollHeight,
    revealsVisible: [...document.querySelectorAll('.reveal')].every(node => getComputedStyle(node).opacity === '1'),
    cta: document.querySelector('.how-hero .page-cta')?.getAttribute('href')
  })`);

  await navigate("/pricing");
  await screenshot("tempo-pricing-top.png");
  await revealWholePage();
  await scrollToSelector(".pricing-grid");
  await screenshot("tempo-pricing-plans.png");
  await scrollToSelector(".pricing-detail");
  await screenshot("tempo-pricing-detail.png");
  await scrollToSelector(".faq-section");
  await screenshot("tempo-pricing-faq.png");
  results.pricing = await evaluate(`({
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    plans: [...document.querySelectorAll('.pricing-card h2')].map(node => node.textContent),
    buttons: document.querySelectorAll('.plan-button').length,
    revealsVisible: [...document.querySelectorAll('.reveal')].every(node => getComputedStyle(node).opacity === '1'),
    pageHeight: document.documentElement.scrollHeight
  })`);

  await setViewport(390, 844);
  await navigate("/how-it-works");
  await screenshot("tempo-how-it-works-mobile.png");
  results.howItWorksMobileOverflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");
  await navigate("/pricing");
  await screenshot("tempo-pricing-mobile.png");
  results.pricingMobileOverflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");

  await setViewport(1440, 1024);
  await navigate("/");

  await evaluate("document.querySelector('form').requestSubmit()");
  await delay(150);
  results.emptyValidation = await evaluate("document.querySelector('#phone-error')?.textContent ?? ''");

  await setPhone("123");
  await evaluate("document.querySelector('form').requestSubmit()");
  await delay(150);
  results.invalidValidation = await evaluate("document.querySelector('#phone-error')?.textContent ?? ''");

  await setPhone("5550198");
  await evaluate("document.querySelector('form').requestSubmit()");
  await delay(200);
  results.successState = await evaluate("document.querySelector('.signup-success')?.textContent?.trim() ?? ''");
  await screenshot("tempo-success-1440.png");

  await send("Page.reload", { ignoreCache: true });
  await waitForReady();
  results.persistedSuccess = await evaluate("document.querySelector('.signup-success')?.textContent?.trim() ?? ''");

  await evaluate("localStorage.clear()");
  await setViewport(1280, 800);
  await screenshot("tempo-desktop-1280.png");
  results.desktop1280Overflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");

  await setViewport(1024, 768);
  await screenshot("tempo-tablet-1024.png");
  results.tablet1024Overflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");

  await setViewport(768, 1024);
  await screenshot("tempo-tablet-768.png");
  results.tablet768Overflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");

  await setViewport(390, 844);
  await screenshot("tempo-mobile-390.png");
  results.mobile390Overflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");
  results.mobileMenuBefore = await evaluate("document.querySelector('.menu-button').getAttribute('aria-expanded')");
  await evaluate("document.querySelector('.menu-button').click()");
  await delay(100);
  results.mobileMenuAfter = await evaluate("document.querySelector('.menu-button').getAttribute('aria-expanded')");
  results.mobileMenuVisible = await evaluate("Boolean(document.querySelector('#mobile-navigation'))");

  await evaluate("document.querySelector('.menu-button').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  results.keyboardFocus = await evaluate("document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName");

  await setViewport(360, 800);
  await screenshot("tempo-mobile-360.png");
  results.mobile360Overflow = await evaluate("document.documentElement.scrollWidth <= window.innerWidth");
  results.consoleErrors = browserErrors;

  console.log(JSON.stringify(results, null, 2));
} finally {
  socket.close();
  chrome.kill();
}
