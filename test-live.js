const playwright = require('playwright');
(async () => {
  const browser = await playwright.chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login');
  
  // Fill login
  await page.fill('input[type="email"]', 'you@example.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button:has-text("Sign in")');
  
  await page.waitForTimeout(2000);
  
  // Go back to login or dashboard
  // Actually wait, let's create a user
  await browser.close();
})();
