const mermaidViewHTMLPromise = fetch(
  chrome.runtime.getURL("mermaid-view.html")
).then((res) => res.text());

/**
 * @param {HTMLElement} parent
 * @returns {{elToReplace: HTMLElement, mermaidCode: string}[]}
 */
function findReadModeCodeBlocks(parent) {
  if (!parent) return;

  const potentialMermaidBlocks = parent.querySelectorAll("code, pre");
  if (!potentialMermaidBlocks) {
    return;
  }

  /**
   * @type {{elToReplace: HTMLElement, mermaidCode: string}[]}
   */
  const blocks = [];
  for (const block of potentialMermaidBlocks) {
    let code = block.textContent;
    if (!code) continue;
    code = code.trim();

    const mermaidPrefix = "```mermaid\n";
    const mermaidSuffix = "\n```";
    if (!code.startsWith(mermaidPrefix)) continue;
    if (!code.endsWith(mermaidSuffix)) continue;

    const mermaidCode = code.substring(
      mermaidPrefix.length,
      code.length - mermaidSuffix.length
    );

    if (block.parentElement.childElementCount === 1) {
      block.parentElement.style.padding = "1em";
      block.parentElement.style.display = "block";
    }

    blocks.push({ elToReplace: block, mermaidCode });
  }

  return blocks;
}

async function renderMermaidCode(parent = document.body) {
  const codeBlocks = [findReadModeCodeBlocks].map((fn) => fn(parent)).flat();
  if (!codeBlocks) return;

  const promises = [];
  for (const block of codeBlocks) {
    let potentialContentBlock = block.elToReplace;
    let shouldCancel = false;
    while (potentialContentBlock) {
      if (potentialContentBlock.id !== "description-val") {
        potentialContentBlock = potentialContentBlock.parentElement;
        continue;
      }

      shouldCancel = potentialContentBlock.classList.contains("active");
      break;
    }

    if (shouldCancel) {
      console.debug("looks like we're in active mode, canceling");
      continue;
    }

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const summaryText = document.createElement("p");
    const div = document.createElement("div");
    const title = parseTitle(block.mermaidCode);

    summaryText.innerText = `${
      !title ? "" : title + " - A "
    }Mermaid Diagram (Powered by the "Mermaid in Jira" Chrome Extension)`;
    summaryText.style.textOverflow = "ellipsis";
    summaryText.style.overflow = "hidden";
    summaryText.style.whiteSpace = "nowrap";

    summary.append(summaryText);
    details.append(summary, div);
    details.open = true;
    details.onclick = (e) => {
      e.stopPropagation();
    };

    block.elToReplace.replaceWith(details);

    const style = document.createElement("style");
    style.innerText = `
      details:open > summary {
        padding-bottom: 1em;
        position: relative;
      }

      details > summary {
        display: flex;
        align-items: center;
      }

      details > summary:hover {
        cursor: grab;
      }

      details > summary::before {
        display: inline-block;
        content: '\\279C';
        margin-right: 1em;
        font-size: 2em;
        transition: transform 100ms;
      }

      details:open > summary::before {
        transform: rotate(90deg);
      }
    `;
    details.before(style);

    let lastOpenState = details.open;
    promises.push(
      drawMermaidDiagram(div, block.mermaidCode, {
        fullScreen: false,
        enterFullScreen,
        beforeRender: () => {
          lastOpenState = details.open;
          details.open = true;
          return new Promise((resolve) => {
            resolve();
          });
        },
        afterRender: () => {
          details.open = lastOpenState;
        },
      })
    );
  }

  await Promise.all(promises);
}

/**
 * @param {string} code
 */
async function enterFullScreen(code) {
  const dialog = document.createElement("dialog");
  dialog.style.width = "95dvw";
  dialog.style.height = "95dvh";
  dialog.style.boxSizing = "border-box";
  dialog.style.padding = "1em";
  dialog.style.overflow = "hidden";
  document.body.append(dialog);
  await drawMermaidDiagram(dialog, code, {
    fullScreen: true,
    exitFullScreen: () => dialog.remove(),
  });
  dialog.showModal();
}

/**
 * @param {string} code
 */
function parseTitle(code) {
  const titleRegex = /^---\n.*^title:(\s|)(?<title>.*?$).*\n---/ms;
  const matches = titleRegex.exec(code);
  if (!matches) return;
  return matches.groups["title"];
}

/**
 * @type {Map<number, {afterRender: () => void; beforeRender: () => void; target: HTMLIFrameElement}>}
 */
const windowIdToHooks = new Map();
let iframeId = 0;

window.addEventListener("message", (e) => {
  if (Array.isArray(e.data) || typeof e.data !== "object") return;

  const { type, windowId } = e.data ?? {};
  if (!type || !windowId) return;
  const hooks = windowIdToHooks.get(windowId);
  if (!hooks) return;

  switch (type) {
    case "AFTER_RENDER":
      if (!hooks.afterRender) return;
      hooks.afterRender();
      break;
    case "BEFORE_RENDER":
      Promise.resolve((hooks.beforeRender ?? (() => {}))()).then(() => {
        hooks.target.contentWindow.postMessage({ type: "BEFORE_RENDER_ACK" });
      });
      break;
  }
});

/**
 *
 * @param {HTMLElement} parent
 * @param {string} code
 * @param {{fullScreen: boolean; exitFullScreen: () => void; enterFullScreen: (code: string) => void;}} options
 */
async function drawMermaidDiagram(
  parent,
  code,
  { fullScreen, enterFullScreen, exitFullScreen, afterRender, beforeRender }
) {
  iframeId++;
  const windowId = iframeId;

  const mermaidViewHTML = (await mermaidViewHTMLPromise)
    .replaceAll("[[MERMAID_CODE]]", JSON.stringify(JSON.stringify(code)))
    .replaceAll("[[FULL_SCREEN_CLASS]]", fullScreen ? "full-screen" : "");

  const iframe = document.createElement("iframe");
  windowIdToHooks.set(windowId, { afterRender, target: iframe, beforeRender });

  iframe.srcdoc = mermaidViewHTML;
  iframe.style.border = "none";
  iframe.style.width = "100%";
  iframe.style.height = "100%";

  parent.append(iframe);

  if (!fullScreen) {
    parent.style.aspectRatio = "2 / 1";
  }

  iframe.onload = () => {
    iframe.contentWindow.postMessage({ type: "WINDOW_ID", value: windowId });
    const htmlEl = iframe.contentDocument.querySelector("html");
    htmlEl.style.width = "100%";
    htmlEl.style.height = "100%";

    iframe.contentDocument.querySelector("#fullscreen").onclick = () => {
      if (enterFullScreen) {
        enterFullScreen(code);
      }

      if (exitFullScreen) {
        exitFullScreen();
      }
    };
  };
}

/**
 *
 * @param {HTMLElement} parent
 */
function observeIssueContent(parent) {
  const observer = new MutationObserver(async (changes) => {
    const promises = [];
    for (const change of changes) {
      change.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;

        if (node.nodeName !== "PRE" && node.nodeName !== "CODE") {
          promises.push(renderMermaidCode(node));
          return;
        }

        promises.push(renderMermaidCode(node.parentElement));
      });
    }

    await Promise.all(promises);
  });
  observer.observe(parent, { childList: true, subtree: true });
}

observeIssueContent(document.body);
renderMermaidCode(document.body);
