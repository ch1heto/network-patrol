'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function launchBrowser(){
 const configured=process.env.BROWSER_EXECUTABLE||process.env.CHROME_PATH;
 if(configured){if(!fs.existsSync(configured))throw Error('Browser executable does not exist: '+configured);return chromium.launch({headless:true,executablePath:configured});}
 const candidates=[chromium.executablePath()];
 if(process.platform==='win32')for(const root of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean))for(const suffix of ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'])candidates.push(path.join(root,suffix));
 else candidates.push('/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
 const executablePath=candidates.find(p=>fs.existsSync(p));
 if(!executablePath)throw Error('No browser found. Install Playwright Chromium (npx playwright install chromium) or set BROWSER_EXECUTABLE. Browser tests are required.');
 return chromium.launch({headless:true,executablePath});
}
module.exports={launchBrowser};
