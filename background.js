const DEFAULT_SETTINGS = {
  hideLogo: true,
  hideAddonSidebar: true,
  hideFooter: true,
  hideSearchBar: false,
  floatingComposeButton: false,
  minifySearchBar: true,
  collapseTopRightIcons: true,
  hideLeftSidebarOnHover: false,
  centerSearchBar: true,
  mailListWidthPreset: "small",
  shrinkMailListHeight: false,
  customSelectors: []
};

async function ensureDefaultSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const missingEntries = Object.entries(DEFAULT_SETTINGS).filter(
    ([key]) => stored[key] === undefined
  );

  if (missingEntries.length === 0) {
    return;
  }

  const missingDefaults = Object.fromEntries(missingEntries);
  await chrome.storage.sync.set(missingDefaults);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.error("Failed to initialize default settings", error);
  });
});
