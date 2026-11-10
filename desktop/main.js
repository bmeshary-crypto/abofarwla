// Desktop shell for the site. A web page can't play http streams or servers
// that don't send CORS headers; an app can, the same way VLC does, so this
// window allows both and otherwise just shows the live site.
const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

// the same shell builds both apps; package.json names the site and the GitHub repo
const { siteUrl: SITE, appTag, appIcon, repo, setupName, portableName } = require('./package.json');
const RELEASE = `https://github.com/${repo}/releases/download/app/`;
const PORTABLE = process.env.PORTABLE_EXECUTABLE_FILE; // set when running the portable .exe
let win;

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    for (const k of Object.keys(h)) if (/^access-control-allow-(origin|credentials)$/i.test(k)) delete h[k];
    h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });

  win = new BrowserWindow({
    width: 1280, height: 800, icon: path.join(__dirname, appIcon), autoHideMenuBar: true,
    webPreferences: { allowRunningInsecureContent: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' ' + appTag);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(SITE);
  // the copy a portable update replaced
  if (PORTABLE) fs.rm(PORTABLE + '.old', { force: true }, () => {});
});
app.on('window-all-closed', () => app.quit());

// ---------- "check for updates" (the page's button) ----------
// windows-version.json in the GitHub release names the newest build. A newer one
// is downloaded, then installed silently and reopened; the portable .exe is swapped in place.
const status = (state, detail) => win?.webContents.send('update-status', state, detail ?? null);
const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
let busy = false;
ipcMain.handle('update-version', () => app.getVersion());
ipcMain.handle('update-check', async () => {
  if (busy) return; busy = true;
  try {
    status('checking');
    const r = await fetch(RELEASE + 'windows-version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.json();
    if (!newer(v.version, app.getVersion())) return status('latest', app.getVersion());
    const name = PORTABLE ? portableName : setupName;
    const file = path.join(os.tmpdir(), `${Date.now()}-${name}`);
    await download(RELEASE + name, file);
    status('installing', v.version);
    if (PORTABLE) {
      // a running .exe can be renamed but not overwritten
      fs.rmSync(PORTABLE + '.old', { force: true });
      fs.renameSync(PORTABLE, PORTABLE + '.old');
      fs.copyFileSync(file, PORTABLE);
      spawn(PORTABLE, [], { detached: true, stdio: 'ignore' }).unref();
    } else {
      // the installer closes this app, installs silently and starts the new version
      spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    }
    setTimeout(() => app.quit(), 800);
  } catch (e) {
    status('error', String(e.message || e));
  } finally { busy = false; }
});

async function download(url, to) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = +r.headers.get('content-length') || 0;
  const out = fs.createWriteStream(to);
  let got = 0, last = -1;
  for await (const chunk of r.body) {
    if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
    got += chunk.length;
    const pct = total ? Math.floor(got * 100 / total) : -1;
    if (pct !== last) { last = pct; status('downloading', String(pct)); }
  }
  await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
}
