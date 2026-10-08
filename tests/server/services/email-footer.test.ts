import { describe, expect, it } from 'bun:test';
import { appendFooterToHtml } from '../../../src/server/constants/email-templates';
import type { WhiteLabelConfig } from '../../../src/server/types/ee-plugin';

const html = '<html><body><div>Message</div></body></html>';
const config: WhiteLabelConfig = {
  enabled: true,
  hideFooterBranding: false,
  hideEmailBranding: false,
  hidePoweredBy: false,
};

describe('email footers', () => {
  for (const hideEmailBranding of [false, true]) {
    for (const templateType of ['invitation', 'newReport'] as const) {
      it(`preserves literal copyright text for ${templateType} with branding hidden=${hideEmailBranding}`, () => {
        const copyright = "ACME $1 $$ $& $` $' <Company>";
        const result = appendFooterToHtml(html, templateType, {
          ...config,
          hideEmailBranding,
          customCopyright: copyright,
        });
        expect(result).toContain('ACME $1 $$ $&amp; $` $&#039; &lt;Company&gt;');
        expect(result.match(/<\/body>/g)).toHaveLength(1);
        expect(result.match(/<\/html>/g)).toHaveLength(1);
      });
    }
  }

  it('separates invitation copyright from the fallback link when branding is hidden', () => {
    const result = appendFooterToHtml(html, 'invitation', {
      ...config,
      hideEmailBranding: true,
      customCopyright: 'ACME',
    });
    expect(result).toContain('<a href="{{invite.url}}">{{invite.url}}</a>');
    expect(result).toMatch(/<\/a>\s*<p[^>]*>ACME<\/p>/);
    expect(result).not.toContain('bugpin.io');
  });

  it('keeps the invitation link without an empty copyright paragraph', () => {
    const result = appendFooterToHtml(html, 'invitation', {
      ...config,
      hideEmailBranding: true,
    });
    expect(result).toContain('<a href="{{invite.url}}">{{invite.url}}</a></div>');
  });
});
