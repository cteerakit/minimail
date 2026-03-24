const DEFAULT_SETTINGS = {
  hideLogo: true,
  hideAddonSidebar: true,
  hideFooter: true,
  hideSearchBar: false,
  floatingComposeButton: false,
  minifySearchBar: true,
  collapseTopRightIcons: false,
  hideLeftSidebarOnHover: false,
  centerSearchBar: true,
  mailListWidthPreset: "small",
  shrinkMailListHeight: false,
  customSelectors: []
};

const MAIL_LIST_WIDTH_PRESETS = {
  off: 0,
  small: 960,
  medium: 1200,
  large: 1440
};

const SELECTOR_CONFIG = {
  hideLogo: [
    "a[aria-label='Gmail']",
    "a[title='Gmail']",
    "img[alt='Gmail']",
    "div[role='banner'] a[href='#inbox']"
  ],
  hideAddonSidebar: [
    "div[gh='rb']",
    "div[aria-label*='Side panel']",
    "div[aria-label='Calendar']",
    "div[aria-label='Keep']",
    "div[aria-label='Tasks']"
  ],
  hideFooter: [
    ".aeH .nH .n6",
    "div[role='contentinfo']",
    "div[aria-label*='Footer']"
  ],
  hideSearchBar: [
    "form[role='search']",
    "input[aria-label='Search mail']",
    "input[aria-label*='Search in mail']"
  ]
};

const SETTINGS_BUTTON_ICON_SVG = `
  <svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect
      x="128"
      y="9.20606"
      width="168"
      height="168"
      rx="16"
      transform="rotate(45 128 9.20606)"
      fill="none"
      stroke="#444746"
      stroke-width="32"
    ></rect>
  </svg>
`;
const FLOATING_COMPOSE_ICON_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3" aria-hidden="true" focusable="false">
    <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"></path>
  </svg>
