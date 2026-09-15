import type { Metadata } from 'next';
import { OperatorsLogSkeleton } from '@/components/commercial/operators-log-stub';
import { resolveSourceProvenance } from '@/lib/config/source-provenance';

export const metadata: Metadata = {
  title: 'Operator’s log — awaiting evidence',
  description:
    'Reserved slot. The operator’s log is composed only from a recorded operating session that has not happened yet.',
};

export default function OperatorLogPage() {
  return <OperatorsLogSkeleton provenance={resolveSourceProvenance(process.env)} />;
}
