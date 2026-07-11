/**
 * Triggers a browser download for a Blob and revokes the object URL afterward.
 * Removes the temporary anchor from the DOM once the click is dispatched.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    // Defer revoke so the browser can start the download first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}
