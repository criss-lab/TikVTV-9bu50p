"""Install the native VPN consent bridge into the generated Flutter runner.

This intentionally never reports a connected VPN until a real tunnel backend
has been provisioned. Android VpnService permission alone is not a tunnel.
"""
from pathlib import Path

manifest = Path('android/app/src/main/AndroidManifest.xml')
xml = manifest.read_text()
permission = '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />'
if permission not in xml:
    xml = xml.replace('<application', permission + '\n    <application', 1)
if 'com.tikvtv.vpn.InfinityVpnService' not in xml:
    service = '''
        <service android:name="com.tikvtv.vpn.InfinityVpnService"
            android:permission="android.permission.BIND_VPN_SERVICE"
            android:exported="true"
            android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="User-consented VPN tunnel" />
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
        </service>
'''
    xml = xml.replace('</application>', service + '    </application>', 1)
manifest.write_text(xml)

source = Path('android/app/src/main/kotlin/com/tikvtv/vpn')
source.mkdir(parents=True, exist_ok=True)
(source / 'InfinityVpnService.kt').write_text('''package com.tikvtv.vpn

import android.net.VpnService

/**
 * Android entry point for OS-managed Always-on VPN.
 * No fake establish(): a TUN without a packet-forwarding engine would blackhole traffic.
 * The real WireGuard backend must be installed before connecting is enabled.
 */
class InfinityVpnService : VpnService() {
    override fun onRevoke() {
        super.onRevoke()
        stopSelf()
    }
}
''')
print('Native VPN service manifest and Android entry point installed')