`;

const managedElements = new Set();
const managedWidthElements = new Set();
const managedSearchBarElements = new Set();
const managedMinifiedSearchBarElements = new Set();
const managedLeftSidebarElements = new Set();
const managedTopRightIconElements = new Set();
const managedComposeButtonElements = new Set();
let latestSettings = { ...DEFAULT_SETTINGS };
let observer = null;
let applyCustomizationsTimer = null;
let uiObserver = null;
let settingsButton = null;
let settingsPopover = null;
let topRightLauncherButton = null;
let topRightCollapseTimer = null;
let globalDocumentClickBound = false;
const DEBUG_ENDPOINT = "http://127.0.0.1:7879/ingest/b9abd529-5329-4eff-b0bd-dc85dcc88658";
const DEBUG_SESSION_ID = "5d4471";
const DEBUG_MODE_ENDPOINT = "http://127.0.0.1:7879/ingest/b9abd529-5329-4eff-b0bd-dc85dcc88658";
const DEBUG_MODE_SESSION_ID = "d20741";

function debugLog(hypothesisId, location, message, data = {}, runId = "initial") {
  // #region agent log
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      id,
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}

function debugModeLog(hypothesisId, location, message, data = {}, runId = "investigate-1") {
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // #region agent log
  fetch(DEBUG_MODE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_MODE_SESSION_ID
    },
    body: JSON.stringify({
      sessionId: DEBUG_MODE_SESSION_ID,
      id,
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}

function normalizeSettings(settings) {
  const safeSettings = { ...DEFAULT_SETTINGS, ...settings };
  if (!Array.isArray(safeSettings.customSelectors)) {
    safeSettings.customSelectors = [];
  }

  safeSettings.customSelectors = safeSettings.customSelectors
    .filter((selector) => typeof selector === "string")
    .map((selector) => selector.trim())
    .filter(Boolean);

  if (typeof safeSettings.mailListWidthPreset !== "string") {
    const parsedMaxWidth = Number(safeSettings.mailListMaxWidth);
    if (Number.isFinite(parsedMaxWidth)) {
      if (parsedMaxWidth <= 0) {
        safeSettings.mailListWidthPreset = "off";
      } else if (parsedMaxWidth <= 1000) {
        safeSettings.mailListWidthPreset = "small";
      } else if (parsedMaxWidth <= 1300) {
        safeSettings.mailListWidthPreset = "medium";
      } else {
        safeSettings.mailListWidthPreset = "large";
      }
    } else {
      safeSettings.mailListWidthPreset = DEFAULT_SETTINGS.mailListWidthPreset;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(MAIL_LIST_WIDTH_PRESETS, safeSettings.mailListWidthPreset)) {
    if (safeSettings.mailListWidthPreset === "wide") {
      safeSettings.mailListWidthPreset = "large";
    }
  }

  if (!Object.prototype.hasOwnProperty.call(MAIL_LIST_WIDTH_PRESETS, safeSettings.mailListWidthPreset)) {
    safeSettings.mailListWidthPreset = DEFAULT_SETTINGS.mailListWidthPreset;
  }

  delete safeSettings.mailListMaxWidth;
  delete safeSettings.hideLeftSidebar;

  return safeSettings;
}

function clearManagedElements() {
  for (const element of managedElements) {
    element.classList.remove("guc-hidden");
  }
  managedElements.clear();
}

function clearManagedWidthElements() {
  for (const element of managedWidthElements) {
    element.style.removeProperty("max-width");
    element.style.removeProperty("margin-left");
    element.style.removeProperty("margin-right");
    element.style.removeProperty("margin-top");
    element.style.removeProperty("margin-bottom");
    element.style.removeProperty("width");
    element.style.removeProperty("min-width");
    element.style.removeProperty("height");
    element.style.removeProperty("min-height");
    element.style.removeProperty("max-height");
    element.style.removeProperty("flex");
    element.style.removeProperty("align-self");
    element.style.removeProperty("overflow");
    element.style.removeProperty("overflow-x");
    element.style.removeProperty("justify-content");
    element.style.removeProperty("flex-direction");
    element.style.removeProperty("display");
  }
  managedWidthElements.clear();
}

function clearManagedSearchBarElements() {
  for (const element of managedSearchBarElements) {
    element.style.removeProperty("margin-left");
    element.style.removeProperty("margin-right");
    element.style.removeProperty("left");
    element.style.removeProperty("right");
    element.style.removeProperty("transform");
    element.style.removeProperty("position");
    element.style.removeProperty("width");
    element.style.removeProperty("max-width");
  }
  managedSearchBarElements.clear();
}

function clearManagedMinifiedSearchBarElements() {
  document.body?.classList.remove("guc-minify-search-bar-mode");
  for (const element of managedMinifiedSearchBarElements) {
    element.classList.remove("guc-search-bar-minified");
  }
  managedMinifiedSearchBarElements.clear();
}

function clearManagedLeftSidebarElements() {
  document.body?.classList.remove("guc-left-sidebar-hover-mode");
  for (const element of managedLeftSidebarElements) {
    element.classList.remove("guc-left-sidebar-fade-target");
  }
  managedLeftSidebarElements.clear();
}

function clearManagedTopRightIconElements() {
  document.body?.classList.remove("guc-top-right-icons-collapsed-mode");
  document.body?.classList.remove("guc-top-right-icons-expanded");
  if (topRightCollapseTimer) {
    clearTimeout(topRightCollapseTimer);
    topRightCollapseTimer = null;
  }
  for (const element of managedTopRightIconElements) {
    element.classList.remove("guc-top-right-icon-collapsible");
  }
  managedTopRightIconElements.clear();
  if (topRightLauncherButton instanceof HTMLElement) {
    topRightLauncherButton.classList.add("guc-hidden");
  }
}

function clearManagedComposeButtonElements() {
  document.body?.classList.remove("guc-floating-compose-mode");
  for (const element of managedComposeButtonElements) {
    element.classList.remove("guc-compose-hidden");
  }
  managedComposeButtonElements.clear();
}

function setTopRightExpanded(expanded) {
  if (!document.body) {
    return;
  }
  if (expanded) {
    document.body.classList.add("guc-top-right-icons-expanded");
  } else {
    document.body.classList.remove("guc-top-right-icons-expanded");
  }
}

function scheduleTopRightCollapse() {
  if (topRightCollapseTimer) {
    clearTimeout(topRightCollapseTimer);
  }
  topRightCollapseTimer = setTimeout(() => {
    topRightCollapseTimer = null;
    setTopRightExpanded(false);
  }, 180);
}

function bindTopRightHoverHandlers(element) {
  if (!(element instanceof HTMLElement) || element.dataset.gucTopRightBound === "1") {
    return;
  }
  element.addEventListener("mouseenter", () => {
    if (topRightCollapseTimer) {
      clearTimeout(topRightCollapseTimer);
      topRightCollapseTimer = null;
    }
    setTopRightExpanded(true);
  });
  element.addEventListener("mouseleave", () => {
    scheduleTopRightCollapse();
  });
  element.dataset.gucTopRightBound = "1";
}

function centerSearchBar() {
  const targets = Array.from(document.querySelectorAll("form[role='search']"))
    .filter((node) => node instanceof HTMLElement);

  for (const element of targets) {
    element.style.setProperty("margin-left", "auto", "important");
    element.style.setProperty("margin-right", "auto", "important");
    element.style.setProperty("left", "0", "important");
    element.style.setProperty("right", "0", "important");
    managedSearchBarElements.add(element);
  }
}

function applyMinifiedSearchBarMode() {
  const forms = Array.from(document.querySelectorAll("form[role='search']"))
    .filter((node) => node instanceof HTMLElement);

  if (forms.length === 0) {
    return;
  }

  document.body?.classList.add("guc-minify-search-bar-mode");
  for (const form of forms) {
    if (!form.querySelector("input[aria-label='Search mail'], input[aria-label*='Search in mail']")) {
      continue;
    }
    form.classList.add("guc-search-bar-minified");
    managedMinifiedSearchBarElements.add(form);
  }
}

function hideBySelectors(selectors, sourceKey = "unknown") {
  for (const selector of selectors) {
    let nodes = [];
    try {
      nodes = document.querySelectorAll(selector);
    } catch (error) {
      console.warn("Skipping invalid selector", selector, error);
      continue;
    }

    if (sourceKey === "hideAddonSidebar") {
      debugLog("H2", "content.js:95", "Sidebar selector match count", {
        selector,
        matchCount: nodes.length
      });
    }

    for (const node of nodes) {
      node.classList.add("guc-hidden");
      managedElements.add(node);

      if (sourceKey === "hideAddonSidebar") {
        const parent = node.parentElement;
        debugLog("H4", "content.js:108", "Sidebar node hidden with parent context", {
          selector,
          nodeTag: node.tagName,
          nodeClass: node.className || "",
          nodeAriaLabel: node.getAttribute("aria-label") || "",
          nodeGh: node.getAttribute("gh") || "",
          parentTag: parent?.tagName || "",
          parentClass: parent?.className || "",
          parentAriaLabel: parent?.getAttribute("aria-label") || "",
          nodeWidth: Math.round(node.getBoundingClientRect().width),
          parentWidth: Math.round(parent?.getBoundingClientRect().width || 0)
        });

        if ((node.getAttribute("aria-label") || "").includes("Side panel") && parent) {
          parent.classList.add("guc-hidden");
          managedElements.add(parent);
          debugLog("H7", "content.js:127", "Hid side panel parent container", {
            parentTag: parent.tagName,
            parentClass: parent.className || "",
            parentWidthAfterHide: Math.round(parent.getBoundingClientRect().width || 0)
          }, "post-fix");
        }
      }
    }
  }
}

function applyCustomizations(settings) {
  try {
    clearManagedElements();
    clearManagedWidthElements();
    clearManagedSearchBarElements();
    clearManagedComposeButtonElements();
    clearManagedLeftSidebarElements();
    clearManagedTopRightIconElements();
    debugLog("H1", "content.js:128", "Applying customization settings", {
      hideAddonSidebar: Boolean(settings.hideAddonSidebar),
      hideLogo: Boolean(settings.hideLogo),
      hideFooter: Boolean(settings.hideFooter),
      hideSearchBar: Boolean(settings.hideSearchBar),
      floatingComposeButton: Boolean(settings.floatingComposeButton),
      minifySearchBar: Boolean(settings.minifySearchBar),
      collapseTopRightIcons: Boolean(settings.collapseTopRightIcons),
      centerSearchBar: Boolean(settings.centerSearchBar),
      mailListWidthPreset: settings.mailListWidthPreset,
      shrinkMailListHeight: Boolean(settings.shrinkMailListHeight)
    });

    for (const [key, selectors] of Object.entries(SELECTOR_CONFIG)) {
      if (settings[key]) {
        if (key === "hideAddonSidebar") {
          debugLog("H3", "content.js:137", "Applying sidebar selectors", {
            selectorCount: selectors.length,
            selectors
          });
        }
        hideBySelectors(selectors, key);
      }
    }

    if (settings.customSelectors.length > 0) {
      hideBySelectors(settings.customSelectors, "customSelectors");
    }

    if (settings.centerSearchBar && !settings.hideSearchBar) {
      centerSearchBar();
    }

    if (settings.minifySearchBar && !settings.hideSearchBar) {
      applyMinifiedSearchBarMode();
    } else {
      clearManagedMinifiedSearchBarElements();
    }

    if (settings.hideLeftSidebarOnHover) {
      applyLeftSidebarHoverMode();
    }

    if (settings.floatingComposeButton) {
      applyFloatingComposeButtonMode();
    } else {
      ensureFloatingComposeButton().classList.add("guc-hidden");
    }

    if (settings.collapseTopRightIcons) {
      applyTopRightIconCollapseMode();
    }

    applyMailListWidth(settings.mailListWidthPreset, settings.shrinkMailListHeight);
  } catch (error) {
    console.error("Minimail: applyCustomizations failed", error);
  }
}

function findComposeTargets() {
  const targets = new Set();
  const selectors = [
    "div[gh='cm']",
    "button[gh='cm']",
    "div[role='button'][gh='cm']",
    "div[role='button'][data-tooltip*='Compose']",
    "button[aria-label*='Compose']",
    "div[role='button'][aria-label*='Compose']"
  ];

  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (node.id === "guc-floating-compose-button" || node.closest("#guc-floating-compose-button")) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (rect.left > (window.innerWidth || 0) * 0.5) {
        continue;
      }
      targets.add(node);
    }
  }

  return Array.from(targets);
}

function updateFloatingComposeButtonAppearance(button, composeTargets) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.innerHTML = FLOATING_COMPOSE_ICON_SVG;

  const composeSource = composeTargets.find((node) => node instanceof HTMLElement) || null;
  if (!(composeSource instanceof HTMLElement)) {
    button.style.removeProperty("color");
    return;
  }

  const iconColor =
    window.getComputedStyle(composeSource).color || "";
  if (iconColor) {
    button.style.setProperty("color", iconColor);
  } else {
    button.style.removeProperty("color");
  }
}

function openComposeWindow() {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
  ) {
    active.blur();
  }

  window.focus();
  document.body?.focus?.();

  const keyboardEventInit = {
    key: "c",
    code: "KeyC",
    keyCode: 67,
    which: 67,
    charCode: 99,
    bubbles: true,
    cancelable: true
  };

  for (const target of [document, window]) {
    target.dispatchEvent(new KeyboardEvent("keydown", keyboardEventInit));
    target.dispatchEvent(new KeyboardEvent("keypress", keyboardEventInit));
    target.dispatchEvent(new KeyboardEvent("keyup", keyboardEventInit));
  }
}

function ensureFloatingComposeButton() {
  const existing = document.getElementById("guc-floating-compose-button");
  if (existing instanceof HTMLButtonElement) {
    return existing;
  }

  const button = document.createElement("button");
  button.id = "guc-floating-compose-button";
  button.type = "button";
  button.setAttribute("aria-label", "Compose new email");
  button.setAttribute("title", "Compose");
  button.textContent = "+";
  button.classList.add("guc-hidden");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openComposeWindow();
  });
  document.body.appendChild(button);
  return button;
}

function applyFloatingComposeButtonMode() {
  document.body?.classList.add("guc-floating-compose-mode");
  const targets = findComposeTargets();
  const floatingButton = ensureFloatingComposeButton();
  updateFloatingComposeButtonAppearance(floatingButton, targets);
  for (const target of targets) {
    target.classList.add("guc-compose-hidden");
    managedComposeButtonElements.add(target);
  }
  floatingButton.classList.remove("guc-hidden");
}

function isPlausibleLeftSidebarRect(rect) {
  if (!rect || rect.height < 160) {
    return false;
  }
  // Avoid matching wide regions (e.g. main content mistakenly using role="navigation").
  if (rect.width < 40 || rect.width > 480) {
    return false;
  }
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  if (vw > 0 && rect.left > vw * 0.5) {
    return false;
  }
  return true;
}

function findLeftSidebarTargets() {
  const targets = new Set();

  // Prefer known Gmail left-rail containers when present (narrow + on the left).
  for (const selector of ["div.aeN", "div[gh='ms']"]) {
    const candidates = document.querySelectorAll(selector);
    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (isPlausibleLeftSidebarRect(rect)) {
        targets.add(node);
      }
    }
  }

  if (targets.size > 0) {
    return Array.from(targets);
  }

  const navNodes = Array.from(document.querySelectorAll("div[role='navigation']")).filter(
    (node) => node instanceof HTMLElement
  );
  for (const navNode of navNodes) {
    const navContainer =
      navNode.closest("div[gh='mtb'], div[gh='ms'], div.aeN") || navNode;
    if (navContainer instanceof HTMLElement) {
      const rect = navContainer.getBoundingClientRect();
      if (isPlausibleLeftSidebarRect(rect)) {
        targets.add(navContainer);
      }
    }
  }
  return Array.from(targets);
}

function applyLeftSidebarHoverMode() {
  const targets = findLeftSidebarTargets();
  if (targets.length === 0) {
    return;
  }
  document.body?.classList.add("guc-left-sidebar-hover-mode");
  for (const target of targets) {
    target.classList.add("guc-left-sidebar-fade-target");
    managedLeftSidebarElements.add(target);
  }
}

function findTopRightIconTargets() {
  const targets = new Set();
  const iconSelectors = [
    "a[aria-label*='Help']",
    "button[aria-label*='Help']",
    "a[aria-label*='Support']",
    "button[aria-label*='Support']",
    "a[aria-label*='Settings']",
    "button[aria-label*='Settings']",
    "a[aria-label*='Gemini']",
    "button[aria-label*='Gemini']",
    "a[aria-label*='Google apps']",
    "button[aria-label*='Google apps']",
    "[data-tooltip*='Help']",
    "[data-tooltip*='Settings']",
    "[data-tooltip*='Gemini']"
  ];

  for (const selector of iconSelectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || !node.isConnected) {
        continue;
      }
      if (
        node.id === "guc-top-right-launcher" ||
        node.id === "guc-settings-button" ||
        node.closest("#guc-top-right-launcher") ||
        node.closest("#guc-settings-anchor")
      ) {
        continue;
      }
      const clickableNode = node.closest("button, a, [role='button']") || node;
      if (!(clickableNode instanceof HTMLElement)) {
        continue;
      }
      const rect = clickableNode.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (rect.top > 140 || rect.left < (window.innerWidth || 0) * 0.55) {
        continue;
      }
      targets.add(clickableNode);
    }
  }

  return Array.from(targets);
}

function applyTopRightIconCollapseMode() {
  if (topRightLauncherButton instanceof HTMLElement) {
    topRightLauncherButton.classList.remove("guc-hidden");
  }
  const targets = findTopRightIconTargets();
  if (targets.length === 0) {
    return;
  }
  document.body?.classList.add("guc-top-right-icons-collapsed-mode");
  setTopRightExpanded(false);
  for (const target of targets) {
    target.classList.add("guc-top-right-icon-collapsible");
    managedTopRightIconElements.add(target);
    bindTopRightHoverHandlers(target);
  }
  if (topRightLauncherButton) {
    bindTopRightHoverHandlers(topRightLauncherButton);
  }
}

function findMailListWidthTargets() {
  const selectorCandidates = [
    ".bkK > .nH",
    "div[role='main'] .aeF",
    "div[role='main']",
    "div[role='main'] [gh='tl']"
  ];
  const toolbarSelectors = ["[role='toolbar']", "[gh='tm']", ".G-atb", ".aqK"];

  for (const selector of selectorCandidates) {
    const elements = Array.from(document.querySelectorAll(selector))
      .filter((node) => node instanceof HTMLElement)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const containsList = Boolean(node.querySelector("[gh='tl']"));
        const containsToolbar = toolbarSelectors.some((toolbarSelector) =>
          Boolean(node.querySelector(toolbarSelector))
        );
        return {
          node,
          width: rect.width,
          height: rect.height,
          containsList,
          containsToolbar
        };
      })
      .filter((item) => item.width > 300 && item.height > 200);

    const preferred = elements.filter((item) => item.containsList && item.containsToolbar);
    const listFallback = elements.filter((item) => item.containsList);
    // In opened-thread view Gmail can remove/hide the list container.
    // Keep the configured width by falling back to toolbar-bearing main panes.
    const threadViewFallback = elements.filter((item) => item.containsToolbar);
    const chosen = (
      preferred.length > 0
        ? preferred
        : listFallback.length > 0
          ? listFallback
          : threadViewFallback
    ).map((item) => item.node);
    if (chosen.length > 0) {
      return chosen;
    }
  }

  return [];
}

function applyMailListWidth(widthPreset, shrinkHeight) {
  const widthValue = MAIL_LIST_WIDTH_PRESETS[widthPreset];
  if (!Number.isFinite(widthValue) || widthValue <= 0) {
    return;
  }
  debugModeLog("H1", "content.js:applyMailListWidth.entry", "Entered applyMailListWidth", {
    widthPreset,
    widthValue,
    shrinkHeight
  });

  const targets = findMailListWidthTargets();
  for (const element of targets) {
    const threadList = element.querySelector("[gh='tl']");
    let visualSectionTarget = null;
    const visualCandidates = [];
    if (threadList instanceof HTMLElement) {
      let current = threadList;
      let depth = 0;
      while (current && current instanceof HTMLElement && depth < 10) {
        const computed = window.getComputedStyle(current);
        const bg = computed.backgroundColor;
        const hasToolbar = Boolean(current.querySelector("[role='toolbar'], [gh='tm'], .G-atb, .aqK"));
        const isNonTransparentBg = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
        visualCandidates.push({
          depth,
          tag: current.tagName,
          className: current.className || "",
          bg,
          hasToolbar,
          width: Math.round(current.getBoundingClientRect().width),
          height: Math.round(current.getBoundingClientRect().height)
        });
        if (!visualSectionTarget && isNonTransparentBg && hasToolbar) {
          visualSectionTarget = current;
        }
        if (!visualSectionTarget && isNonTransparentBg) {
          visualSectionTarget = current;
        }
        if (current === element) {
          break;
        }
        current = current.parentElement;
        depth += 1;
      }
    }

    let structuralSectionTarget = null;
    const bkKnHCandidates = Array.from(document.querySelectorAll(".bkK > .nH")).filter(
      (node) => node instanceof HTMLElement
    );

    if (threadList instanceof HTMLElement) {
      structuralSectionTarget = bkKnHCandidates.find(
        (candidate) => candidate.contains(threadList)
      ) || null;

      structuralSectionTarget =
        structuralSectionTarget ||
        threadList.closest("div.nH") ||
        threadList.closest("div.AO") ||
        threadList.closest("div.Tm") ||
        threadList.closest("div.aeF");
    } else {
      // Opened email view fallback: explicitly anchor to Gmail's primary content pane.
      structuralSectionTarget =
        (element.matches(".bkK > .nH") ? element : null) ||
        bkKnHCandidates.find((candidate) => candidate.contains(element) || element.contains(candidate)) ||
        element.closest(".bkK > .nH") ||
        element.closest("div.nH") ||
        element.closest("div.AO") ||
        element.closest("div.Tm") ||
        element.closest("div.aeF");
    }

    const widthTarget = structuralSectionTarget || visualSectionTarget || element;
    const verticalCenterTarget = structuralSectionTarget || widthTarget;
    widthTarget.style.setProperty("max-width", `${widthValue}px`, "important");
    widthTarget.style.setProperty("width", "100%", "important");
    widthTarget.style.setProperty("margin-left", "auto", "important");
    widthTarget.style.setProperty("margin-right", "auto", "important");
    if (shrinkHeight) {
      // Gmail uses nested flex containers that can force full-height.
      // Apply shrink styles across the local container chain.
      const shrinkTargets = new Set([widthTarget]);
      if (threadList instanceof HTMLElement) {
        let current = threadList;
        let depth = 0;
        while (current && current instanceof HTMLElement && depth < 6) {
          shrinkTargets.add(current);
          if (current === widthTarget) {
            break;
          }
          current = current.parentElement;
          depth += 1;
        }
      }
      const forcingSelectors = [
        "div.Nr.UI.S2.vy",
        "div.Nr.UI.S2.vy > div.Nu.tf.aZ6",
        "body > div.tVu25 > div.nH > div > div.nH.aqk.aql.bkL > div.nH.bkK > div"
      ];
      for (const forcingSelector of forcingSelectors) {
        const forcingContainer =
          widthTarget.closest(forcingSelector) ||
          document.querySelector(forcingSelector);
        if (forcingContainer instanceof HTMLElement) {
          shrinkTargets.add(forcingContainer);
        }
      }
      debugModeLog("H2", "content.js:applyMailListWidth.shrinkTargets", "Shrink targets resolved", {
        shrinkTargetCount: shrinkTargets.size,
        forcingSelectors,
        widthTargetClass: widthTarget.className || "",
        widthTargetTag: widthTarget.tagName
      });

      for (const shrinkTarget of shrinkTargets) {
        const preRect = shrinkTarget.getBoundingClientRect();
        const preComputed = window.getComputedStyle(shrinkTarget);
        // Keep shrink-height from expanding horizontal flex width, but preserve
        // the chosen width preset on the actual width target.
        if (shrinkTarget === widthTarget) {
          shrinkTarget.style.setProperty("width", "100%", "important");
          shrinkTarget.style.setProperty("max-width", `${widthValue}px`, "important");
        } else {
          shrinkTarget.style.setProperty("width", "100%", "important");
          shrinkTarget.style.setProperty("max-width", "100%", "important");
        }
        shrinkTarget.style.setProperty("min-width", "0", "important");
        shrinkTarget.style.setProperty("height", "fit-content", "important");
        shrinkTarget.style.setProperty("min-height", "0", "important");
        shrinkTarget.style.setProperty("max-height", "100vh", "important");
        shrinkTarget.style.setProperty("flex", "0 0 auto", "important");
        shrinkTarget.style.setProperty("align-self", "stretch", "important");
        shrinkTarget.style.setProperty("overflow", "auto", "important");
        shrinkTarget.style.setProperty("overflow-x", "hidden", "important");
        managedWidthElements.add(shrinkTarget);
        const postRect = shrinkTarget.getBoundingClientRect();
        const postComputed = window.getComputedStyle(shrinkTarget);
        debugModeLog("H3", "content.js:applyMailListWidth.shrinkTargetApplied", "Applied shrink styles to target", {
          isWidthTarget: shrinkTarget === widthTarget,
          tag: shrinkTarget.tagName,
          className: shrinkTarget.className || "",
          preWidth: Math.round(preRect.width),
          postWidth: Math.round(postRect.width),
          preScrollWidth: shrinkTarget.scrollWidth,
          postScrollWidth: shrinkTarget.scrollWidth,
          preClientWidth: shrinkTarget.clientWidth,
          postClientWidth: shrinkTarget.clientWidth,
          preDisplay: preComputed.display,
          postDisplay: postComputed.display,
          preFlex: preComputed.flex,
          postFlex: postComputed.flex,
          postMaxWidth: postComputed.maxWidth,
          postWidthStyle: postComputed.width
        });
      }

      // Center vertically on the container that owns the available height.
      const centerContainerSelectors = [
        "body > div.tVu25 > div.nH > div > div.nH.aqk.aql.bkL > div.nH.bkK > div",
        "div.nH.bkK > div",
        "div.Nr.UI.S2.vy"
      ];
      let centerContainer = null;
      for (const selector of centerContainerSelectors) {
        const candidates = Array.from(document.querySelectorAll(selector)).filter(
          (node) => node instanceof HTMLElement
        );
        centerContainer = candidates.find(
          (candidate) =>
            candidate.contains(widthTarget) ||
            (threadList instanceof HTMLElement && candidate.contains(threadList))
        ) || null;
        if (centerContainer) {
          break;
        }
      }
      if (centerContainer instanceof HTMLElement) {
        const centerPre = window.getComputedStyle(centerContainer);
        centerContainer.style.setProperty("display", "flex", "important");
        centerContainer.style.setProperty("flex-direction", "column", "important");
        centerContainer.style.setProperty("justify-content", "center", "important");
        centerContainer.style.setProperty("align-items", "stretch", "important");
        centerContainer.style.setProperty("min-height", "0", "important");
        centerContainer.style.setProperty("max-height", "100vh", "important");
        centerContainer.style.setProperty("overflow", "auto", "important");
        managedWidthElements.add(centerContainer);
        if (verticalCenterTarget instanceof HTMLElement) {
          verticalCenterTarget.style.setProperty("margin-top", "auto", "important");
          verticalCenterTarget.style.setProperty("margin-bottom", "auto", "important");
          verticalCenterTarget.style.setProperty("align-self", "center", "important");
          verticalCenterTarget.style.setProperty("width", "100%", "important");
          verticalCenterTarget.style.setProperty("max-width", `${widthValue}px`, "important");
          managedWidthElements.add(verticalCenterTarget);
        }
        const centerPost = window.getComputedStyle(centerContainer);
        const centerRect = centerContainer.getBoundingClientRect();
        debugModeLog("H4", "content.js:applyMailListWidth.centerContainer", "Center container styles applied", {
          selectorMatched: centerContainerSelectors.find((selector) => centerContainer.matches(selector)) || "unknown",
          tag: centerContainer.tagName,
          className: centerContainer.className || "",
          width: Math.round(centerRect.width),
          scrollWidth: centerContainer.scrollWidth,
          clientWidth: centerContainer.clientWidth,
          preDisplay: centerPre.display,
          postDisplay: centerPost.display,
          postJustifyContent: centerPost.justifyContent,
          postOverflowX: centerPost.overflowX
        });
      }
    }
    managedWidthElements.add(widthTarget);

    const ancestorChain = [];
    let current = element;
    for (let depth = 0; depth < 6 && current?.parentElement; depth += 1) {
      current = current.parentElement;
      const computed = window.getComputedStyle(current);
      ancestorChain.push({
        depth: depth + 1,
        tag: current.tagName,
        className: current.className || "",
        gh: current.getAttribute("gh") || "",
        role: current.getAttribute("role") || "",
        bg: computed.backgroundColor,
        width: Math.round(current.getBoundingClientRect().width),
        hasList: Boolean(current.querySelector("[gh='tl']")),
        hasToolbar: Boolean(current.querySelector("[role='toolbar'], [gh='tm'], .G-atb, .aqK"))
      });
    }
  }
}

function findHelpButton() {
  const helpSelectors = [
    "a[aria-label*='Help']",
    "button[aria-label*='Help']",
    "div[aria-label*='Help']",
    "a[aria-label*='Support']",
    "button[aria-label*='Support']",
    "div[aria-label*='Support']",
    "[data-tooltip*='Help']",
    "[data-tooltip*='Support']",
    "a[href*='support.google.com']"
  ];
  const helpCandidates = document.querySelectorAll(helpSelectors.join(","));
  const helpButton = Array.from(helpCandidates).find((candidate) => {
    if (!candidate || !candidate.isConnected || !candidate.parentElement) {
      return false;
    }

    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (helpButton) {
    const clickableHelpNode =
      helpButton.closest("button, a, [role='button']") || helpButton;
    return clickableHelpNode;
  }

  return null;
}

function getPopoverFieldValue(id) {
  const node = settingsPopover?.querySelector(`#${id}`);
  if (!node) {
    return false;
  }
  return node.checked;
}

