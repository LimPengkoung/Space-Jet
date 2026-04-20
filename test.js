const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://127.0.0.1:8080/game.html', { waitUntil: 'networkidle0' });
  console.log('Page loaded');
  await page.click('#startBtn');
  console.log('Clicked startBtn');
  // wait 1 second
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
})();