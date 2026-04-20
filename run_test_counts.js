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
  await page2.goto(link); 
  await new Promise(r => setTimeout(r, 4000)); 
  const clientEnemies = await page2.evaluate(() => enemies.length); 
  const hostEnemies = await page.evaluate(() => enemies.length); 
  console.log('Host Enemies:', hostEnemies, 'Client Enemies:', clientEnemies); 
  await browser.close(); 
})();
