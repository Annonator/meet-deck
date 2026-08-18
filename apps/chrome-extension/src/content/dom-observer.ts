const OBSERVED_ATTRIBUTES = [
  "aria-disabled",
  "aria-hidden",
  "aria-label",
  "class",
  "disabled",
  "hidden",
  "style"
] as const;

export function observeMeetDom(root: Node, callback: MutationCallback): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(root, {
    attributeFilter: [...OBSERVED_ATTRIBUTES],
    attributes: true,
    childList: true,
    subtree: true
  });
  return observer;
}
