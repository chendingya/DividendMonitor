package com.chendingya.dividendmonitor;

import static org.junit.Assert.*;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Opt-in, real packaged UI journey. No business API imports or database setup. */
@RunWith(AndroidJUnit4.class)
public class NativeUserJourneyTest {
    private static final String BANK = "[data-testid=\"portfolio-mobile-list\"] article[data-asset-key=\"STOCK:A_SHARE:601398\"]";
    private ActivityScenario<MainActivity> scenario;

    private String evaluate(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView did not respond", done.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(String condition) throws Exception {
        for (int attempt = 0; attempt < 360; attempt++) {
            if ("true".equals(evaluate("Boolean(" + condition + ")"))) return;
            Thread.sleep(250);
        }
        fail("UI condition failed: " + condition + "\n" + evaluate("document.body.innerText"));
    }

    private String button(String text) {
        return "Array.from(document.querySelectorAll('button')).find(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden'&&(!b.closest('.ant-drawer')||b.closest('.ant-drawer').classList.contains('ant-drawer-open'))&&b.textContent.replace(/\\s/g,'')===" + JSONObject.quote(text.replaceAll("\\s", "")) + ")";
    }

    private void click(String expression) throws Exception {
        waitFor(expression);
        evaluate("(" + expression + ").scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})");
        // DOM scrolling returns before WebView's compositor has presented the new frame.
        // Native input must use the settled frame rather than the previous scroll position.
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        Thread.sleep(350);
        waitFor("(()=>{const e=(" + expression + ");if(!e)return false;const r=e.getBoundingClientRect();"
            + "const v=visualViewport;return r.width>0&&r.height>0&&r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&r.left>=v.offsetLeft&&r.right<=v.offsetLeft+v.width"
            + "&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()");
        JSONObject point = new JSONObject(evaluate("(()=>{const r=(" + expression + ").getBoundingClientRect();const v=visualViewport;return {x:r.left+r.width/2-v.offsetLeft,y:r.top+r.height/2-v.offsetTop,width:v.width}})()"));
        float[] screen = new float[2];
        scenario.onActivity(activity -> {
            android.webkit.WebView view = activity.getBridge().getWebView();
            int[] origin = new int[2];
            view.getLocationOnScreen(origin);
            float scale = view.getWidth() / (float) point.optDouble("width");
            screen[0] = origin[0] + (float) point.optDouble("x") * scale;
            screen[1] = origin[1] + (float) point.optDouble("y") * scale;
        });
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, screen[0], screen[1], 0);
        MotionEvent up = MotionEvent.obtain(downTime, downTime + 60, MotionEvent.ACTION_UP, screen[0], screen[1], 0);
        try {
            InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
            SystemClock.sleep(60);
            InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
        } finally {
            down.recycle();
            up.recycle();
        }
    }

    private void fill(String selector, String value) throws Exception {
        waitFor("document.querySelector(" + JSONObject.quote(selector) + ")");
        evaluate("(()=>{const i=document.querySelector(" + JSONObject.quote(selector) + ");"
            + "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");"
            + "i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()");
    }

    private void nav(String label) throws Exception {
        click("document.querySelector('[aria-label=\"打开导航菜单\"]')");
        click("Array.from(document.querySelectorAll('[role=menuitem]')).find(e=>e.getClientRects().length&&e.textContent.trim()===" + JSONObject.quote(label) + ")");
        waitFor("!document.querySelector('.ant-drawer-open')");
        waitFor("Array.from(document.querySelectorAll('.ant-drawer-content-wrapper')).every(e=>!e.getClientRects().length)");
    }

    private void loginForm() throws Exception {
        waitFor("document.querySelector('.ledger-page')");
        if (!"true".equals(evaluate("Boolean(document.querySelector('input[type=password]'))"))) {
            click("document.querySelector('[aria-label=\"打开导航菜单\"]')");
            click(button("登录/注册"));
        }
        waitFor("document.querySelector('input[type=password]')");
    }

    private void login(Bundle args) throws Exception {
        loginForm();
        fill("input[placeholder='your@email.com']", args.getString("email"));
        fill("input[type=password]", args.getString("password"));
        click(button("登录"));
        waitFor("document.querySelector('.ledger-topbar-search')");
    }

    private void register(Bundle args) throws Exception {
        loginForm();
        click(button("没有账号？注册"));
        fill("input[placeholder='your@email.com']", args.getString("email"));
        fill("input[placeholder='至少 6 位密码']", args.getString("password"));
        fill("input[placeholder='再次输入密码']", args.getString("password"));
        click(button("注册新账号"));
        waitFor("document.querySelector('.ledger-topbar-search')||document.body.innerText.includes('注册成功')||document.body.innerText.includes('注册失败')");
        assertEquals("Registration failed: " + evaluate("document.body.innerText"), "true",
            evaluate("Boolean(document.querySelector('.ledger-topbar-search'))||document.body.innerText.includes('注册成功')"));
    }

    private void search() throws Exception {
        fill(".ledger-topbar-search", "601398");
        evaluate("document.querySelector('.ledger-topbar-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
        waitFor(button("查看详情"));
    }

    private void addPosition() throws Exception {
        click(button("录入持仓"));
        fill("#code", "601398");
        // Blur performs the same asset lookup as entering a code in the form.
        evaluate("document.querySelector('#code').dispatchEvent(new FocusEvent('focusout',{bubbles:true}))");
        waitFor("document.querySelector('#name')?.value==='工商银行'");
        fill("#shares", "100");
        fill("#avgCost", "5");
        fill("#openedAt", "2026-10-01");
        click(button("添加"));
        waitFor("!document.querySelector('.ant-modal-wrap:not([style*=\"display: none\"]) #shares')");
    }

    private void assertPortfolio() throws Exception {
        waitFor("document.querySelector(" + JSONObject.quote(BANK) + ")?.textContent.includes('200.00 (2 笔)')");
        assertEquals("true", evaluate("document.querySelector(" + JSONObject.quote(BANK) + ").textContent.includes('2026-10-01')"));
    }

    private void editOneTrade() throws Exception {
        click("document.querySelector(" + JSONObject.quote(BANK + " summary") + ")");
        click("document.querySelector(" + JSONObject.quote(BANK + " [aria-label^='编辑此笔 ']") + ")");
        waitFor("document.querySelector('#shares')");
        assertEquals("Editing one of two 100-share trades must use 100 shares", "100", evaluate("Number(document.querySelector('#shares').value)"));
        assertEquals("Cloud-restored buy date must remain editable", "\"2026-10-01\"", evaluate("document.querySelector('#openedAt').value"));
        assertEquals("Phone editor must keep its footer visible while the form scrolls", "true", evaluate(
            "(()=>{const r=document.querySelector('.portfolio-editor-modal .ant-modal-footer').getBoundingClientRect();const v=visualViewport;return r.width>0&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1})()"));
        click(button("保存修改"));
        waitFor("!document.querySelector('.ant-modal-wrap:not([style*=\"display: none\"]) #shares')");
        assertPortfolio();
    }

    private void createJourney() throws Exception {
        waitFor("document.querySelector('.ledger-topbar-search')");
        search();
        click(button("查看详情"));
        waitFor("document.querySelector('.ledger-detail-header')?.textContent.includes('工商银行')");
        click(button("加入自选"));
        waitFor("document.body.innerText.includes('移出自选')||document.body.innerText.includes('已在自选')");
        nav("自选");
        waitFor("document.querySelector('.ledger-data-body')?.textContent.includes('工商银行')");
        nav("投资组合");
        // This journey is for a dedicated test installation, never an existing portfolio.
        assertEquals("Test installation must start with an empty portfolio", "false", evaluate("Boolean(document.querySelector(" + JSONObject.quote(BANK) + "))"));
        addPosition();
        addPosition();
        assertPortfolio();
        editOneTrade();
    }

    private void verifyJourney() throws Exception {
        waitFor("document.querySelector('.ledger-topbar-search')");
        assertPortfolio();
        nav("自选");
        waitFor("document.querySelector('.ledger-data-body')?.textContent.includes('工商银行')");
        nav("投资组合");
        assertPortfolio();
    }

    private void sync(String label) throws Exception {
        nav("用户中心");
        waitFor("document.querySelector('.user-center-sync-actions')");
        assertEquals("Phone user center must not overflow horizontally", "true",
            evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
        assertEquals("Sync controls must fit and have 44px touch targets", "true", evaluate(
            "Array.from(document.querySelectorAll('.user-center-sync-actions button')).every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.width>0&&r.left>=0&&r.right<=document.documentElement.clientWidth+1})"));
        click(button(label));
        waitFor("document.body.innerText.includes('推送自选')||document.body.innerText.includes('拉取自选')||document.body.innerText.includes('同步失败')||/同步完成（[1-9]/.test(document.body.innerText)");
        assertEquals("Cloud sync failed: " + evaluate("document.body.innerText"), "false",
            evaluate("document.body.innerText.includes('同步失败')||/同步完成（[1-9]/.test(document.body.innerText)"));
        Bundle progress = new Bundle();
        progress.putString("stream", "[journey] " + evaluate("document.body.innerText.match(/(?:推送自选|拉取自选)[^\\n]*/g)") + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(2, progress);
        if (label.equals("仅拉取云端到本地")) {
            assertEquals("Test cloud portfolio must contain both saved trades", "true",
                evaluate("document.body.innerText.includes('拉取自选 1 条')&&document.body.innerText.includes('拉取持仓 2 条')"));
        }
        long portfolioStart = SystemClock.elapsedRealtime();
        nav("投资组合");
        assertPortfolio();
        progress = new Bundle();
        progress.putString("stream", "[journey] Portfolio visible after sync in " + (SystemClock.elapsedRealtime() - portfolioStart) + " ms\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(2, progress);
    }

    private void restore(Bundle args) throws Exception {
        login(args);
        sync("仅拉取云端到本地");
        verifyJourney();
        editOneTrade();
        logoutAndVerify();
    }

    private void logoutAndVerify() throws Exception {
        nav("用户中心");
        click(button("退出登录"));
        waitFor("document.querySelector('.ledger-topbar-search')");
        // Logged-out UI reads native SQLite, proving the cloud pull repopulated it.
        verifyJourney();
    }

    private void assertPhoneLayout() throws Exception {
        waitFor("document.querySelector('.dashboard-mobile-hero')");
        assertEquals("Run layout checks on a phone viewport", "true", evaluate("innerWidth>=320&&innerWidth<=600"));
        assertEquals("Layout regions must be visible", "true", evaluate(
            "['.dashboard-mobile-hero','.ledger-topbar','.dashboard-overview'].every(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'})"));
        assertEquals("Both primary actions must exist", "2", evaluate("document.querySelectorAll('.dashboard-mobile-primary-actions button').length"));
        assertEquals("All three overview metrics must exist", "3", evaluate("document.querySelectorAll('.dashboard-overview>.ledger-metric-panel').length"));
        assertEquals("Phone page must not overflow horizontally", "true", evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
        assertEquals("Phone hero consumes too much of the first screen", "true", evaluate(
            "document.querySelector('.dashboard-mobile-hero').getBoundingClientRect().height<=220"));
        assertEquals("Phone top bar is too tall", "true", evaluate(
            "document.querySelector('.ledger-topbar').getBoundingClientRect().height<=88"));
        assertEquals("Overview should show several metrics together", "true", evaluate(
            "document.querySelector('.dashboard-overview').getBoundingClientRect().height<=270"));
        assertEquals("Title must stay on one line", "true", evaluate(
            "(()=>{const e=document.querySelector('.dashboard-mobile-heading h1');return e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)*1.2})()"));
        assertEquals("Main phone actions need a 44px touch target", "true", evaluate(
            "Array.from(document.querySelectorAll('.dashboard-mobile-primary-actions button')).every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.width>0&&r.left>=0&&r.right<=innerWidth})"));
    }

    @Test
    public void fullUserJourney() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        String phase = args.getString("journeyPhase", "");
        Assume.assumeFalse("Explicit journeyPhase required on a dedicated test installation", phase.isEmpty());
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            scenario = activity;
            switch (phase) {
                case "register": register(args); break;
                case "login": login(args); break;
                case "create": createJourney(); break;
                case "verify": verifyJourney(); break;
                case "edit": editOneTrade(); break;
                case "sync": sync("双向同步"); break;
                case "pull": sync("仅拉取云端到本地"); break;
                case "restore": restore(args); break;
                case "logout": logoutAndVerify(); break;
                case "layout": assertPhoneLayout(); break;
                default: fail("Unknown journey phase");
            }
        }
    }
}