function syncSearchBarControlState() {
  if (!settingsPopover) {
    return;
  }

  const hideSearchBarNode = settingsPopover.querySelector("#guc-hideSearchBar");
  const centerSearchBarNode = settingsPopover.querySelector("#guc-centerSearchBar");
  const minifySearchBarNode = settingsPopover.querySelector("#guc-minifySearchBar");
  if (!hideSearchBarNode || !centerSearchBarNode || !minifySearchBarNode) {
    return;
  }

  const shouldDisableSearchBarSettings = Boolean(hideSearchBarNode.checked);
  centerSearchBarNode.disabled = shouldDisableSearchBarSettings;
  minifySearchBarNode.disabled = shouldDisableSearchBarSettings;
  if (shouldDisableSearchBarSettings) {
    centerSearchBarNode.checked = false;
    minifySearchBarNode.checked = false;
  }
}

function fillPopover(settings) {
  if (!settingsPopover) {
    return;
  }

  const checkboxKeys = [
    "hideLogo",
    "hideAddonSidebar",
    "hideFooter",
    "hideSearchBar",
    "floatingComposeButton",
    "minifySearchBar",
    "collapseTopRightIcons",
    "hideLeftSidebarOnHover",
    "centerSearchBar",
    "shrinkMailListHeight"
  ];
  for (const key of checkboxKeys) {
    const node = settingsPopover.querySelector(`#guc-${key}`);
    if (node) {
      node.checked = Boolean(settings[key]);
    }
  }

  const widthPresetNode = settingsPopover.querySelector(`#guc-width-${settings.mailListWidthPreset}`);
  if (widthPresetNode) {
    widthPresetNode.checked = true;
  }

  syncSearchBarControlState();
}

