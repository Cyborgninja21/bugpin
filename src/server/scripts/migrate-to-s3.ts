const paths =
  process.env.NODE_ENV === 'development'
    ? ['../../../ee/src/scripts/migrate-to-s3.ts', '../../../ee/dist/scripts/migrate-to-s3.js']
    : ['../../../ee/dist/scripts/migrate-to-s3.js', '../../../ee/src/scripts/migrate-to-s3.ts'];
const entry = paths.map((path) => new URL(path, import.meta.url));
let loaded = false;
for (const path of entry) {
  if (!(await Bun.file(path).exists())) continue;
  await import(path.href);
  loaded = true;
  break;
}
if (!loaded) {
  console.error('Enterprise Edition is required for S3 migration.');
  process.exit(1);
}
export {};
