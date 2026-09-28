export function githubFileMarkdown(label: string, fileUrl: string, isImage: boolean): string {
  if (!isImage) return `[${label}](${fileUrl})`;
  const url = new URL(fileUrl);
  url.searchParams.set('raw', '1');
  return `![${label}](${url.href})`;
}
