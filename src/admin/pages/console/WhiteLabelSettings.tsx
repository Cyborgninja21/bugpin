import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';

function showError(error: Error) {
  toast.error(
    axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message
  );
}

export function WhiteLabelSettings() {
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>White-label</CardTitle>
        <CardDescription>
          Control footer branding in the Admin Console and email notifications.
        </CardDescription>
      </CardHeader>
      {isLoading ? (
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      ) : error || !data ? (
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            Unable to load white-label settings.
          </p>
        </CardContent>
      ) : (
        <form
          key={JSON.stringify(data)}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(new FormData(event.currentTarget));
          }}
        >
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="hide-footer-branding">Hide admin footer branding</Label>
              <Switch
                id="hide-footer-branding"
                name="footer"
                defaultChecked={data.hideFooterBranding}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="hide-email-branding">Hide email footer branding</Label>
              <Switch
                id="hide-email-branding"
                name="email"
                defaultChecked={data.hideEmailBranding}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="white-label-copyright">Copyright text</Label>
              <Input
                id="white-label-copyright"
                name="copyright"
                maxLength={500}
                defaultValue={data.customCopyright || ''}
              />
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save white-label settings'
                )}
              </Button>
            </div>
          </CardContent>
        </form>
      )}
    </Card>
  );
}
