import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { brandingApi } from '../../api/branding';
import { api } from '../../api/client';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { RotateCcw } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { WidgetDialogSettingsForm } from '../../components/WidgetDialogSettingsForm';
import type { ThemeColors } from '@shared/types';

const DEFAULT_WIDGET_COLORS: ThemeColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  lightBackgroundColor: '#ffffff',
  lightSecondaryColor: '#f5f5f5',
  lightInputColor: '#ffffff',
  lightForegroundColor: '#0a0a0a',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  darkBackgroundColor: '#0a0a0a',
  darkSecondaryColor: '#262626',
  darkInputColor: '#1a1a1a',
  darkForegroundColor: '#fafafa',
};

export function Dialog() {
  const queryClient = useQueryClient();
  // Track local edits separately - null means use config values
  const [localEdits, setLocalEdits] = useState<Partial<ThemeColors> | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });

  const mutation = useMutation({
    mutationFn: brandingApi.updateWidgetPrimaryColors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      setLocalEdits(null); // Clear local edits after save
      toast.success('Widget dialog colors updated');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update widget dialog colors');
    },
  });

  const brandingMutation = useMutation({
    mutationFn: (showBranding: boolean) =>
      api.put('/white-label/config', { hidePoweredBy: !showBranding }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      await queryClient.invalidateQueries({ queryKey: ['white-label'] });
      toast.success('Widget branding updated');
    },
    onError: () => toast.error('Failed to update widget branding'),
  });

  // Use local edits if user has made changes, otherwise use config directly
  const displayColors = localEdits ?? config?.widgetPrimaryColors ?? DEFAULT_WIDGET_COLORS;

  const handleChange = (newColors: Partial<ThemeColors>) => {
    setLocalEdits(newColors);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(displayColors as ThemeColors);
  };

  const handleReset = () => {
    setLocalEdits(DEFAULT_WIDGET_COLORS);
  };

  // Wait for config to fully load before rendering the form
  if (isLoading || !config?.widgetPrimaryColors) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Widget Dialog Settings</CardTitle>
        <CardDescription>
          Configure the colors for buttons inside the widget dialog (submit, action buttons).
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {config.whiteLabel && (
            <div className="flex items-center justify-between gap-4 border-b pb-4">
              <div className="space-y-1">
                <Label htmlFor="show-widget-branding">Show BugPin branding</Label>
                <p className="text-sm text-muted-foreground">
                  Display “Powered by BugPin” in the widget footer. Changes save automatically.
                </p>
              </div>
              <Switch
                id="show-widget-branding"
                checked={!config.whiteLabel.hidePoweredBy}
                onCheckedChange={(checked) => brandingMutation.mutate(checked)}
                disabled={brandingMutation.isPending}
              />
            </div>
          )}

          <WidgetDialogSettingsForm
            value={displayColors}
            onChange={handleChange}
            disabled={mutation.isPending}
            showCard={false}
          />

          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save Colors
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={mutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