function setPopoverStatus(message, isError = false) {
  if (!settingsPopover) {
    return;
  }

  const status = settingsPopover.querySelector("#guc-status");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.style.color = isError ? "#d93025" : "#188038";
}

function readPopoverSettings() {
  const widthPresetInput = settingsPopover?.querySelector("input[name='guc-mailListWidthPreset']:checked");
  const mailListWidthPreset = widthPresetInput
    ? widthPresetInput.value
    : DEFAULT_SETTINGS.mailListWidthPreset;
  const hideSearchBar = getPopoverFieldValue("guc-hideSearchBar");
  const nextSettings = {
    hideLogo: getPopoverFieldValue("guc-hideLogo"),
    hideAddonSidebar: getPopoverFieldValue("guc-hideAddonSidebar"),
    hideFooter: getPopoverFieldValue("guc-hideFooter"),
    hideSearchBar,
    floatingComposeButton: getPopoverFieldValue("guc-floatingComposeButton"),
    minifySearchBar: hideSearchBar ? false : getPopoverFieldValue("guc-minifySearchBar"),
    collapseTopRightIcons: getPopoverFieldValue("guc-collapseTopRightIcons"),
    hideLeftSidebarOnHover: getPopoverFieldValue("guc-hideLeftSidebarOnHover"),
    centerSearchBar: hideSearchBar ? false : getPopoverFieldValue("guc-centerSearchBar"),
    shrinkMailListHeight: getPopoverFieldValue("guc-shrinkMailListHeight"),
    mailListWidthPreset,
    customSelectors: []
  };

  return normalizeSettings(nextSettings);
}

