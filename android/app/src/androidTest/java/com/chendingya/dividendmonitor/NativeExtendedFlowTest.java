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

/** Opt-in tests of the packaged phone UI. Only dedicated, logged-out test installs. */
@RunWith(AndroidJUnit4.class)
public class NativeExtendedFlowTest {
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
        for (int attempt = 0; attempt < 240; attempt++) {
            if ("true".equals(evaluate("Boolean(" + condition + ")"))) return;
            Thread.sleep(250);
        }
        fail("UI condition failed: " + condition + "\n" + evaluate("({text:document.body.innerText,lastTap:window.__lastExtendedTap})"));
    }

    private String button(String label) {
        return "Array.from(document.querySelectorAll('button')).find(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden'&&(!b.closest('.ant-drawer')||b.closest('.ant-drawer').classList.contains('ant-drawer-open'))&&b.textContent.replace(/\\s/g,'')===" + JSONObject.quote(label.replaceAll("\\s", "")) + ")";
    }

    private void click(String expression) throws Exception {
        waitFor(expression);
        evaluate("window.__lastExtendedTap=null;document.addEventListener('click',function tap(e){window.__lastExtendedTap={tag:e.target.tagName,text:e.target.textContent?.slice(0,80),x:e.clientX,y:e.clientY};document.removeEventListener('click',tap,true)},true)");
        scenario.onActivity(activity -> {
            android.view.inputmethod.InputMethodManager input = (android.view.inputmethod.InputMethodManager)
                activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
            input.hideSoftInputFromWindow(activity.getBridge().getWebView().getWindowToken(), 0);
        });
        Thread.sleep(250);
        evaluate("(" + expression + ").scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})");
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        Thread.sleep(350);
        waitFor("(()=>{const e=(" + expression + ");if(!e)return false;const r=e.getBoundingClientRect();const v=visualViewport;return r.width>0&&r.height>0&&r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&r.left>=v.offsetLeft&&r.right<=v.offsetLeft+v.width&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()");
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
        long time = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, screen[0], screen[1], 0);
        MotionEvent up = MotionEvent.obtain(time, time + 60, MotionEvent.ACTION_UP, screen[0], screen[1], 0);
        try {
            InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
            SystemClock.sleep(60);
            InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
        } finally { down.recycle(); up.recycle(); }
    }

    private void fill(String selector, String value) throws Exception {
        waitFor("document.querySelector(" + JSONObject.quote(selector) + ")");
        evaluate("(()=>{const i=document.querySelector(" + JSONObject.quote(selector) + ");const proto=i instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()");
    }

    private void nav(String label) throws Exception {
        click("document.querySelector('[aria-label=\"打开导航菜单\"]')");
        waitFor("document.querySelector('.ant-drawer-open .ant-drawer-content-wrapper')&&!document.querySelector('.ant-drawer-content-wrapper-enter-active')");
        String leaf = "Array.from(document.querySelectorAll('.ant-drawer-open .ant-menu-item[role=menuitem]')).find(e=>e.getClientRects().length&&e.textContent.trim()===" + JSONObject.quote(label) + ")";
        if (label.startsWith("回测") && !"true".equals(evaluate("Boolean(" + leaf + ")"))) {
            click("Array.from(document.querySelectorAll('.ant-drawer-open .ant-menu-submenu-title')).find(e=>e.textContent.trim()==='回测')");
        }
        click(leaf);
        waitFor("!document.querySelector('.ant-drawer-open')");
        waitFor("Array.from(document.querySelectorAll('.ant-drawer-content-wrapper')).every(e=>!e.getClientRects().length)");
    }

    private void ready() throws Exception {
        waitFor("document.querySelector('.ledger-topbar-search')");
        if ("true".equals(evaluate("location.hash==='#/'||location.hash===''"))) {
            waitFor("document.querySelector('[data-testid=portfolio-mobile-list]')||document.body.innerText.includes('暂无持仓')");
        }
        assertEquals("Phone-sized emulator required", "true", evaluate("document.documentElement.clientWidth<=600"));
    }

    private void capture(String name) throws Exception {
        android.graphics.Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Screenshot unavailable", shot);
        java.io.File target = new java.io.File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-extended-" + name + ".png");
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(target)) {
            assertTrue(shot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
        } finally { shot.recycle(); }
    }

    private void search(String keyword) throws Exception {
        fill(".ledger-topbar-search", keyword);
        evaluate("document.querySelector('.ledger-topbar-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
        waitFor("document.querySelector('.asset-search-mobile-result')");
    }

    private void etfDetail() throws Exception {
        search("红利ETF");
        String result = "Array.from(document.querySelectorAll('.asset-search-mobile-result')).find(e=>e.textContent.includes('510880'))";
        waitFor(result);
        click("(" + result + ").querySelector('.asset-search-name')");
        waitFor("document.querySelector('.ledger-detail-header')");
        assertEquals("ETF detail must show the selected identity", "true", evaluate("document.querySelector('.ledger-detail-header').textContent.includes('红利ETF')&&document.querySelector('.ledger-detail-header').textContent.includes('510880')"));
        assertEquals("ETF price chart should be available", "true", evaluate("document.body.innerText.includes('价格走势')||document.body.innerText.includes('价格趋势')"));
        assertEquals("Detail page must fit phone width", "true", evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
        assertEquals("Phone should show two income metrics together", "true", evaluate("(()=>{const c=document.querySelectorAll('.ledger-detail-stat');return c.length>=2&&Math.abs(c[0].getBoundingClientRect().top-c[1].getBoundingClientRect().top)<2})()"));
        evaluate("window.scrollTo({top:0,behavior:'instant'})");
        Thread.sleep(350);
        capture("etf");
    }

    private void otherAssetDetails() throws Exception {
        for (String code : new String[] { "160222", "AU9999", "AG9999" }) {
            search(code);
            String result = "Array.from(document.querySelectorAll('.asset-search-mobile-result')).find(e=>e.textContent.includes(" + JSONObject.quote(code) + "))";
            waitFor(result);
            click("(" + result + ").querySelector('.asset-search-name')");
            waitFor("document.querySelector('.ledger-detail-header')");
            assertEquals("Selected asset detail missing: " + code, "true", evaluate("document.querySelector('.ledger-detail-header').textContent.includes(" + JSONObject.quote(code) + ")"));
            if (code.startsWith("AU") || code.startsWith("AG")) {
                waitFor("document.body.innerText.includes('贵金属档案')");
                click(button("克"));
                String price = "Array.from(document.querySelectorAll('.ledger-valuation-card')).find(e=>e.textContent.includes('最新价'))?.querySelector('.ledger-valuation-primary')";
                double gramPrice = Double.parseDouble(evaluate("Number((" + price + ").textContent.replace(/[^0-9.]/g,''))"));
                assertTrue("Metal quote must be positive: " + code, gramPrice > 0);
                click(button("盎司"));
                waitFor("document.body.innerText.includes('人民币 / 盎司')");
                double ouncePrice = Double.parseDouble(evaluate("Number((" + price + ").textContent.replace(/[^0-9.]/g,''))"));
                assertEquals("Gram/ounce conversion must follow the displayed live quote", 31.1035, ouncePrice / gramPrice, 0.1);
                click(button("克"));
            } else {
                assertEquals("Fund price chart missing: " + code, "true", evaluate("document.body.innerText.includes('价格走势')"));
            }
        }
    }

    private String chooseDate(String selector) throws Exception {
        waitFor("document.querySelector(" + JSONObject.quote(selector) + ")");
        assertEquals("Date input must belong to the Ant Design picker", "true", evaluate("Boolean(document.querySelector(" + JSONObject.quote(selector) + ").closest('.ant-picker'))"));
        assertEquals("Date input must use Ant Design rather than the system date dialog", "false", evaluate("document.querySelector(" + JSONObject.quote(selector) + ").type==='date'"));
        click("document.querySelector(" + JSONObject.quote(selector) + ")");
        waitFor("document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-in-view')");
        String cell = "document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-in-view:not(.ant-picker-cell-disabled)')";
        String selected = new org.json.JSONTokener(evaluate("(" + cell + ").title")).nextValue().toString();
        assertEquals("Calendar must stay within the phone viewport", "true", evaluate("(()=>{const r=document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)').getBoundingClientRect();return r.left>=-1&&r.right<=document.documentElement.clientWidth+1})()"));
        assertEquals("Calendar should use Chinese labels", "true", evaluate("document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)').textContent.includes('月')"));
        capture("calendar");
        click(cell);
        waitFor("document.querySelector(" + JSONObject.quote(selector) + ").value===" + JSONObject.quote(selected));
        return selected;
    }

    private void dates() throws Exception {
        nav("投资组合");
        click(button("录入持仓"));
        chooseDate("#openedAt");
        click(button("取消"));
        nav("回测");
        chooseDate("input[aria-label='回测买入日期']");
        nav("分红统计");
        click("document.querySelector('.app-date-range-picker input')");
        waitFor("document.querySelector('.app-date-range-popup:not(.ant-picker-dropdown-hidden) .ant-picker-cell-in-view')");
        assertEquals("Range calendar must fit the phone width", "true", evaluate("(()=>{const r=document.querySelector('.app-date-range-popup:not(.ant-picker-dropdown-hidden)').getBoundingClientRect();return r.left>=-1&&r.right<=document.documentElement.clientWidth+1})()"));
        String first = "document.querySelector('.app-date-range-popup:not(.ant-picker-dropdown-hidden) .ant-picker-cell-in-view:not(.ant-picker-cell-disabled)')";
        click(first);
        String end = "Array.from(document.querySelectorAll('.app-date-range-popup:not(.ant-picker-dropdown-hidden) .ant-picker-cell-in-view:not(.ant-picker-cell-disabled)'))[4]";
        click(end);
        waitFor("Array.from(document.querySelectorAll('.app-date-range-picker input')).every(i=>/^\\d{4}-\\d{2}-\\d{2}$/.test(i.value))");
    }

    private String portfolioCard(String key) {
        return "document.querySelector(" + JSONObject.quote("[data-testid=portfolio-mobile-list] article[data-asset-key='" + key + "']") + ")";
    }

    private void blurCode() throws Exception {
        evaluate("document.querySelector('#code').dispatchEvent(new FocusEvent('focusout',{bubbles:true}))");
    }

    private void addAsset(String code, String key, String shares, String price) throws Exception {
        addAsset(code, key, shares, price, false);
    }

    private void addAsset(String code, String key, String shares, String price, boolean sell) throws Exception {
        click(button("录入持仓"));
        fill("#code", code);
        blurCode();
        waitFor("document.querySelector('#assetKey')?.value===" + JSONObject.quote(key));
        if (sell) {
            click("document.querySelector('#direction').closest('.ant-select').querySelector('.ant-select-selector')");
            click("Array.from(document.querySelectorAll('.ant-select-item-option')).find(e=>e.getClientRects().length&&e.textContent.includes('卖出'))");
        }
        fill("#shares", shares);
        fill("#avgCost", price);
        click(button("添加"));
        waitFor("!document.querySelector('.ant-modal-wrap:not([style*=\"display: none\"]) #shares')");
        waitFor(portfolioCard(key));
    }

    private void removeAsset(String key) throws Exception {
        click("(" + portfolioCard(key) + ").querySelector('[aria-label^=\"删除持仓\"]')");
        click(button("下一步"));
        click(button("确认删除"));
        waitFor("!" + portfolioCard(key));
    }

    private void entries() throws Exception {
        nav("投资组合");
        String etfKey = "ETF:A_SHARE:510880";
        assertEquals("Dedicated test asset must not already have positions", "false", evaluate("Boolean(" + portfolioCard(etfKey) + ")"));
        click(button("录入持仓"));
        fill("#code", "600519");
        blurCode();
        waitFor("document.querySelector('#assetKey')?.value==='STOCK:A_SHARE:600519'");
        fill("#code", "510880");
        blurCode();
        waitFor("document.querySelector('#assetKey')?.value==='ETF:A_SHARE:510880'&&document.querySelector('#name')?.value.includes('红利')");
        fill("#shares", "300");
        fill("#avgCost", "3");
        String date = chooseDate("#openedAt");
        click(button("添加"));
        waitFor("!document.querySelector('.ant-modal-wrap:not([style*=\"display: none\"]) #shares')");
        waitFor("(" + portfolioCard(etfKey) + ")?.textContent.includes('300.00 (1 笔)')");
        click("(" + portfolioCard(etfKey) + ").querySelector('[aria-label^=\"编辑持仓\"]')");
        assertEquals("Calendar-selected date must reopen in the editor", JSONObject.quote(date), evaluate("document.querySelector('#openedAt').value"));
        fill("#shares", "250");
        click(button("保存修改"));
        waitFor("(" + portfolioCard(etfKey) + ")?.textContent.includes('250.00 (1 笔)')");
        addAsset("510880", etfKey, "100", "3.1");
        waitFor("(" + portfolioCard(etfKey) + ")?.textContent.includes('350.00 (2 笔)')");
        addAsset("510880", etfKey, "100", "3.2", true);
        waitFor("(" + portfolioCard(etfKey) + ")?.textContent.includes('250.00 (3 笔)')");
        assertEquals("SELL commission must reduce proceeds; remaining ETF cost should be 755 / 250", "true", evaluate("(" + portfolioCard(etfKey) + ").textContent.includes('¥3.020')"));
        scenario.recreate();
        ready();
        waitFor("(" + portfolioCard(etfKey) + ")?.textContent.includes('250.00 (3 笔)')");
        removeAsset(etfKey);

        addAsset("160222", "FUND:A_SHARE:160222", "80", "1.2");
        removeAsset("FUND:A_SHARE:160222");
        addAsset("AU9999", "GOLD:SGE:AU9999", "10", "500");
        removeAsset("GOLD:SGE:AU9999");
        // The pre-existing cloud-restored bank trades must remain untouched.
        waitFor("(" + portfolioCard("STOCK:A_SHARE:601398") + ")?.textContent.includes('200.00 (2 笔)')");
    }

    private void deleteMultipleTrades() throws Exception {
        nav("投资组合");
        String key = "ETF:A_SHARE:510880";
        assertEquals("Dedicated test asset must be empty", "false", evaluate("Boolean(" + portfolioCard(key) + ")"));
        addAsset("510880", key, "300", "3");
        addAsset("510880", key, "100", "3");
        waitFor("(" + portfolioCard(key) + ")?.textContent.includes('400.00 (2 笔)')");
        removeAsset(key);
    }

    private void openBeijing() throws Exception {
        nav("房产");
        click(button("北京"));
        waitFor("document.querySelector('#priceTotalYuan')");
        assertEquals("Housing inputs need 44px phone touch targets", "true", evaluate("Array.from(document.querySelectorAll('[data-testid=housing-custom-form] input')).every(e=>e.getBoundingClientRect().height>=44)"));
    }

    private void housing() throws Exception {
        openBeijing();
        assertEquals("Dedicated test city must start without custom data", "true", evaluate("!document.querySelector('#priceTotalYuan').value&&!document.querySelector('#rentTotalMonthYuan').value"));
        fill("#priceTotalYuan", "5000000");
        fill("#rentTotalMonthYuan", "8000");
        fill("#district", "朝阳区");
        fill("#community", "模拟器验收小区");
        fill("#note", "native-extended-test");
        click(button("保存"));
        waitFor("document.querySelector('[data-testid=housing-custom-summary]')?.textContent.includes('1.92%')");
        evaluate("document.querySelector('[data-testid=housing-custom-summary]').scrollIntoView({block:'start'})");
        capture("housing");
        nav("投资组合");
        openBeijing();
        assertEquals("Saved total price must survive navigation", "5000000", evaluate("Number(document.querySelector('#priceTotalYuan').value.replaceAll(',',''))"));
        assertEquals("Saved community must survive navigation", JSONObject.quote("模拟器验收小区"), evaluate("document.querySelector('#community').value"));
        fill("#rentTotalMonthYuan", "10000");
        click(button("保存"));
        waitFor("document.querySelector('[data-testid=housing-custom-summary]')?.textContent.includes('2.40%')");
        scenario.recreate();
        ready();
        openBeijing();
        waitFor("document.querySelector('[data-testid=housing-custom-summary]')?.textContent.includes('2.40%')");
        assertEquals("Saved monthly rent must survive Activity restart", "10000", evaluate("Number(document.querySelector('#rentTotalMonthYuan').value.replaceAll(',',''))"));
        click(button("清除"));
        click("document.querySelector('.ant-popconfirm-buttons .ant-btn-primary')");
        waitFor("!document.querySelector('#priceTotalYuan').value&&!document.querySelector('#rentTotalMonthYuan').value");
        nav("房产");
        click(button("房贷计算器"));
        fill("#totalPrice", "300");
        fill("#downPaymentPercent", "30");
        fill("#loanYears", "30");
        fill("#annualInterestRate", "3.1");
        click(button("计算"));
        waitFor("document.body.innerText.includes('贷款金额')&&document.body.innerText.includes('月供')");
        assertEquals("Housing/calculator page must fit phone width", "true", evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
    }

    private void backtest() throws Exception {
        search("510880");
        click("Array.from(document.querySelectorAll('.asset-search-mobile-result')).find(e=>e.textContent.includes('510880')).querySelector('.asset-search-name')");
        waitFor("document.querySelector('.ledger-detail-header')");
        click(button("进入回测"));
        waitFor("document.body.innerText.includes('回测摘要')&&document.body.innerText.includes('累计现金分红')");
        assertEquals("Backtest should render a real chart", "true", evaluate("document.querySelectorAll('canvas').length>0"));
        assertEquals("Backtest page must fit phone width", "true", evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
    }

    @Test
    public void extendedUserJourney() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        String phase = args.getString("extendedPhase", "");
        Assume.assumeFalse("Explicit extendedPhase required on a dedicated test install", phase.isEmpty());
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            scenario = activity;
            ready();
            switch (phase) {
                case "etf": etfDetail(); break;
                case "details": otherAssetDetails(); break;
                case "dates": dates(); break;
                case "entries": entries(); break;
                case "housing": housing(); break;
                case "backtest": backtest(); break;
                case "delete": deleteMultipleTrades(); break;
                case "cleanup": if ("true".equals(evaluate("Boolean(" + portfolioCard("ETF:A_SHARE:510880") + ")"))) removeAsset("ETF:A_SHARE:510880"); break;
                default: fail("Unknown extendedPhase: " + phase);
            }
        }
    }
}
