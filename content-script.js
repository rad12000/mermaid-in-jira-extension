const mermaidViewHTMLPromise = fetch(
  chrome.runtime.getURL("mermaid-view.html")
).then((res) => res.text());

const renderMermaidError =
  "Unable to find source-code formatter for language: mermaid.";

/**
 * @param {HTMLElement} parent
 * @returns {{elToReplace: HTMLElement, mermaidCode: string}[]}
 */
function findReadModeCodeBlocks(parent) {
  const potentialMermaidBlocks = parent.querySelectorAll(
    ".codeContent.panelContent > code, .codeContent.panelContent > pre, .preformattedContent.panelContent > pre"
  );

  /**
   * @type {{elToReplace: HTMLElement, mermaidCode: string}[]}
   */
  const blocks = [];
  for (const block of potentialMermaidBlocks) {
    const code = block.textContent;

    if (!code) continue;
    const mermaidPrefix = "```mermaid\n";
    const mermaidSuffix = "\n```";
    if (!code.startsWith(mermaidPrefix)) continue;
    if (!code.endsWith(mermaidSuffix)) continue;

    const mermaidCode = code.substring(
      mermaidPrefix.length,
      code.length - mermaidSuffix.length
    );

    block.parentElement.style.padding = "1em";

    blocks.push({ elToReplace: block, mermaidCode });
  }

  return blocks;
}

/**
 * @param {HTMLElement} parent
 * @returns {{elToReplace: HTMLElement, mermaidCode: string}[]}
 */
function findWriteModeCodeBlocks(parent) {
  /**
   * @type {NodeListOf<HTMLIFrameElement>}
   */
  const iframes = parent.querySelectorAll("iframe");
  const result = [];
  for (const iframe of iframes) {
    try {
      if (!iframe.contentDocument) continue;
      const errorCodeBlocks = iframe.contentDocument.querySelectorAll(
        ".code.panel > .error"
      );

      for (const errorEl of errorCodeBlocks) {
        if (errorEl.textContent !== renderMermaidError) continue;
        const mermaidCode = errorEl.parentElement.textContent.replace(
          /^Unable.+yaml/,
          ""
        );

        result.push({ mermaidCode, elToReplace: errorEl.parentElement });
      }
    } catch (e) {
      console.warn(e);
    }

    return result;
  }

  return result;
}

async function renderMermaidCode(parent = document) {
  const codeBlocks = [findReadModeCodeBlocks].map((fn) => fn(parent)).flat();

  const promises = [];
  for (const block of codeBlocks) {
    const div = document.createElement("span");
    block.elToReplace.replaceWith(div);
    promises.push(
      drawMermaidDiagram(div, block.mermaidCode, {
        fullScreen: false,
        enterFullScreen,
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
  document.body.append(dialog);
  await drawMermaidDiagram(dialog, code, {
    fullScreen: true,
    exitFullScreen: () => dialog.remove(),
  });
  dialog.showModal();
}

/**
 *
 * @param {HTMLElement} parent
 * @param {string} code
 * @param {{fullScreen: boolean; exitFullScreen: () => void; enterFullScreen: (code: string) => void;}} options
 */
async function drawMermaidDiagram(
  parent,
  code,
  { fullScreen, enterFullScreen, exitFullScreen }
) {
  const mermaidViewHTML = (await mermaidViewHTMLPromise)
    .replaceAll("[[MERMAID_CODE]]", code)
    .replaceAll("[[FULL_SCREEN_CLASS]]", fullScreen ? "full-screen" : "");

  const iframe = document.createElement("iframe");
  iframe.srcdoc = mermaidViewHTML;
  iframe.style.border = "none";
  if (fullScreen) {
    iframe.style.width = "100%";
    iframe.style.height = "calc(100% - 10px)";
  }

  parent.append(iframe);

  iframe.onload = () => {
    const pre = iframe.contentDocument.querySelector("pre");
    const tabHeader = iframe.contentDocument.querySelector(
      ".tab-container .tab-header"
    );

    if (fullScreen) {
      const htmlEl = iframe.contentDocument.querySelector("html");
      htmlEl.style.width = "100%";
      htmlEl.style.height = "100%";
    }

    iframe.contentDocument.querySelector("#fullscreen").onclick = () => {
      if (enterFullScreen) {
        enterFullScreen(code);
      }

      if (exitFullScreen) {
        exitFullScreen();
      }
    };

    let timeoutId;
    const obs = new MutationObserver(() => {
      if (!fullScreen) {
        iframe.height = pre.offsetHeight + tabHeader.offsetHeight + 8;
      }

      if (timeoutId) return;
      setTimeout(() => {
        obs.disconnect();
      }, 2_000);
    });

    obs.observe(pre, { attributes: true, childList: true, subtree: true });
  };
}

function observeIssueContent(issueContent) {
  const observer = new MutationObserver(() => {
    renderMermaidCode(issueContent);
  });
  observer.observe(issueContent, { childList: true, subtree: true });
}

const obs = new MutationObserver(() => {
  // Self hosted use case
  const issueContent = document.querySelector(".issue-body-content");
  if (!issueContent) return;
  obs.disconnect();
  observeIssueContent(issueContent);
});

obs.observe(document.body, { childList: true, subtree: true });

setTimeout(() => {
  obs.disconnect();
}, 10_000);

renderMermaidCode();