async function saveAndApplyPopoverSettings() {
  try {
    const nextSettings = readPopoverSettings();
    await chrome.storage.sync.set(nextSettings);
    latestSettings = nextSettings;
    applyCustomizations(latestSettings);
    setPopoverStatus("");
  } catch (error) {
    console.error("Failed to save settings", error);
    setPopoverStatus("Failed to save settings.", true);
  }
}

async function restorePopoverDefaults() {
  try {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    latestSettings = { ...DEFAULT_SETTINGS };
    fillPopover(latestSettings);
    applyCustomizations(latestSettings);
    setPopoverStatus("");
  } catch (error) {
    console.error("Failed to restore defaults", error);
    setPopoverStatus("Failed to restore defaults.", true);
  }
}

function hidePopover() {
  if (settingsPopover) {
    settingsPopover.classList.add("guc-hidden");
  }
}

function togglePopover(event) {
  event?.stopPropagation();
  if (settingsPopover) {
    settingsPopover.classList.toggle("guc-hidden");
    setPopoverStatus("");
  }
}

function buildSettingsPopover() {
  const popover = document.createElement("div");
  popover.id = "guc-settings-popover";
  popover.classList.add("guc-hidden");
  popover.innerHTML = `
    <h3 class="guc-title">Minimail</h3>
    <section class="guc-section">
      <h4 class="guc-section-title">Hide Elements</h4>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-hideLogo" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Hide Gmail logo</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-hideAddonSidebar" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Hide add-on sidebar</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-hideFooter" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Hide footer</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-floatingComposeButton" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Use floating compose button</span>
      </label>
    </section>
    <section class="guc-section">
      <h4 class="guc-section-title">Search Bar</h4>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-hideSearchBar" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Hide search bar</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-centerSearchBar" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Center search bar</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-minifySearchBar" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Minify search bar until hover</span>
      </label>
    </section>
    <section class="guc-section">
      <h4 class="guc-section-title">Layout</h4>
      <div class="guc-field guc-field-width">
        <span class="guc-width-label">Mail list width</span>
        <div class="guc-segmented" role="radiogroup" aria-label="Mail list width">
          <label class="guc-segment">
            <input id="guc-width-off" name="guc-mailListWidthPreset" type="radio" value="off" />
            <span>Off</span>
          </label>
          <label class="guc-segment">
            <input id="guc-width-small" name="guc-mailListWidthPreset" type="radio" value="small" />
            <span>Small</span>
          </label>
          <label class="guc-segment">
            <input id="guc-width-medium" name="guc-mailListWidthPreset" type="radio" value="medium" />
            <span>Medium</span>
          </label>
          <label class="guc-segment">
            <input id="guc-width-large" name="guc-mailListWidthPreset" type="radio" value="large" />
            <span>Large</span>
          </label>
        </div>
      </div>
    </section>
    <section class="guc-section">
      <h4 class="guc-section-title">Experimental</h4>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-collapseTopRightIcons" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Collapse top-right utility icons</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-hideLeftSidebarOnHover" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Hide left sidebar until hover</span>
      </label>
      <label class="guc-field">
        <span class="guc-switch">
          <input id="guc-shrinkMailListHeight" type="checkbox" />
          <span class="guc-switch-track" aria-hidden="true"></span>
        </span>
        <span class="guc-label-text">Shrink mail list height</span>
      </label>
    </section>
    <div class="guc-actions">
      <button id="guc-restore-defaults" type="button">Restore defaults</button>
      <a
        id="guc-donate-button"
        href="https://buymeacoffee.com/cteerakit"
        target="_blank"
        rel="noopener noreferrer"
      >
        Donate
      </a>
    </div>
    <p class="guc-status" id="guc-status"></p>
  `;

  popover
    .querySelector("#guc-restore-defaults")
    ?.addEventListener("click", restorePopoverDefaults);

  popover
    .querySelector("#guc-hideSearchBar")
    ?.addEventListener("change", () => {
      syncSearchBarControlState();
    });

  for (const key of [
    "hideLogo",
    "hideAddonSidebar",
    "hideFooter",
    "hideSearchBar",
    "floatingComposeButton",
    "minifySearchBar",
    "collapseTopRightIcons",
    "hideLeftSidebarOnHover",
    "centerSearchBar",
    "shrinkMailListHeight"
  ]) {
    popover
      .querySelector(`#guc-${key}`)
      ?.addEventListener("change", saveAndApplyPopoverSettings);
  }
  for (const key of ["off", "small", "medium", "large"]) {
    popover
      .querySelector(`#guc-width-${key}`)
      ?.addEventListener("change", saveAndApplyPopoverSettings);
  }

  return popover;
}

