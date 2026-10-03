import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { licenseApi } from '../../api/license';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import type { ApiToken, Webhook, Project } from '@shared/types';

function showError(error: Error) {
  toast.error(
    axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message
  );
}

export function ApiTokens() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [rawToken, setRawToken] = useState('');
  const { data: license } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });
  const enabled = license?.features['api-access'] ?? false;
  const {
    data: tokens,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: async () => (await api.get('/tokens')).data.tokens as ApiToken[],
    enabled,
  });
  const create = useMutation({
    mutationFn: async (form: FormData) =>
      (
        await api.post('/tokens', {
          name: form.get('name'),
          scopes: [form.get('scope')],
          expiresInDays: Number(form.get('days')),
        })
      ).data.rawToken as string,
    onSuccess: (token) => {
      setRawToken(token);
      client.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: showError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['api-tokens'] }),
    onError: showError,
  });
  if (!enabled)
    return (
      <p className="text-sm text-muted-foreground">API tokens require the API access feature.</p>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>API tokens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            create.mutate(new FormData(event.currentTarget));
          }}
        >
          <label>
            Token name
            <Input name="name" required minLength={2} maxLength={100} />
          </label>
          <label>
            Scope
            <select name="scope" className="block w-full rounded border p-2">
              <option value="read">Read</option>
              {user?.role !== 'viewer' && <option value="write">Read and write</option>}
              {user?.role === 'admin' && <option value="admin">Admin</option>}
            </select>
          </label>
          <label>
            Expires in days
            <Input name="days" type="number" min={1} max={365} defaultValue={30} required />
          </label>
          <Button disabled={create.isPending}>Create token</Button>
        </form>
        {rawToken && (
          <div role="status" className="space-y-2 rounded border p-3">
            <p>Copy this token now. It is shown once.</p>
            <Input
              aria-label="New API token"
              value={rawToken}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <Button variant="outline" onClick={() => setRawToken('')}>
              Dismiss token
            </Button>
          </div>
        )}
        {isLoading && <Spinner />}
        {error && <p role="alert">{error.message}</p>}
        {tokens?.map((token) => (
          <div
            key={token.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
          >
            <span>
              {token.name} · {token.scopes.join(', ')} ·{' '}
              {token.expiresAt
                ? `expires ${new Date(token.expiresAt).toLocaleDateString()}`
                : 'no expiry'}
            </span>
            <Button
              variant="outline"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(token.id)}
            >
              Revoke {token.name}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WhiteLabelSettings() {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['white-label'],
    queryFn: async () =>
      (await api.get('/white-label/config')).data.config as {
        hideFooterBranding: boolean;
        hideEmailBranding: boolean;
        customCopyright?: string;
      },
  });
  const save = useMutation({
    mutationFn: (form: FormData) =>
      api.put('/white-label/config', {
        hideFooterBranding: form.has('footer'),
        hideEmailBranding: form.has('email'),
        customCopyright: String(form.get('copyright') || ''),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['white-label'] });
      await client.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('White-label settings saved');
    },
    onError: showError,
  });
  if (isLoading) return <Spinner />;
  if (error || !data) return <p role="alert">Unable to load white-label settings.</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>White-label</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          key={JSON.stringify(data)}
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(new FormData(event.currentTarget));
          }}
        >
          <label className="flex gap-2">
            <input name="footer" type="checkbox" defaultChecked={data.hideFooterBranding} />
            Hide admin footer branding
          </label>
          <label className="flex gap-2">
            <input name="email" type="checkbox" defaultChecked={data.hideEmailBranding} />
            Hide email footer branding
          </label>
          <label>
            Copyright text
            <Input name="copyright" maxLength={500} defaultValue={data.customCopyright || ''} />
          </label>
          <Button disabled={save.isPending}>Save white-label settings</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function WebhookSettings() {
  const client = useQueryClient();
  const {
    data: webhooks,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => (await api.get('/webhooks')).data.webhooks as Webhook[],
  });
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects')).data.projects as Project[],
  });
  const save = useMutation({
    mutationFn: (form: FormData) =>
      api.post(`/webhooks?projectId=${encodeURIComponent(String(form.get('project')))}`, {
        name: form.get('name'),
        url: form.get('url'),
        secret: form.get('secret') || undefined,
        events: form.getAll('events'),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook created');
    },
    onError: showError,
  });
  const change = useMutation({
    mutationFn: (webhook: Webhook) =>
      api.patch(`/webhooks/${webhook.id}`, { isActive: !webhook.isActive }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['webhooks'] }),
    onError: showError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['webhooks'] }),
    onError: showError,
  });
  const sendTest = useMutation({
    mutationFn: (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: () => {
      toast.success('Test webhook delivered');
      client.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: showError,
  });
  const events = [
    'report.created',
    'report.updated',
    'report.deleted',
    'report.assigned',
    'report.status_changed',
    'report.resolved',
    'report.closed',
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(new FormData(event.currentTarget));
          }}
        >
          <label>
            Project
            <select name="project" required className="block w-full rounded border p-2">
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Webhook name
            <Input name="name" required minLength={2} maxLength={100} />
          </label>
          <label>
            Receiver URL
            <Input name="url" type="url" required />
          </label>
          <label>
            Signing secret
            <Input name="secret" type="password" autoComplete="new-password" />
          </label>
          <fieldset className="grid gap-2">
            <legend>Events</legend>
            {events.map((event) => (
              <label key={event} className="flex gap-2">
                <input
                  name="events"
                  type="checkbox"
                  value={event}
                  defaultChecked={event === 'report.created'}
                />
                {event}
              </label>
            ))}
          </fieldset>
          <Button disabled={save.isPending || !projects?.length}>Create webhook</Button>
        </form>
        {isLoading && <Spinner />}
        {error && <p role="alert">{error.message}</p>}
        {webhooks?.map((webhook) => (
          <div key={webhook.id} className="space-y-2 rounded border p-3">
            <p className="break-all">
              {webhook.name} · {webhook.url}
            </p>
            <p className="text-sm">
              {webhook.isActive ? 'Active' : 'Paused'} · Last response:{' '}
              {webhook.lastStatusCode ?? 'none'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={sendTest.isPending}
                onClick={() => sendTest.mutate(webhook.id)}
              >
                Test {webhook.name}
              </Button>
              <Button
                variant="outline"
                disabled={change.isPending}
                onClick={() => change.mutate(webhook)}
              >
                {webhook.isActive ? 'Pause' : 'Enable'} {webhook.name}
              </Button>
              <Button
                variant="outline"
                disabled={remove.isPending}
                onClick={() => remove.mutate(webhook.id)}
              >
                Delete {webhook.name}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EnterpriseSettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });
  if (isLoading) return <Spinner />;
  if (error) return <p role="alert">Unable to load enterprise features.</p>;
  return (
    <div className="space-y-6">
      <ApiTokens />
      {data?.features['white-label'] && <WhiteLabelSettings />}
      {data?.features.webhooks && <WebhookSettings />}
    </div>
  );
}
