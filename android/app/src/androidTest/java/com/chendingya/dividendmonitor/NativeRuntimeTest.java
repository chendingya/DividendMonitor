package com.chendingya.dividendmonitor;

import static org.junit.Assert.*;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the packaged application and real Capacitor plugins on a device/emulator. */
@RunWith(AndroidJUnit4.class)
public class NativeRuntimeTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            finished.countDown();
        }));
        assertTrue("WebView evaluation timed out", finished.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private JSONObject run(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        evaluate(scenario, "window.__nativeSmokeResult=null; (async()=>{try {window.__nativeSmokeResult={ok:true,value:await ("
            + expression + ")};}catch(e){window.__nativeSmokeResult={ok:false,error:String(e)}}})();");
        for (int attempt = 0; attempt < 160; attempt++) {
            String result = evaluate(scenario, "window.__nativeSmokeResult");
            if (result != null && !result.equals("null")) {
                JSONObject parsed = new JSONObject(result);
                assertTrue(parsed.optString("error"), parsed.getBoolean("ok"));
                return parsed;
            }
            Thread.sleep(250);
        }
        throw new AssertionError("Native request timed out");
    }

    private void ready(ActivityScenario<MainActivity> scenario) throws Exception {
        boolean initialized = false;
        for (int attempt = 0; attempt < 160; attempt++) {
            String result = evaluate(scenario, "Boolean(document.querySelector('.ledger-page'))");
            if ("true".equals(result)) { initialized = true; break; }
            Thread.sleep(250);
        }
        assertTrue("App bootstrap failed: " + evaluate(scenario, "document.body.innerText"), initialized);
        String chunk = null;
        for (String file : InstrumentationRegistry.getInstrumentation().getTargetContext().getAssets().list("public/assets")) {
            if (file.startsWith("inprocessRuntimeApi-") && file.endsWith(".js")) chunk = file;
        }
        assertNotNull("Packaged inprocess API chunk missing", chunk);
        run(scenario, "import(new URL('/assets/" + chunk + "',location.href).href).then(m=>{window.__nativeSmokeApi=Object.values(m).find(v=>v&&v.watchlist&&v.settings);return !!window.__nativeSmokeApi})");
        assertTrue(run(scenario, "window.__nativeSmokeApi.auth.getSession().then(s=>s===null)").getBoolean("value"));
    }

    @Test
    public void localGroupPersistsAcrossActivityRestart() throws Exception {
        String name = "native-smoke-" + System.currentTimeMillis();
        String groupId;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ready(scenario);
            JSONObject created = run(scenario, "window.__nativeSmokeApi.watchlist.createGroup({name:'" + name + "'})").getJSONObject("value");
            groupId = created.getString("id");
            assertTrue(run(scenario, "window.__nativeSmokeApi.watchlist.listGroups().then(gs=>gs.some(g=>g.id==='" + groupId + "'))").getBoolean("value"));
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ready(scenario);
            assertTrue("Native SQLite data did not survive reopening", run(scenario,
                "window.__nativeSmokeApi.watchlist.listGroups().then(gs=>gs.some(g=>g.id==='" + groupId + "'&&g.name==='" + name + "'))").getBoolean("value"));
            run(scenario, "window.__nativeSmokeApi.watchlist.updateGroup('" + groupId + "',{name:'" + name + "-updated'})");
            assertTrue(run(scenario, "window.__nativeSmokeApi.watchlist.listGroups().then(gs=>gs.some(g=>g.id==='" + groupId + "'&&g.name.endsWith('-updated')))").getBoolean("value"));
            run(scenario, "window.__nativeSmokeApi.watchlist.deleteGroup('" + groupId + "')");
            assertTrue(run(scenario, "window.__nativeSmokeApi.watchlist.listGroups().then(gs=>!gs.some(g=>g.id==='" + groupId + "'))").getBoolean("value"));
        }
    }

    @Test
    public void nativeHttpCanReachMarketData() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ready(scenario);
            JSONObject response = run(scenario,
                "window.Capacitor.nativePromise('CapacitorHttp','request',{url:'https://qt.gtimg.cn/q=sh600519',method:'GET',responseType:'arraybuffer',connectTimeout:15000,readTimeout:15000})").getJSONObject("value");
            assertEquals(200, response.getInt("status"));
            assertFalse(response.getString("data").isEmpty());
            assertTrue("Stock search through the shared use case returned no result", run(scenario,
                "window.__nativeSmokeApi.asset.search({keyword:'600519',assetTypes:['STOCK']}).then(items=>items.some(item=>item.code==='600519'))").getBoolean("value"));
        }
    }
}
