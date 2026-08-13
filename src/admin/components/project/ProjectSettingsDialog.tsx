import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { brandingApi } from '../../api/branding';
import type {
  Project,
  ProjectSettings,
  ProjectNotificationDefaults,
  WidgetLauncherButtonSettings,
  WidgetDialogSettings,
  ScreenshotSettings,
  ReporterNotificationSettings,
  ProjectLanguageSettings,
  LocaleCode,
  ReportType,
} from '@shared/types';
import { SUPPORTED_LOCALES, REPORT_TYPES } from '@shared/types';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  bug: 'Bug',
  feature: 'Feature request',
  question: 'Question',
  task: 'Task',
};
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Spinner } from '../ui/spinner';
import { WidgetDialogSettingsForm } from '../WidgetDialogSettingsForm';
import type { ThemeColors } from '@shared/types';
import { WidgetLauncherButtonSettingsForm } from '../WidgetLauncherButtonSettingsForm';
import { ScreenshotSettingsForm } from '../ScreenshotSettingsForm';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { NotificationSettingsForm } from '../NotificationSettingsForm';
import { ReporterNotificationSettingsForm } from '../ReporterNotificationSettingsForm';
import { ProjectWhitelistForm } from './ProjectWhitelistForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ProjectSettingsDialogProps {
  project: { id: string; name: string; settings?: ProjectSettings };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?:
    | 'assignments'
    | 'widgetDialog'
    | 'widgetLauncherButton'
    | 'screenshot'
    | 'notifications'
    | 'whitelists'
    | 'language';
}

const DEFAULT_PROJECT_LANGUAGE: ProjectLanguageSettings = {
  mode: 'auto',
  defaultLanguage: 'en',
};

const LOCALE_DISPLAY_LABELS: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  es: 'Español',
  it: 'Italiano',
  ja: '日本語 (JP)',
  zh: '中文 (简体) (CN)',
};

import type { NotificationDefaultSettings } from '@shared/types';

