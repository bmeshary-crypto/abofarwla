package io.github.bmesharycrypto.abofarwla;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Android shell for the site. A web page can't play http streams or servers
// that don't send CORS headers; this app fetches stream requests itself and
// adds the header, so channels play inside it the way they do in VLC.
public class MainActivity extends Activity {
    static final String SITE = "https://bmeshary-crypto.github.io/abofarwla/";
    WebView web;
    View fullView;
    ValueCallback<Uri[]> pickCallback;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " AbuFarawlaApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith(SITE)) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (r.isForMainFrame() || u.startsWith(SITE) || !u.startsWith("http")) return null;
                String m = r.getMethod();
                Map<String, String> cors = new HashMap<>();
                cors.put("Access-Control-Allow-Origin", "*");
                cors.put("Access-Control-Allow-Headers", "*");
                if ("OPTIONS".equals(m)) return new WebResourceResponse("text/plain", "utf-8", 200, "OK", cors, null);
                if (!"GET".equals(m)) return null;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setInstanceFollowRedirects(true);
                    for (Map.Entry<String, String> h : r.getRequestHeaders().entrySet()) {
                        if (!h.getKey().equalsIgnoreCase("Origin")) c.setRequestProperty(h.getKey(), h.getValue());
                    }
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    Map<String, String> hs = new HashMap<>(cors);
                    for (Map.Entry<String, List<String>> h : c.getHeaderFields().entrySet()) {
                        String k = h.getKey();
                        if (k == null || k.toLowerCase().startsWith("access-control-")) continue;
                        if (k.equalsIgnoreCase("content-encoding") || k.equalsIgnoreCase("content-length")) continue;
                        hs.put(k, h.getValue().get(0));
                    }
                    String type = c.getContentType() == null ? "application/octet-stream" : c.getContentType().split(";")[0];
                    String reason = c.getResponseMessage() == null || c.getResponseMessage().isEmpty() ? "OK" : c.getResponseMessage();
                    return new WebResourceResponse(type, null, code, reason, hs, in);
                } catch (Exception e) {
                    return null;
                }
            }
        });

        // lets the video player go full screen
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                fullView = view;
                ((FrameLayout) getWindow().getDecorView()).addView(view,
                        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
            }

            // file inputs (M3U lists, local videos) need the app to open the picker
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, null), 1); }
                catch (Exception e) { pickCallback = null; return false; }
                return true;
            }

            @Override
            public void onHideCustomView() {
                if (fullView != null) ((FrameLayout) getWindow().getDecorView()).removeView(fullView);
                fullView = null;
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        });

        if (b != null) web.restoreState(b); else web.loadUrl(SITE);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != 1 || pickCallback == null) return;
        Uri[] picked = null;
        if (res == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                picked = new Uri[data.getClipData().getItemCount()];
                for (int i = 0; i < picked.length; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) picked = new Uri[]{data.getData()};
        }
        pickCallback.onReceiveValue(picked);
        pickCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }

    @Override
    public void onBackPressed() {
        if (fullView != null) web.getWebChromeClient().onHideCustomView();
        else if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
