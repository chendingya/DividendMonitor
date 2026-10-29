package com.chendingya.dividendmonitor;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Activity teardown must release SQLite on the same plugin thread that owns its transaction. */
@CapacitorPlugin(name = "NativeDatabaseLifecycle")
public class NativeDatabaseLifecyclePlugin extends Plugin {
    private static final String TAG = "NativeDatabaseLifecycle";
    private static final Object RELEASE_LOCK = new Object();
    private static CompletableFuture<Void> lastRelease = CompletableFuture.completedFuture(null);
    private CompletableFuture<Void> previousRelease;
    private boolean ownsConnection;
    private volatile boolean destroying;

    @Override
    public void load() {
        synchronized (RELEASE_LOCK) {
            previousRelease = lastRelease;
        }
    }

    /** Runs on the new Bridge's plugin thread, never blocking the Android UI thread. */
    @PluginMethod
    public void beforeOpen(PluginCall call) {
        try {
            awaitPreviousRelease();
            if (destroying) throw new IllegalStateException("Activity is closing before SQLite can open");
            ownsConnection = true;
            call.resolve();
        } catch (Exception error) {
            call.reject("Previous SQLite connection was not released: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void releaseConnection(PluginCall call) {
        try {
            closeOwnedConnection();
            call.resolve();
        } catch (Exception error) {
            Log.e(TAG, "SQLite initialization cleanup failed", error);
            call.reject("SQLite cleanup failed: " + error.getMessage(), error);
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroying = true;
        CompletableFuture<Void> release = new CompletableFuture<>();
        synchronized (RELEASE_LOCK) {
            lastRelease = release;
        }
        // Bridge invokes this before quitSafely(); all already queued SQL runs before cleanup.
        getBridge().execute(() -> {
            try {
                awaitPreviousRelease();
                closeOwnedConnection();
                release.complete(null);
            } catch (Exception error) {
                Log.e(TAG, "SQLite Activity teardown failed", error);
                release.completeExceptionally(error);
            }
        });
    }

    private void awaitPreviousRelease() throws Exception {
        try {
            previousRelease.get(30, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw error;
        }
    }

    private void closeOwnedConnection() throws Exception {
        // An Activity destroyed before bootstrap has no connection or transaction to release.
        if (!ownsConnection) return;
        PluginHandle handle = getBridge().getPlugin("CapacitorSQLite");
        if (handle == null || !(handle.getInstance() instanceof CapacitorSQLitePlugin)) {
            throw new IllegalStateException("CapacitorSQLite plugin is unavailable during teardown");
        }
        CapacitorSQLitePlugin sqlite = (CapacitorSQLitePlugin) handle.getInstance();
        if (invoke("isDBOpen", sqlite::isDBOpen).optBoolean("result")) {
            if (invoke("isTransactionActive", sqlite::isTransactionActive).optBoolean("result")) {
                invoke("rollbackTransaction", sqlite::rollbackTransaction);
            }
        }
        invoke("closeConnection", sqlite::closeConnection);
        ownsConnection = false;
    }

    /** Adapt the plugin's public synchronous Java methods without a JS callback or reflection. */
    private JSObject invoke(String method, Consumer<PluginCall> operation) throws Exception {
        CompletableFuture<JSObject> result = new CompletableFuture<>();
        JSObject options = new JSObject().put("database", "dividend-monitor").put("readonly", false);
        PluginCall call = new PluginCall(null, "CapacitorSQLite", PluginCall.CALLBACK_ID_DANGLING, method, options) {
            @Override
            public void resolve(JSObject value) { result.complete(value); }

            @Override
            public void resolve() { result.complete(new JSObject()); }

            @Override
            public void reject(String message, String code, Exception error, JSObject data) {
                result.completeExceptionally(new IllegalStateException(message, error));
            }
        };
        operation.accept(call);
        if (!result.isDone()) throw new IllegalStateException("SQLite method did not complete synchronously: " + method);
        return result.get();
    }
}
