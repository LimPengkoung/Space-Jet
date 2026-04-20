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
  page2.on('console', msg => { if (!msg.text().includes('AudioContext')) console.log('CLIENT:', msg.text()) }); 
  
  await page2.goto(link); 
  await new Promise(r => setTimeout(r, 6000)); 
  
  const sent = await page.evaluate(() => {
     return peerConn ? peerConn.open : "no peerConn";
  }); 
  console.log('Host peerConn.open:', sent); 
  await browser.close(); 
})();
