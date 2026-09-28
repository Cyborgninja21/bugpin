import { describe, it, expect, beforeEach } from 'bun:test';
import { renderToString } from 'preact-render-to-string';
import { WidgetDialog } from '../../components/WidgetDialog';
import { __resetI18nForTests } from '../../i18n/index';

beforeEach(() => {
  __resetI18nForTests();
});

function renderDialog(links: { reportsUrl?: string | null; appUrl?: string | null }) {
  return renderToString(
    <WidgetDialog
      onClose={() => undefined}
      onSubmit={() => undefined}
      onCaptureScreenshot={() => undefined}
      onAnnotateMedia={() => undefined}
      media={[]}
      onAddMedia={() => undefined}
      onRemoveMedia={() => undefined}
      isSubmitting={false}
      isCapturing={false}
      enableAnnotation={true}
      enabledReportTypes={['bug']}
      activeTab="details"
      onActiveTabChange={() => undefined}
      formData={{
        reportType: 'bug',
        title: '',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      }}
      onFormDataChange={() => undefined}
      showScreenCaptureConsent={false}
      onConsentConfirm={() => undefined}
      onConsentCancel={() => undefined}
      reduceScreenshotQuality={false}
      onReduceScreenshotQualityChange={() => undefined}
      oversizedCapture={null}
      onDismissOversizedCapture={() => undefined}
      {...links}
    />
  );
}

describe('dialog footer links', () => {
  it('links the reports repository and the BugPin app next to the attribution', () => {
    const html = renderDialog({
      reportsUrl: 'https://github.com/example/bugs/issues',
      appUrl: 'https://bugpin.example.com',
    });
    expect(html).toContain('href="https://bugpin.io"');
    expect(html).toContain('href="https://github.com/example/bugs/issues"');
    expect(html).toContain('>Reports</a>');
    expect(html).toContain('href="https://bugpin.example.com"');
    expect(html).toContain('>Open BugPin</a>');
  });

  it('shows only the attribution when no links are configured', () => {
    const html = renderDialog({});
    expect(html).toContain('href="https://bugpin.io"');
    expect(html).not.toContain('>Reports</a>');
    expect(html).not.toContain('>Open BugPin</a>');
  });
});
