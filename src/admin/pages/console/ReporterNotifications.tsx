import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Spinner } from '../../components/ui/spinner';
import type { AppSettings, ReporterNotificationSettings as ReporterSettings } from '@shared/types';

export function ReporterNotifications() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ReporterSettings>({
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
    messagingEnabled: true,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  useEffect(() => {
    if (settings?.reporterNotifications) {
      setFormData(settings.reporterNotifications);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: { reporterNotifications: ReporterSettings }) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Reporter notification settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ reporterNotifications: formData });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reporter Notifications</CardTitle>
        <CardDescription>
          Configure default notification and messaging settings for bug report submitters. These can
          be overridden per project.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {/* Email Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reporter-email-enabled" className="text-sm font-normal">
                Email Notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable email notifications for reporters
              </p>
            </div>
            <Switch
              id="reporter-email-enabled"
              checked={formData.emailEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, emailEnabled: checked })}
            />
          </div>

          {formData.emailEnabled && (
            <>
              {/* New Reports */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="reporter-new-report" className="text-sm font-normal">
                    New Reports
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Send confirmation email when a report is submitted
                  </p>
                </div>
                <Switch
                  id="reporter-new-report"
                  checked={formData.notifyOnNewReport}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notifyOnNewReport: checked })
                  }
                />
              </div>

              {/* Status Change Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="reporter-status-change" className="text-sm font-normal">
                    Status Change Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Notify reporters when their bug report status changes
                  </p>
                </div>
                <Switch
                  id="reporter-status-change"
                  checked={formData.notifyOnStatusChange}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notifyOnStatusChange: checked })
                  }
                />
              </div>

              {/* Priority Change Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="reporter-priority-change" className="text-sm font-normal">
                    Priority Change Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Notify reporters when their bug report priority changes
                  </p>
                </div>
                <Switch
                  id="reporter-priority-change"
                  checked={formData.notifyOnPriorityChange}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notifyOnPriorityChange: checked })
                  }
                />
              </div>

              {/* Assignment Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="reporter-assignment-change" className="text-sm font-normal">
                    Assignment Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Notify reporters when their bug report is assigned or reassigned
                  </p>
                </div>
                <Switch
                  id="reporter-assignment-change"
                  checked={formData.notifyOnAssignment}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notifyOnAssignment: checked })
                  }
                />
              </div>

              {/* Messaging System */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="reporter-messaging" className="text-sm font-normal">
                    Messaging System
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow sending messages to reporters
                  </p>
                </div>
                <Switch
                  id="reporter-messaging"
                  checked={formData.messagingEnabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, messagingEnabled: checked })
                  }
                />
              </div>
            </>
          )}

          <div className="pt-4">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
