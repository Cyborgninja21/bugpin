import { ApiTokens } from './ApiTokens';
import { Webhooks } from './Webhooks';
import { Settings } from './Settings';
import { Storage } from './Storage';
import { SMTP } from './SMTP';
import { SubPageTabs } from './SubPageTabs';

const SETTINGS_SUB_TABS = [
  { hash: 'general', label: 'General' },
  { hash: 'smtp', label: 'SMTP' },
  { hash: 'storage', label: 'Storage' },
  { hash: 'api-tokens', label: 'API' },
  { hash: 'webhooks', label: 'Webhooks' },
];

export function SettingsPage() {
  return (
    <div className="max-w-4xl">
      <SubPageTabs subTabs={SETTINGS_SUB_TABS} defaultHash="general">
        <Settings />
        <SMTP />
        <Storage />
        <ApiTokens />
        <Webhooks />
      </SubPageTabs>
    </div>
  );
}
