package io.github.bmesharycrypto.abofarwla;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// The page's "check for updates" button. Reads android-version.json from the
// GitHub release, and when it names a newer build downloads that APK straight
// into Android's installer. Android then asks the user to confirm the install
// (no app may skip that). Progress goes back to the page via onAppUpdate(state, detail).
class Updater {
    static final String DONE = "UPDATE_INSTALL_DONE";
    final Activity a;
    final WebView web;
    final String base;
    volatile boolean busy;

    Updater(Activity a, WebView web, String repo) {
        this.a = a;
        this.web = web;
        this.base = "https://github.com/" + repo + "/releases/download/app/";
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
                if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) a.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } else if (st != PackageInstaller.STATUS_SUCCESS) {
                    status("error", i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
                }
            }
        };
        if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(r, new IntentFilter(DONE), Context.RECEIVER_NOT_EXPORTED);
        else a.registerReceiver(r, new IntentFilter(DONE));
    }

    @JavascriptInterface
    public String version() {
        try { return a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    @JavascriptInterface
    public void check() {
        if (busy) return;
        busy = true;
        new Thread(() -> {
            try { run(); }
            catch (Exception e) { status("error", e.getMessage()); }
            finally { busy = false; }
        }).start();
    }

    void run() throws Exception {
        status("checking", null);
        JSONObject v = new JSONObject(new String(readAll(open(base + "android-version.json").getInputStream()), "UTF-8"));
        PackageInfo me = a.getPackageManager().getPackageInfo(a.getPackageName(), 0);
        long mine = Build.VERSION.SDK_INT >= 28 ? me.getLongVersionCode() : me.versionCode;
        if (v.getLong("code") <= mine) { status("latest", me.versionName); return; }
        // Android 8+ asks once per app before it may install other APKs
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            status("permission", null);
            a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            return;
        }
        PackageInstaller pi = a.getPackageManager().getPackageInstaller();
        int id = pi.createSession(new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL));
        try (PackageInstaller.Session s = pi.openSession(id)) {
            HttpURLConnection c = open(base + v.getString("apk"));
            long total = c.getContentLengthLong(), got = 0;
            int last = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = s.openWrite("app.apk", 0, total)) {
                byte[] buf = new byte[65536];
                for (int n; (n = in.read(buf)) > 0; ) {
                    out.write(buf, 0, n);
                    got += n;
                    int pct = total > 0 ? (int) (got * 100 / total) : -1;
                    if (pct != last) { last = pct; status("downloading", String.valueOf(pct)); }
                }
                s.fsync(out);
            }
            status("installing", v.optString("name"));
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            Intent done = new Intent(DONE).setPackage(a.getPackageName());
            s.commit(PendingIntent.getBroadcast(a, id, done, flags).getIntentSender());
        } catch (Exception e) {
            pi.abandonSession(id);
            throw e;
        }
    }

    // GitHub release downloads redirect to its file servers; the version file must not come from a cache
    static HttpURLConnection open(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u + (u.endsWith(".json") ? "?t=" + System.currentTimeMillis() : "")).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setUseCaches(false);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        return c;
    }

    static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        for (int n; (n = in.read(b)) > 0; ) o.write(b, 0, n);
        in.close();
        return o.toByteArray();
    }

    void status(String state, String detail) {
        String js = "window.onAppUpdate && onAppUpdate(" + JSONObject.quote(state) + "," + (detail == null ? "null" : JSONObject.quote(detail)) + ")";
        a.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
}
