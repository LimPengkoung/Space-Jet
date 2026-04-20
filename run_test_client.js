const puppeteer = require('puppeteer'); 
(async () => { 
  const browser = await puppeteer.launch(); 
  const page = await browser.newPage(); 
  await page.goto('http://localhost:8080/game.html'); 
  await page.click('#onlineBtn'); 
  await page.waitForFunction(() => document.getElementById('inviteLink').style.display === 'block'); 
  const link = await page.$eval('#inviteLink', el => el.value); 
  console.log('LINK:', link); 
  const page2 = await browser.newPage(); 
  page2.on('console', msg => console.log('CLIENT:', msg.text()));
  page2.on('pageerror', err => console.log('CLIENT ERR:', err.message));
  await page2.goto(link); 
  await new Promise(r => setTimeout(r, 6000)); 
  await browser.close(); 
})();
