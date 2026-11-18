package cn.sqlstudy.offline;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String HOST = "app.sqlshouji.local";
    private static final int OPEN_FILE = 101;
    private static final int SAVE_FILE = 102;
    private WebView webView;
    private AppUpdater updater;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingExport;
    private final java.util.concurrent.ExecutorService fileExecutor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        getWindow().setStatusBarColor(Color.rgb(247,250,251));
        getWindow().setNavigationBarColor(Color.WHITE);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(247,250,251));
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(webView, new android.widget.FrameLayout.LayoutParams(-1, -1));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets system = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(system.left, system.top, system.right, Math.max(system.bottom, keyboard.bottom));
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            if (android.os.Build.VERSION.SDK_INT >= 30) return WindowInsets.CONSUMED;
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.addJavascriptInterface(new FilesBridge(), "AndroidFiles");
        updater = new AppUpdater(this, webView);
        webView.addJavascriptInterface(updater, "AndroidUpdates");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return localResource(request.getUrl());
            }
        });
        // Web Workers have a separate request client on modern Android WebView.
        android.webkit.ServiceWorkerController.getInstance().setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return localResource(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try { startActivityForResult(intent, OPEN_FILE); }
                catch (Exception error) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确认",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();
                return true;
            }
            @Override public boolean onJsPrompt(WebView view, String url, String message, String value, android.webkit.JsPromptResult result) {
                android.widget.EditText text = new android.widget.EditText(MainActivity.this);
                text.setText(value);
                new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setView(text).setPositiveButton("保存",(d,w)->result.confirm(text.getText().toString())).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();
                return true;
            }
        });
        if (getApplicationInfo().flags != 0 && (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBackPressed);
        }
        webView.loadUrl("https://" + HOST + "/index.html");
    }
    private boolean isLocal(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()); }
    private WebResourceResponse localResource(Uri uri) {
        try {
            if (!isLocal(uri)) throw new IllegalArgumentException();
            String path = uri.getPath();
            if (path == null || path.contains("..") || path.contains("\\")) throw new IllegalArgumentException();
            path = path.substring(1);
            if (path.isEmpty()) path = "index.html";
            String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".json") ? "application/json" : path.endsWith(".css") ? "text/css" : path.endsWith(".png") ? "image/png" : path.endsWith(".html") ? "text/html" : "application/octet-stream";
            return new WebResourceResponse(mime, "UTF-8", getAssets().open(path));
        } catch (Exception error) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }
    public final class FilesBridge {
        @JavascriptInterface public void save(String name, String mime, String body) {
            if (body.length() > 230 * 1024 * 1024) return;
            main.post(() -> {
                if (pendingExport != null) return;
                pendingExport = body;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[/\\\\]", "_"));
                try { startActivityForResult(intent, SAVE_FILE); }
                catch (Exception error) { pendingExport = null; Toast.makeText(MainActivity.this,"无法打开文件保存界面",Toast.LENGTH_LONG).show(); }
            });
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode == OPEN_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(resultCode == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
            fileCallback = null;
        }
        if (requestCode == SAVE_FILE) {
            final String body = pendingExport;
            pendingExport = null;
            if (body == null || resultCode != RESULT_OK || data == null || data.getData() == null) return;
            final Uri uri = data.getData();
            fileExecutor.execute(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(uri,"wt")) {
                    if (stream == null) throw new java.io.IOException();
                    stream.write(body.getBytes(StandardCharsets.UTF_8));
                    main.post(() -> Toast.makeText(this,"文件已保存",Toast.LENGTH_LONG).show());
                } catch (Exception error) {
                    main.post(() -> Toast.makeText(this,"保存失败，请重新导出",Toast.LENGTH_LONG).show());
                }
            });
        }
    }
    @Override public void onBackPressed() {
        webView.evaluateJavascript("window.onNativeBack ? window.onNativeBack() : false", result -> {
            if (!"true".equals(result)) finish();
        });
    }
    @Override protected void onDestroy() { fileExecutor.shutdown(); if(updater!=null)updater.close(); webView.destroy(); super.onDestroy(); }
    @Override protected void onPause() { super.onPause(); webView.evaluateJavascript("window.onNativePause && window.onNativePause()",null); }
}
