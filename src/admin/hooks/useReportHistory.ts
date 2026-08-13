import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ReportHistoryEntry } from '@shared/types';

export function useReportHistory(reportId: string | undefined) {
  return useQuery({
    queryKey: ['report-history', reportId],
    queryFn: async () => {
      const response = await api.get(`/reports/${reportId}/history`);
      return response.data.history as ReportHistoryEntry[];
    },
    enabled: Boolean(reportId),
  });
}
