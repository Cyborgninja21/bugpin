import { EnterpriseSettings } from './EnterpriseSettings';
import { Settings } from './Settings';
import { Storage } from './Storage';
import { SMTP } from './SMTP';
import { SubPageTabs } from './SubPageTabs';

const SETTINGS_SUB_TABS = [
  { hash: 'general', label: 'General' },
  { hash: 'smtp', label: 'SMTP' },
  { hash: 'storage', label: 'Storage' },
  { hash: 'enterprise', label: 'Enterprise' },
];

export function SettingsPage() {
  return (
    <div className="max-w-4xl">
      <SubPageTabs subTabs={SETTINGS_SUB_TABS} defaultHash="general">
        <Settings />
        <SMTP />
        <Storage />
        <EnterpriseSettings />
      </SubPageTabs>
    </div>
  );
}
