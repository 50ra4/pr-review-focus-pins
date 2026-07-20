export const getExtensionUrl = (path: string): string =>
  chrome.runtime.getURL(path);
