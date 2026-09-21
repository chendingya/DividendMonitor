package com.chendingya.dividendmonitor;

import static org.junit.Assert.*;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the packaged React UI; never imports or calls the business API. */
@RunWith(AndroidJUnit4.class)
public class NativeUiFlowTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView did not respond", done.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(ActivityScenario<MainActivity> scenario, String condition) throws Exception {
        for (int attempt = 0; attempt < 120; attempt++) {
            if ("true".equals(evaluate(scenario, "Boolean(" + condition + ")"))) return;
            Thread.sleep(250);
        }
        fail("UI condition failed: " + condition + "\n" + evaluate(scenario, "document.body.innerText"));
    }

    private void ready(ActivityScenario<MainActivity> scenario) throws Exception {
        waitFor(scenario, "document.querySelector('.ledger-topbar-search')");
        assertEquals("Run this test on a phone-sized emulator", "true",
            evaluate(scenario, "innerWidth <= 600"));
    }

    private String button(String label) {
        return "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.replace(/\\s/g,'')==='" + label + "'&&b.getClientRects().length)";
    }

    private void searchBank(ActivityScenario<MainActivity> scenario) throws Exception {
        ready(scenario);
        evaluate(scenario, "(()=>{const i=document.querySelector('.ledger-topbar-search');"
            + "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'601398');"
            + "i.dispatchEvent(new Event('input',{bubbles:true}));})()");
        evaluate(scenario, "document.querySelector('.ledger-topbar-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
        waitFor(scenario, button("查看详情"));
    }

    @Test
    public void searchResultActionsFitPhoneWidth() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            searchBank(scenario);
            assertEquals("Detail action is clipped outside the phone viewport", "true", evaluate(scenario,
                "(()=>{const r=(" + button("查看详情") + ").getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth;})()"));
            assertEquals("Watchlist action is clipped outside the phone viewport", "true", evaluate(scenario,
                "(()=>{const r=(" + button("加入自选") + ").getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth;})()"));
        }
    }

    @Test
    public void searchedStockOpensLoadedDetail() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            searchBank(scenario);
            evaluate(scenario, "(" + button("查看详情") + ").click()");
            for (int attempt = 0; attempt < 360; attempt++) {
                if ("true".equals(evaluate(scenario, "Boolean(document.querySelector('.ledger-detail-header'))"))) {
                    assertEquals("true", evaluate(scenario, "document.querySelector('.ledger-detail-header').textContent.includes('工商银行')"));
                    return;
                }
                Thread.sleep(250);
            }
            fail("Stock detail did not load within 90 seconds: " + evaluate(scenario, "document.body.innerText"));
        }
    }

    @Test
    public void navigationLoginOpensCredentialForm() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ready(scenario);
            evaluate(scenario, "document.querySelector('[aria-label=\"打开导航菜单\"]').click()");
            waitFor(scenario, button("登录/注册"));
            evaluate(scenario, "(" + button("登录/注册") + ").click()");
            waitFor(scenario, "document.querySelector('input[type=password]')");
        }
    }
}
