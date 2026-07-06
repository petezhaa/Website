// One clipboard write for the whole site: the async API where it exists,
// the hidden-textarea trick where it doesn't (older mobile, http dev).
// Resolves either way, callers just flip their "copied ✓" state.
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    document.body.removeChild(ta);
  }
}
