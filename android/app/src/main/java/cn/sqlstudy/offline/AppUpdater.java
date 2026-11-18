package cn.sqlstudy.offline;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AppUpdater {
    private static final String API = "https://api.github.com/repos/chungcy00/SQLIsland/releases/latest";
    private static final String REPOSITORY = "https://github.com/chungcy00/SQLIsland/releases";
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean working = new AtomicBoolean(false);
    private final File apk;
    private JSONObject release;

    public AppUpdater(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.apk = new File(activity.getFilesDir(), "updates/update.apk");
        String cached = activity.getSharedPreferences("updates",0).getString("release", "");
        try { if (!cached.isEmpty()) release = new JSONObject(cached); }
        catch (Exception ignored) { release = null; }
    }
    private PackageInfo installed() throws Exception {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
    }
    @JavascriptInterface public String getInfo() {
        JSONObject result = new JSONObject();
        try {
            PackageInfo info = installed();
            result.put("versionName",info.versionName).put("versionCode",info.getLongVersionCode()).put("repository",REPOSITORY);
            if (release != null && release.getLong("versionCode") > info.getLongVersionCode() && apk.exists()) {
                result.put("release",release).put("ready",true);
            }
        } catch (Exception error) { try { result.put("error",error.getMessage()); } catch (Exception ignored) {} }
        return result.toString();
    }
    private void send(String status, String message, int progress) {
        JSONObject event = new JSONObject();
        try {
            event.put("status",status).put("message",message).put("progress",progress);
            if (release != null) event.put("release",release);
        } catch (Exception ignored) {}
        final String json = event.toString();
        activity.runOnUiThread(() -> webView.evaluateJavascript("window.onUpdateEvent && window.onUpdateEvent("+json+")",null));
    }
    @JavascriptInterface public void check() {
        if (!working.compareAndSet(false,true)) return;
        send("checking","正在检查版本…",0);
        executor.execute(() -> {
            try {
                JSONObject latest = readJson(API);
                JSONArray assets = latest.optJSONArray("assets");
                String manifest = null;
                if (assets != null) for(int i=0;i<assets.length();i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    if ("update.json".equals(asset.optString("name"))) manifest = asset.optString("browser_download_url");
                }
                if (manifest == null) throw new Exception("该版本缺少 update.json 更新清单。");
                JSONObject candidate = readJson(manifest);
                if (candidate.getLong("versionCode") <= 0 || candidate.getString("versionName").isEmpty()) throw new Exception("版本信息不完整。");
                if (!candidate.getString("sha256").matches("[a-fA-F0-9]{64}")) throw new Exception("更新清单缺少有效的 SHA-256。");
                requireHttps(candidate.getString("apkUrl"));
                release = candidate;
                if (candidate.getLong("versionCode") <= installed().getLongVersionCode()) send("latest","已是最新版本",0);
                else send("available","发现新版本",0);
            } catch (Unpublished error) { send("unpublished","更新源尚未发布版本",0); }
            catch (Exception error) { send("error","检查失败，"+friendly(error),0); }
            finally { working.set(false); }
        });
    }
    @JavascriptInterface public void download() {
        if (release == null || !working.compareAndSet(false,true)) return;
        final JSONObject selected = release;
        send("downloading","正在下载安装包…",0);
        executor.execute(() -> {
            File part = new File(apk.getParentFile(), "update.part");
            HttpURLConnection connection = null;
            try {
                if (!apk.getParentFile().exists() && !apk.getParentFile().mkdirs()) throw new Exception("无法创建更新目录。");
                connection = open(selected.getString("apkUrl"));
                long length = connection.getContentLengthLong();
                if (length > 250L*1024*1024) throw new Exception("安装包超过 250 MB。");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long received = 0; int previous = -1;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part)) {
                    byte[] buffer = new byte[32768]; int count;
                    while((count=input.read(buffer)) != -1) {
                        received += count;
                        if(received > 250L*1024*1024) throw new Exception("安装包超过 250 MB。");
                        digest.update(buffer,0,count);output.write(buffer,0,count);
                        int progress = length > 0 ? (int)Math.min(99,received*100/length) : 0;
                        if(progress != previous) { previous = progress;send("downloading","正在下载安装包…",progress); }
                    }
                    output.getFD().sync();
                }
                if (!hex(digest.digest()).equalsIgnoreCase(selected.getString("sha256"))) throw new Exception("安装包校验失败，请重新下载。");
                validate(part,selected);
                if (apk.exists() && !apk.delete()) throw new Exception("无法替换旧下载文件。");
                if (!part.renameTo(apk)) throw new Exception("无法保存安装包。");
                activity.getSharedPreferences("updates",0).edit().putString("release",selected.toString()).apply();
                send("ready","下载与校验完成",100);
            } catch (Exception error) { part.delete();send("error","下载失败，"+friendly(error),0); }
            finally { if(connection != null) connection.disconnect();working.set(false); }
        });
    }
    private void validate(File file, JSONObject selected) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try(InputStream input = new FileInputStream(file)) { byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1)digest.update(buffer,0,count); }
        if(!hex(digest.digest()).equalsIgnoreCase(selected.getString("sha256"))) throw new Exception("安装包 SHA-256 不匹配。");
        PackageInfo archive=activity.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo current=installed();
        if(archive==null||!activity.getPackageName().equals(archive.packageName))throw new Exception("安装包不属于 数屿SQL。");
        if(archive.getLongVersionCode()!=selected.getLong("versionCode")||archive.getLongVersionCode()<=current.getLongVersionCode())throw new Exception("安装包版本不匹配。");
        if(!certificates(archive).equals(certificates(current)))throw new Exception("签名不同，无法覆盖更新。请保留现有应用与记录。");
    }
    private Set<String> certificates(PackageInfo info) throws Exception {
        if(info.signingInfo==null)throw new Exception("安装包缺少签名。");
        Set<String> values=new HashSet<>();
        for(Signature signature:info.signingInfo.getApkContentsSigners()) values.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        if(values.isEmpty())throw new Exception("安装包缺少签名。");
        return values;
    }
    @JavascriptInterface public void install() {
        if(release==null||!working.compareAndSet(false,true))return;
        final JSONObject selected=release;
        executor.execute(() -> {
            try {
                validate(apk,selected);
                activity.runOnUiThread(() -> {
                    try {
                        if(!activity.getPackageManager().canRequestPackageInstalls()) {
                            send("permission","请允许 数屿SQL安装应用，然后返回点击安装更新。",100);
                            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));
                            return;
                        }
                        Intent intent=new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(Uri.parse("content://"+activity.getPackageName()+".updates/update.apk"),"application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(intent);
                        send("ready","请在安卓安装界面确认更新。",100);
                    }catch(Exception error){send("error","无法打开安装器，"+friendly(error),0);}
                });
            }catch(Exception error){send("error",friendly(error),0);}
            finally{working.set(false);}
        });
    }
    private JSONObject readJson(String url) throws Exception {
        HttpURLConnection connection=open(url);
        try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192];int count;
            while((count=input.read(buffer))!=-1){output.write(buffer,0,count);if(output.size()>1024*1024)throw new Exception("更新信息过大。");}
            return new JSONObject(output.toString("UTF-8"));
        }finally{connection.disconnect();}
    }
    private HttpURLConnection open(String url) throws Exception {
        for(int redirects=0;redirects<6;redirects++) {
            requireHttps(url);
            HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
            connection.setConnectTimeout(15000);connection.setReadTimeout(30000);connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent","SQL-Shouji-Android");connection.setRequestProperty("Accept","application/vnd.github+json,application/json,application/octet-stream");
            int status=connection.getResponseCode();
            if(status>=300&&status<400){String location=connection.getHeaderField("Location");connection.disconnect();url=new URL(new URL(url),location).toString();continue;}
            if(status==404){connection.disconnect();throw new Unpublished();}
            if(status<200||status>=300){connection.disconnect();throw new Exception("服务器返回 "+status+"。");}
            return connection;
        }
        throw new Exception("下载地址重定向次数过多。");
    }
    private void requireHttps(String url) throws Exception { if(!"https".equals(new URL(url).getProtocol()))throw new Exception("更新地址需要使用 HTTPS。"); }
    private String friendly(Exception error) {
        if(error instanceof java.net.UnknownHostException)return "请检查网络连接后重试。";
        if(error instanceof java.net.SocketTimeoutException)return "连接超时，请重试。";
        return error.getMessage()==null?"请检查网络后重试。":error.getMessage();
    }
    private String hex(byte[] bytes){StringBuilder result=new StringBuilder();for(byte value:bytes)result.append(String.format("%02x",value&255));return result.toString();}
    public void close(){executor.shutdown();}
    private static final class Unpublished extends Exception {}
}
