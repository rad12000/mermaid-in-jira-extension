# Mermaid in Jira Extension

The `Mermaid in Jira` extension renders Mermaid diagrams within Jira Cloud and self-hosted Jira instances. This extension is in no way affiliated with or sponsored by [Mermaid.js](https://mermaid.js.org/), or Atlassian.

# Development Setup

Typically the extension is added to a Chromium based browser via the Chrome Web Store. However, for development it is necessary to load the extension from the source code. To do so, first clone this repository. The extension source code lives in the [./src](./src/) directory.

You can then load the unpacked extension by following the instructions found here: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked. Again, the directory to load is the [./src](./src/) directory.

# How it works

This extension injects uses [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) to interact with the DOM. It searches for `<pre>` and `<code>` blocks in the DOM, matching those containing a `mermaid` code block, as documented here https://mermaid.js.org/intro/getting-started.html#native-mermaid-support. Matching `<pre>` or `<code>` elements are replaced with an `<iframe>`, allowing the content script to import the Mermaid SDK without CORS errors.

Changes to the DOM are monitored via a single [`MutationObserver`](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver). Any time a new node is added to the `document.body`, the extension checks if any new `<pre>` or `<code>` blocks were added, and evaluates them as described above if there were.

Unfortunately, due to limitations to the [manifest.json `content_scripts.matches`](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) pattern rules, the extension matches ALL sites visited. However, there are additional glob patterns that are matched after the `content_script.matches` rules are evaluated which restrict the sites that the content scripts are actually injected into. You can find those additional rules in `content_scripts.include_globs`.
