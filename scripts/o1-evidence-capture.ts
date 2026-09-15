import path from 'node:path';
import { DATA_ROOT } from '@/lib/config/data-root';
import {
  O1_BUNDLE_RELATIVE_PATH,
  prepareO1EvidenceBundle,
  snapshotO1RuntimeEvidence,
  verifyO1EvidenceBundle,
} from '@/lib/evidence/o1-capture';

const command = process.argv[2];
const bundleRoot = path.resolve(
  process.env.O1_EVIDENCE_DIR ?? path.join(process.cwd(), O1_BUNDLE_RELATIVE_PATH),
);
const now = new Date().toISOString();

if (command === 'prepare') {
  await prepareO1EvidenceBundle({ bundleRoot, preparedAt: now });
  console.log(`Prepared O1 evidence structure at ${bundleRoot}. No session evidence was created.`);
} else if (command === 'snapshot') {
  const result = await snapshotO1RuntimeEvidence({
    bundleRoot,
    dataRoot: DATA_ROOT,
    capturedAt: now,
  });
  console.log(
    `Captured ${result.copiedFiles.length} runtime file(s) at ${bundleRoot}; ` +
      `${result.missingOptionalSources.length} optional source(s) were absent.`,
  );
} else if (command === 'verify') {
  const result = await verifyO1EvidenceBundle(bundleRoot);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} else {
  console.error('Usage: npm run evidence:o1 -- prepare|snapshot|verify');
  process.exitCode = 2;
}