const UNASSIGNED_VALUE = '__unassigned__';

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  defaultTab = 'assignments',
}: ProjectSettingsDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Widget dialog settings state (submit button, action buttons)
  const [useCustomWidgetDialog, setUseCustomWidgetDialog] = useState(false);
  const [widgetDialogSettings, setWidgetDialogSettings] = useState<Partial<ThemeColors>>({});

  // Launcher button settings state
  const [useCustomButton, setUseCustomButton] = useState(false);
  const [buttonSettings, setButtonSettings] = useState<Partial<WidgetLauncherButtonSettings>>({});

  // Screenshot settings state
  const [useCustomScreenshot, setUseCustomScreenshot] = useState(false);
  const [screenshotSettings, setScreenshotSettings] = useState<Partial<ScreenshotSettings>>({});

  // Notification settings state
  const [useCustomNotifications, setUseCustomNotifications] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<
    Partial<NotificationDefaultSettings>
  >({});

  // Reporter notification settings state
  const [reporterSettings, setReporterSettings] = useState<Partial<ReporterNotificationSettings>>(
    {}
  );

  // Assignment settings state
  const [defaultAssigneeUserId, setDefaultAssigneeUserId] = useState<string | null>(null);

  // Whitelist settings state
  const [useCustomWhitelist, setUseCustomWhitelist] = useState(false);
  const [whitelistSettings, setWhitelistSettings] = useState<string[]>([]);

  // Report-type settings state
  const [enabledReportTypes, setEnabledReportTypes] = useState<ReportType[]>(['bug']);
  const [defaultReportType, setDefaultReportType] = useState<ReportType>('bug');

  // Language settings state
  const [languageSettings, setLanguageSettings] =
    useState<ProjectLanguageSettings>(DEFAULT_PROJECT_LANGUAGE);

  // Fetch project details
  const { data: projectDetail, isLoading: isLoadingProject } = useQuery({
    queryKey: ['project', project.id],
    queryFn: async () => {
      const response = await api.get(`/projects/${project.id}`);
      return response.data.project as Project;
    },
    enabled: open,
  });

  // Fetch global settings
  const { data: globalSettings, isLoading: isLoadingGlobal } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings;
    },
    enabled: open,
  });

  // Fetch branding config for global widget modal colors
  const { data: brandingConfig, isLoading: isLoadingBranding } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
    enabled: open,
    staleTime: Infinity, // Never refetch - branding config is managed globally
  });

  // Fetch notification defaults
  const { data: notificationDefaults, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ['project-notification-defaults', project.id],
    queryFn: async () => {
      const response = await api.get(`/notification-preferences/projects/${project.id}/defaults`);
      return response.data.defaults as ProjectNotificationDefaults | null;
    },
    enabled: open,
  });

  const { data: assignableUsers, isLoading: isLoadingAssignableUsers } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const response = await api.get('/users/assignable');
      return response.data.users as Array<{
        id: string;
        name: string;
        email: string;
        avatarUrl?: string;
      }>;
    },
    enabled: open,
  });

  // Initialize state when data loads
  useEffect(() => {
    if (projectDetail) {
      // Widget Dialog settings - using new nested structure
      const dialogSettings = projectDetail.settings?.widgetDialog;
      const hasCustomWidgetDialog = dialogSettings && Object.keys(dialogSettings).length > 0;
      setUseCustomWidgetDialog(!!hasCustomWidgetDialog);
      setWidgetDialogSettings(dialogSettings || {});

      // Widget Button (launcher) settings - using new nested structure
      const launcherSettings = projectDetail.settings?.widgetLauncherButton;
      const hasCustomButton = launcherSettings && Object.keys(launcherSettings).length > 0;
      setUseCustomButton(!!hasCustomButton);
      setButtonSettings(launcherSettings || {});

      // Screenshot settings - using new nested structure
      const screenshotConf = projectDetail.settings?.screenshot;
      const hasCustomScreenshot = screenshotConf && Object.keys(screenshotConf).length > 0;
      setUseCustomScreenshot(!!hasCustomScreenshot);
      setScreenshotSettings({
        useScreenCaptureAPI: screenshotConf?.useScreenCaptureAPI,
        maxScreenshotSize: screenshotConf?.maxScreenshotSize,
        maxImageUploadSizeMb: screenshotConf?.maxImageUploadSizeMb,
        maxVideoUploadSizeMb: screenshotConf?.maxVideoUploadSizeMb,
      });

      // Whitelist settings
      const security = projectDetail.settings?.security;
      const hasCustomWhitelist = security?.allowedOrigins && security.allowedOrigins.length > 0;
      setUseCustomWhitelist(!!hasCustomWhitelist);
      setWhitelistSettings(security?.allowedOrigins || []);

      // Reporter notification settings
      const reporterConf = projectDetail.settings?.reporterNotifications;
      setReporterSettings(reporterConf || {});

      // Default assignee
      setDefaultAssigneeUserId(projectDetail.settings?.defaultAssigneeUserId ?? null);

      // Report-type settings
      const rt = projectDetail.settings?.reportTypes;
      const enabled: ReportType[] = rt?.enabled?.length ? rt.enabled : ['bug'];
      setEnabledReportTypes(enabled);
      setDefaultReportType(rt?.default ?? enabled[0] ?? 'bug');

      // Language settings
      setLanguageSettings(projectDetail.settings?.language ?? DEFAULT_PROJECT_LANGUAGE);
    }
  }, [projectDetail]);

  // Initialize notification settings
  useEffect(() => {
    if (notificationDefaults) {
      setUseCustomNotifications(true);
      setNotificationSettings({
        emailEnabled: notificationDefaults.defaultEmailEnabled,
        notifyOnNewReport: notificationDefaults.defaultNotifyOnNewReport,
        notifyOnStatusChange: notificationDefaults.defaultNotifyOnStatusChange,
        notifyOnPriorityChange: notificationDefaults.defaultNotifyOnPriorityChange,
        notifyOnAssignment: notificationDefaults.defaultNotifyOnAssignment,
        notifyOnDeletion: notificationDefaults.defaultNotifyOnDeletion,
      });
    } else {
      setUseCustomNotifications(false);
      setNotificationSettings({});
    }
  }, [notificationDefaults]);

  // Mutation for project settings (widget, button, screenshot, whitelist)
  const projectMutation = useMutation({
    mutationFn: async (data: { settings: Partial<ProjectSettings> }) => {
      const response = await api.patch(`/projects/${project.id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
  });

  // Mutation for notification defaults
  const notificationMutation = useMutation({
    mutationFn: async (data: Partial<ProjectNotificationDefaults>) => {
      const response = await api.patch(
        `/notification-preferences/projects/${project.id}/defaults`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', project.id] });
    },
  });

  // Mutation for deleting notification defaults
  const deleteNotificationMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete(
        `/notification-preferences/projects/${project.id}/defaults`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', project.id] });
    },
  });

  const handleSave = async () => {
    try {
      // Build settings with new nested structure
      const newSettings: Partial<ProjectSettings> = {
        ...projectDetail?.settings,
      };

      // Widget Dialog settings
      if (useCustomWidgetDialog && Object.keys(widgetDialogSettings).length > 0) {
        newSettings.widgetDialog = widgetDialogSettings as WidgetDialogSettings;
      } else {
        newSettings.widgetDialog = undefined;
      }

      // Widget Button (launcher) settings
      if (useCustomButton && Object.keys(buttonSettings).length > 0) {
        newSettings.widgetLauncherButton = buttonSettings as WidgetLauncherButtonSettings;
      } else {
        newSettings.widgetLauncherButton = undefined;
      }

      // Screenshot settings
      if (useCustomScreenshot && Object.keys(screenshotSettings).length > 0) {
        newSettings.screenshot = screenshotSettings as ScreenshotSettings;
      } else {
        newSettings.screenshot = undefined;
      }

      // Security settings (whitelist)
      if (useCustomWhitelist && whitelistSettings.length > 0) {
        newSettings.security = {
          allowedOrigins: whitelistSettings,
        };
      } else {
        newSettings.security = undefined;
      }

      // Reporter notification settings
      if (useCustomNotifications && Object.keys(reporterSettings).length > 0) {
        newSettings.reporterNotifications =
          reporterSettings as ProjectSettings['reporterNotifications'];
      } else {
        newSettings.reporterNotifications = undefined;
      }

      newSettings.defaultAssigneeUserId = defaultAssigneeUserId;

      // Report-type settings
      newSettings.reportTypes = {
        enabled: enabledReportTypes.length ? enabledReportTypes : ['bug'],
        default: enabledReportTypes.includes(defaultReportType) ? defaultReportType : 'bug',
      };

      // Language settings
      newSettings.language = languageSettings;

      // Save project settings
      await projectMutation.mutateAsync({
        settings: newSettings,
      });

      // Save notification settings
      if (useCustomNotifications) {
        // Convert from NotificationDefaultSettings format to ProjectNotificationDefaults format
        await notificationMutation.mutateAsync({
          defaultEmailEnabled: notificationSettings.emailEnabled,
          defaultNotifyOnNewReport: notificationSettings.notifyOnNewReport,
          defaultNotifyOnStatusChange: notificationSettings.notifyOnStatusChange,
          defaultNotifyOnPriorityChange: notificationSettings.notifyOnPriorityChange,
          defaultNotifyOnAssignment: notificationSettings.notifyOnAssignment,
          defaultNotifyOnDeletion: notificationSettings.notifyOnDeletion,
        });
      } else {
        await deleteNotificationMutation.mutateAsync();
      }

      toast.success('Settings saved successfully');
      onOpenChange(false);
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save settings');
    }
  };

  const isLoading =
    isLoadingProject ||
    isLoadingGlobal ||
    isLoadingNotifications ||
    isLoadingBranding ||
    isLoadingAssignableUsers;
  const isSaving =
    projectMutation.isPending ||
    notificationMutation.isPending ||
    deleteNotificationMutation.isPending;

  const assignableUserIds = new Set(assignableUsers?.map((user) => user.id) ?? []);
  const isMissingAssignedUser =
    !!defaultAssigneeUserId && !assignableUserIds.has(defaultAssigneeUserId);
  const defaultAssigneeSelectValue = defaultAssigneeUserId ?? UNASSIGNED_VALUE;
  const selectedAssignee = assignableUsers?.find((user) => user.id === defaultAssigneeUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh]">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>Configure settings for "{project.name}"</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Spinner className="text-primary" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            orientation="vertical"
            className="flex min-h-0 flex-1 flex-row gap-4"
          >
            <TabsList className="flex h-auto w-48 flex-shrink-0 flex-col items-stretch justify-start gap-1 rounded-xl bg-muted p-2">
              <TabsTrigger value="assignments" className="justify-start px-3 py-2">
                Assignments
              </TabsTrigger>
              <TabsTrigger value="widgetDialog" className="justify-start px-3 py-2">
                Widget Dialog
              </TabsTrigger>
              <TabsTrigger value="widgetLauncherButton" className="justify-start px-3 py-2">
                Widget Button
              </TabsTrigger>
              <TabsTrigger value="screenshot" className="justify-start px-3 py-2">
                Screenshot
              </TabsTrigger>
              <TabsTrigger value="notifications" className="justify-start px-3 py-2">
                Notifications
              </TabsTrigger>
              <TabsTrigger value="whitelists" className="justify-start px-3 py-2">
                Whitelists
              </TabsTrigger>
              <TabsTrigger value="language" className="justify-start px-3 py-2">
                Language
              </TabsTrigger>
              <TabsTrigger value="reportTypes" className="justify-start px-3 py-2">
                Report Types
              </TabsTrigger>
            </TabsList>

            <DialogBody className="flex-1 min-w-0 pt-0">
              <TabsContent value="assignments" className="mt-0">
                <div className="space-y-5 rounded-xl border bg-card p-5">
                  <div className="space-y-1">
                    <Label htmlFor="default-assignee">Default Assignee</Label>
                    <p className="text-sm text-muted-foreground">
                      New reports from this project are assigned automatically to this user.
                    </p>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4">
                    {selectedAssignee ? (
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          {selectedAssignee.avatarUrl ? (
                            <AvatarImage
                              src={selectedAssignee.avatarUrl}
                              alt={selectedAssignee.name}
                            />
                          ) : null}
                          <AvatarFallback>
                            {selectedAssignee.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium">{selectedAssignee.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {selectedAssignee.email}
                          </p>
                        </div>
                      </div>
                    ) : isMissingAssignedUser ? (
                      <div className="space-y-1">
                        <p className="font-medium">Current assignee unavailable</p>
                        <p className="text-sm text-muted-foreground">
                          This user can no longer receive default assignments for new reports.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-medium">No default assignee</p>
                        <p className="text-sm text-muted-foreground">
                          New reports stay unassigned until somebody picks them up manually.
                        </p>
                      </div>
                    )}
                  </div>

                  <Select
                    value={defaultAssigneeSelectValue}
                    onValueChange={(value) =>
                      setDefaultAssigneeUserId(value === UNASSIGNED_VALUE ? null : value)
                    }
                  >
                    <SelectTrigger id="default-assignee" className="h-11 max-w-xl">
                      <SelectValue placeholder="Choose a default assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>No default assignee</SelectItem>
                      {isMissingAssignedUser && defaultAssigneeUserId ? (
                        <SelectItem value={defaultAssigneeUserId}>
                          Unavailable user (current setting)
                        </SelectItem>
                      ) : null}
                      {assignableUsers?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isMissingAssignedUser ? (
                    <p className="text-sm text-amber-600">
                      The current default assignee is no longer assignable. New reports stay
                      unassigned until you choose another user.
                    </p>
                  ) : null}
                </div>
              </TabsContent>

              {/* Widget Dialog Tab (dialog colors) */}
              <TabsContent value="widgetDialog" className="mt-0">
                <WidgetDialogSettingsForm
                  value={widgetDialogSettings}
                  onChange={setWidgetDialogSettings}
                  globalWidgetColors={brandingConfig?.widgetPrimaryColors}
                  showCustomToggle
                  useCustomSettings={useCustomWidgetDialog}
                  onCustomToggle={setUseCustomWidgetDialog}
                  showCard={false}
                />
              </TabsContent>

              {/* Widget Launcher Button Tab */}
              <TabsContent value="widgetLauncherButton" className="mt-0">
                <WidgetLauncherButtonSettingsForm
                  value={buttonSettings}
                  onChange={setButtonSettings}
                  globalSettings={globalSettings}
                  showCustomToggle
                  useCustomSettings={useCustomButton}
                  onCustomToggle={setUseCustomButton}
                  useTabs
                />
              </TabsContent>

              {/* Screenshot Tab */}
              <TabsContent value="screenshot" className="mt-0">
                <ScreenshotSettingsForm
                  value={screenshotSettings}
                  onChange={setScreenshotSettings}
                  globalSettings={globalSettings}
                  showCustomToggle
                  useCustomSettings={useCustomScreenshot}
                  onCustomToggle={setUseCustomScreenshot}
                />
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="space-y-0.5">
                      <Label htmlFor="use-custom-notifications" className="text-sm font-medium">
                        Use Custom Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Enable individual notification defaults for this project
                      </p>
                    </div>
                    <Switch
                      id="use-custom-notifications"
                      checked={useCustomNotifications}
                      onCheckedChange={(checked) => {
                        setUseCustomNotifications(checked);
                        if (!checked) {
                          setNotificationSettings({});
                          setReporterSettings({});
                        }
                      }}
                    />
                  </div>
                  {useCustomNotifications && (
                    <Tabs defaultValue="team">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="team">Team</TabsTrigger>
                        <TabsTrigger value="reporter">Reporter</TabsTrigger>
                      </TabsList>
                      <TabsContent value="team" className="mt-4">
                        <NotificationSettingsForm
                          value={notificationSettings}
                          onChange={setNotificationSettings}
                          globalSettings={globalSettings}
                        />
                      </TabsContent>
                      <TabsContent value="reporter" className="mt-4">
                        <ReporterNotificationSettingsForm
                          value={reporterSettings}
                          onChange={setReporterSettings}
                          globalSettings={globalSettings}
                        />
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </TabsContent>

              {/* Domain Whitelists Tab */}
              <TabsContent value="whitelists" className="mt-0">
                <ProjectWhitelistForm
                  value={whitelistSettings}
                  onChange={setWhitelistSettings}
                  showCustomToggle
                  useCustomSettings={useCustomWhitelist}
                  onCustomToggle={setUseCustomWhitelist}
                />
              </TabsContent>

              {/* Language Tab */}
              <TabsContent value="language" className="mt-0">
                <div className="space-y-5 rounded-xl border bg-card p-5">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Language Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Auto detects each visitor's language from the page or browser; manual locks
                      the widget and reporter emails to one language for every report.
                    </p>
                  </div>
                  <div role="radiogroup" aria-label="Language mode" className="flex gap-2">
                    <Button
                      type="button"
                      variant={languageSettings.mode === 'auto' ? 'default' : 'outline'}
                      role="radio"
                      aria-checked={languageSettings.mode === 'auto'}
                      onClick={() => setLanguageSettings({ ...languageSettings, mode: 'auto' })}
                    >
                      Auto-detect
                    </Button>
                    <Button
                      type="button"
                      variant={languageSettings.mode === 'manual' ? 'default' : 'outline'}
                      role="radio"
                      aria-checked={languageSettings.mode === 'manual'}
                      onClick={() => setLanguageSettings({ ...languageSettings, mode: 'manual' })}
                    >
                      Manual (locked)
                    </Button>
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label htmlFor="default-language" className="text-sm font-medium">
                      Default Language
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      In auto mode this is the fallback when detection finds no supported match. In
                      manual mode this is the locked language used for every report.
                    </p>
                    <Select
                      value={languageSettings.defaultLanguage}
                      onValueChange={(val) =>
                        setLanguageSettings({
                          ...languageSettings,
                          defaultLanguage: val as LocaleCode,
                        })
                      }
                    >
                      <SelectTrigger id="default-language" className="h-11 max-w-xl">
                        <SelectValue placeholder="Select default language" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LOCALES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {LOCALE_DISPLAY_LABELS[code]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="reportTypes" className="mt-0">
                <div className="space-y-5 rounded-xl border bg-card p-5">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Report Types</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose which kinds of reports the widget offers. When more than one is
                      enabled, visitors pick a type in the form. Each type can be routed to its own
                      GitHub labels/repo in this project's GitHub integration.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {REPORT_TYPES.map((rt) => (
                      <div key={rt} className="flex items-center justify-between">
                        <Label htmlFor={`rt-${rt}`} className="text-sm">
                          {REPORT_TYPE_LABELS[rt]}
                        </Label>
                        <Switch
                          id={`rt-${rt}`}
                          checked={enabledReportTypes.includes(rt)}
                          onCheckedChange={(on) =>
                            setEnabledReportTypes((prev) => {
                              const next = on ? [...prev, rt] : prev.filter((t) => t !== rt);
                              return next.length ? next : ['bug'];
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="default-report-type" className="text-sm font-medium">
                      Default Type
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Preselected when the widget opens.
                    </p>
                    <Select
                      value={defaultReportType}
                      onValueChange={(val) => setDefaultReportType(val as ReportType)}
                    >
                      <SelectTrigger id="default-report-type" className="h-11 max-w-xl">
                        <SelectValue placeholder="Select default type" />
                      </SelectTrigger>
                      <SelectContent>
                        {enabledReportTypes.map((rt) => (
                          <SelectItem key={rt} value={rt}>
                            {REPORT_TYPE_LABELS[rt]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </DialogBody>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
