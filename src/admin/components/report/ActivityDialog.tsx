import { History } from 'lucide-react';
import type { ReportHistoryEntry } from '@shared/types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { ReportHistoryTimeline } from './ReportHistoryTimeline';

interface ActivityDialogProps {
  entries: ReportHistoryEntry[];
  isLoading: boolean;
}

export function ActivityDialog({ entries, isLoading }: ActivityDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <History className="h-4 w-4 mr-2" />
          Activity
          {entries.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {entries.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Activity
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="px-6 py-1">
          <ReportHistoryTimeline entries={entries} isLoading={isLoading} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