function ensureSettingsButton() {
  const helpButton = findHelpButton();
  if (!helpButton || !helpButton.parentElement) {
    ensureTopRightLauncher(null);
    debugLog("H6", "content.js:290", "Help button not found yet", {
      readyState: document.readyState
    });
    return;
  }
  debugLog("H6", "content.js:295", "Help button found", {
    tag: helpButton.tagName,
    ariaLabel: helpButton.getAttribute("aria-label") || ""
  });

  const existing = document.getElementById("guc-settings-anchor");
  ensureTopRightLauncher(helpButton);
  if (existing) {
    const existingButton = existing.querySelector("#guc-settings-button");
    if (existingButton) {
      settingsButton = existingButton;
      if (!settingsButton.dataset.gucClickBound) {
        settingsButton.addEventListener("click", togglePopover);
        settingsButton.dataset.gucClickBound = "1";
      }
    } else {
      settingsButton = null;
    }
    settingsPopover = existing.querySelector("#guc-settings-popover");
    const existingRect = existing.getBoundingClientRect();
    if (existingRect.width > 0 && existingRect.height > 0) {
      return;
    }
    existing.remove();
    settingsButton = null;
    settingsPopover = null;
  }

  const anchor = document.createElement("div");
  anchor.id = "guc-settings-anchor";

  settingsButton = document.createElement("button");
  settingsButton.id = "guc-settings-button";
  settingsButton.type = "button";
  settingsButton.innerHTML = SETTINGS_BUTTON_ICON_SVG;
  settingsButton.setAttribute("aria-label", "Open Gmail UI customizer settings");
  settingsButton.addEventListener("click", togglePopover);
  settingsButton.dataset.gucClickBound = "1";

  settingsPopover = buildSettingsPopover();
  fillPopover(latestSettings);

  anchor.appendChild(settingsButton);
  anchor.appendChild(settingsPopover);
  helpButton.insertAdjacentElement("beforebegin", anchor);

  if (!globalDocumentClickBound) {
    document.addEventListener("click", (event) => {
      const currentAnchor = document.getElementById("guc-settings-anchor");
      const containsTarget = Boolean(currentAnchor && currentAnchor.contains(event.target));
      if (!containsTarget) {
        hidePopover();
      }
    });
    globalDocumentClickBound = true;
  }
}

