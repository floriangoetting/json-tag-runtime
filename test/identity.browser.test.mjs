import assert from 'node:assert/strict';
import test from 'node:test';

test('automatic cookies follow browser public suffix rules, consent, subdomains and host overrides', {
  skip: process.env.RUN_IDENTITY_BROWSER_TEST !== '1', timeout: 30000
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const [host, sibling, domain] of [
      ['analytics.example.com', 'shop.example.com', '.example.com'],
      ['analytics.fresnap.de', 'shop.fresnap.de', '.fresnap.de'],
      ['shop.example.co.uk', 'www.example.co.uk', '.example.co.uk'],
      ['shop.tenant.github.io', 'www.tenant.github.io', '.tenant.github.io'],
      ['localhost', null, 'localhost'],
      ['127.0.0.1', null, '127.0.0.1']
    ]) {
      const context = await browser.newContext();
      await context.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>Identity test</body></html>' }));
      const page = await context.newPage();
      const initialize = async (hostname, cookie) => {
        await page.goto(`https://${hostname}/`);
        await page.addScriptTag({ path: new URL('../cdn/browser.iife.min.js', import.meta.url).pathname });
        await page.evaluate((cookie) => {
          window.tracking = window.JsonTagRuntime.createJsonTag({ browser_context: false, transport: async () => ({ accepted: true }), identity: { enabled: true, cookie } });
        }, cookie);
      };
      const send = () => page.evaluate(async () => (await window.tracking.send({ event: { name: 'test' } })).event);
      const consent = (granted) => page.evaluate((granted) => window.tracking.setIdentityConsent(granted), granted);
      await initialize(host);
      assert.equal((await send()).device, undefined);
      assert.deepEqual(await context.cookies(), []);
      await consent(true);
      const first = await send();
      assert.equal((await context.cookies()).length, 1, host);
      assert.equal((await context.cookies())[0].domain, domain, host);
      if (sibling) {
        await initialize(sibling);
        await consent(true);
        assert.equal((await send()).device.id, first.device.id, sibling);
      }
      // A newly initialized runtime can revoke an old cookie before sending.
      await initialize(host);
      await consent(false);
      assert.deepEqual(await context.cookies(), []);
      await consent(true);
      assert.notEqual((await send()).device.id, first.device.id);
      if (sibling) {
        await consent(false);
        await initialize(host, { domain: null });
        await consent(true);
        const hostOnly = await send();
        assert.equal((await context.cookies())[0].domain, host);
        await initialize(sibling, { domain: null });
        await consent(true);
        assert.notEqual((await send()).device.id, hostOnly.device.id);
      }
      await context.close();
    }
  } finally { await browser.close(); }
});
