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
  await page2.evaluateOnNewDocument(() => {
    window.clientDataCount = 0;
    const origLog = console.log;
  });
  page2.on('console', msg => { if (!msg.text().includes('AudioContext')) console.log('CLIENT:', msg.text()) }); 
  
  await page2.goto(link); 
  
  // Hook the applyNetworkState function!
  await page2.evaluate(() => {
     const origApply = applyNetworkState;
     applyNetworkState = function(st) {
        window.clientDataCount++;
        return origApply(st);
     };
  });
  
  await new Promise(r => setTimeout(r, 4000)); 
  
  const rc = await page2.evaluate(() => window.clientDataCount);
  console.log('Client received data count:', rc);
  
  // Let's check for any console errors on Host:
  const hostErrors = await page.evaluate(() => window.hostErrors || []);
  console.log('Host Errors?', hostErrors);

  await browser.close(); 
})();
