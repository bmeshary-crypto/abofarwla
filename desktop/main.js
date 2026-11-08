// Desktop shell for the site. A web page can't play http streams or servers
// that don't send CORS headers; an app can, the same way VLC does, so this
// window allows both and otherwise just shows the live site.
const { app, BrowserWindow, session, shell } = require('electron');

// the same shell builds both apps; package.json (or the build's extraMetadata) names the site
const { siteUrl: SITE, appTag, appIcon } = require('./package.json');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    for (const k of Object.keys(h)) if (/^access-control-allow-(origin|credentials)$/i.test(k)) delete h[k];
    h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });

  const win = new BrowserWindow({
    width: 1280, height: 800, icon: __dirname + '/' + appIcon, autoHideMenuBar: true,
    webPreferences: { allowRunningInsecureContent: true }
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' ' + appTag);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(SITE);
});
app.on('window-all-closed', () => app.quit());