function ensureTopRightLauncher(helpButton) {
  const existingLauncher = document.getElementById("guc-top-right-launcher");
  if (existingLauncher instanceof HTMLElement) {
    topRightLauncherButton = existingLauncher;
    bindTopRightHoverHandlers(topRightLauncherButton);
    if (latestSettings.collapseTopRightIcons) {
      topRightLauncherButton.classList.remove("guc-hidden");
    } else {
      topRightLauncherButton.classList.add("guc-hidden");
    }
    return;
  }

  const launcher = document.createElement("button");
  launcher.id = "guc-top-right-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Show top-right buttons");
  launcher.setAttribute("title", "Show top-right buttons");
  launcher.textContent = "✓";
  launcher.classList.add("guc-hidden");
  bindTopRightHoverHandlers(launcher);
  topRightLauncherButton = launcher;
  if (helpButton instanceof HTMLElement) {
    helpButton.insertAdjacentElement("beforebegin", launcher);
  } else {
    const fallbackAnchor = document.querySelector(
      "a[aria-label*='Help'], button[aria-label*='Help'], a[aria-label*='Settings'], button[aria-label*='Settings'], a[aria-label*='Gemini'], button[aria-label*='Gemini']"
    );
    if (fallbackAnchor instanceof HTMLElement) {
      fallbackAnchor.insertAdjacentElement("beforebegin", launcher);
    } else {
      const fallbackContainer = document.querySelector("header, div[role='banner'], div[gh='mtb']");
      if (fallbackContainer instanceof HTMLElement) {
        fallbackContainer.appendChild(launcher);
      }
    }
  }
  if (latestSettings.collapseTopRightIcons) {
    launcher.classList.remove("guc-hidden");
  }
}

