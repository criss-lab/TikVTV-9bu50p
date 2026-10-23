"""Install the real WireGuard GoBackend method-channel host.

Tunnel configuration is read exclusively from Android app-private storage,
never returned to Dart. A separate authenticated native enrollment flow must
write this file before connection can succeed.
"""
from pathlib import Path

source = Path('android/app/src/main/kotlin/com/tikvtv/vpn')
source.mkdir(parents=True, exist_ok=True)
(source / 'InfinityTunnelHost.kt').write_text(r'''package com.tikvtv.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

/**
 * Actual WireGuard tunnel backend. A private config must be provisioned
 * into app-private filesDir/infinity-vpn/tunnel.conf by native enrollment.
 * No secret configuration crosses the Flutter MethodChannel.
 */
class InfinityTunnelHost(private val activity: Activity, engine: FlutterEngine) {
    private val executor = Executors.newSingleThreadExecutor()
    private val backend by lazy { GoBackend(activity.applicationContext) }
    private val tunnel = object : Tunnel {
        override fun getName() = "InfinityVPN"
        override fun onStateChange(newState: Tunnel.State) {}
    }
    private var pending: MethodChannel.Result? = null
    private val channel = MethodChannel(engine.dartExecutor.binaryMessenger, "com.infinity.vpn/tunnel")

    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "status" -> executor.execute {
                    val status = try {
                        if (backend.getState(tunnel) == Tunnel.State.UP) "connected"
                        else if (VpnService.prepare(activity) != null) "permission_required"
                        else "disconnected"
                    } catch (_: Exception) { "disconnected" }
                    activity.runOnUiThread { result.success(status) }
                }
                "connect" -> {
                    if (pending != null) {
                        result.error("BUSY", "VPN permission request already pending", null)
                    } else {
                        val intent = VpnService.prepare(activity)
                        if (intent != null) {
                            pending = result
                            @Suppress("DEPRECATION")
                            activity.startActivityForResult(intent, REQUEST_VPN)
                        } else {
                            connect(result)
                        }
                    }
                }
                "disconnect" -> executor.execute {
                    try {
                        backend.setState(tunnel, Tunnel.State.DOWN, null)
                        activity.runOnUiThread { result.success(null) }
                    } catch (e: Exception) {
                        activity.runOnUiThread { result.error("DISCONNECT_FAILED", e.message, null) }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    fun onActivityResult(requestCode: Int, resultCode: Int): Boolean {
        if (requestCode != REQUEST_VPN) return false
        val result = pending ?: return true
        pending = null
        if (resultCode == Activity.RESULT_OK && VpnService.prepare(activity) == null) connect(result)
        else result.success("permission_required")
        return true
    }

    private fun connect(result: MethodChannel.Result) = executor.execute {
        try {
            val configFile = File(activity.filesDir, "infinity-vpn/tunnel.conf")
            if (!configFile.isFile) {
                activity.runOnUiThread {
                    result.error("NOT_PROVISIONED", "Enroll this device with the Infinity VPN gateway first", null)
                }
                return@execute
            }
            val config = configFile.inputStream().bufferedReader().use { Config.parse(it) }
            val state = backend.setState(tunnel, Tunnel.State.UP, config)
            activity.runOnUiThread { result.success(if (state == Tunnel.State.UP) "connected" else "disconnected") }
        } catch (e: Exception) {
            activity.runOnUiThread { result.error("TUNNEL_FAILED", e.message ?: "WireGuard activation failed", null) }
        }
    }

    companion object { const val REQUEST_VPN = 7021 }
}
''')
# Flutter creates MainActivity in the project package from the generated manifest.
manifest = Path('android/app/src/main/AndroidManifest.xml')
xml = manifest.read_text()
import re
package = 'com.example.tikvtv'
gradle = Path('android/app/build.gradle.kts').read_text()
match = re.search(r'namespace\s*=\s*"([^"]+)"', gradle)
if match:
    package = match.group(1)
activity_file = Path('android/app/src/main/kotlin') / Path(package.replace('.', '/')) / 'MainActivity.kt'
activity_file.parent.mkdir(parents=True, exist_ok=True)
activity_file.write_text('''package %s

import android.content.Intent
import com.ryanheise.audioservice.AudioServiceActivity
import com.tikvtv.vpn.InfinityTunnelHost
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : AudioServiceActivity() {
    private var infinityTunnelHost: InfinityTunnelHost? = null
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        infinityTunnelHost = InfinityTunnelHost(this, flutterEngine)
    }
    @Deprecated("Legacy VPN permission activity result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (infinityTunnelHost?.onActivityResult(requestCode, resultCode) == true) return
        super.onActivityResult(requestCode, resultCode, data)
    }
}
''' % package)
# Use our Activity, rather than replacing it with the audio_service base class.
xml = xml.replace('android:name="com.ryanheise.audioservice.AudioServiceActivity"', 'android:name=".MainActivity"')
manifest.write_text(xml)
print('Native WireGuard MethodChannel host installed in', activity_file)