async function loadSettings() {
  const storageKeys = [...Object.keys(DEFAULT_SETTINGS), "hideLeftSidebar"];
  const settings = await chrome.storage.sync.get(storageKeys);
  if (Object.prototype.hasOwnProperty.call(settings, "hideLeftSidebar")) {
    await chrome.storage.sync.remove("hideLeftSidebar");
    delete settings.hideLeftSidebar;
  }
  latestSettings = normalizeSettings(settings);
  applyCustomizations(latestSettings);
}

function scheduleApplyCustomizationsFromDomMutation() {
  if (applyCustomizationsTimer !== null) {
    clearTimeout(applyCustomizationsTimer);
  }
  applyCustomizationsTimer = setTimeout(() => {
    applyCustomizationsTimer = null;
    applyCustomizations(latestSettings);
  }, 75);
}

function startMutationObserver() {
  if (observer) {
    return;
  }

  observer = new MutationObserver(() => {
    scheduleApplyCustomizationsFromDomMutation();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function startUiObserver() {
  if (uiObserver) {
    return;
  }

  uiObserver = new MutationObserver(() => {
    ensureSettingsButton();
  });

  uiObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }

  const next = { ...latestSettings };
  for (const [key, detail] of Object.entries(changes)) {
    next[key] = detail.newValue;
  }

  latestSettings = normalizeSettings(next);
  applyCustomizations(latestSettings);
  fillPopover(latestSettings);
});

loadSettings().catch((error) => {
  console.error("Failed to load Gmail UI customizer settings", error);
});
startMutationObserver();
ensureSettingsButton();
startUiObserver();
debugLog("H6", "content.js:410", "Content script initialized", {
  url: location.href,
  readyState: document.readyState
});
