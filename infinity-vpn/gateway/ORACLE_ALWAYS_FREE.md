# Oracle Cloud Always Free gateway deployment

This is the selected **free-tier-only** infrastructure for Infinity VPN. Oracle
account acceptance, regional capacity and Always Free eligibility are external
requirements. Do not select a paid shape, boot volume or network add-on. Verify
the current Oracle pricing/eligibility screen before creating the instance.

1. In Oracle Cloud, create an Always Free eligible Ubuntu VM, preferably
   Ubuntu 24.04, with a public IPv4 address. Keep SSH private-key access.
2. Create an ingress rule in the subnet security list or applicable NSG for
   UDP 51820 from 0.0.0.0/0. Restrict TCP 22 to your administration IP.
   Keep default egress enabled. Oracle cloud firewall AND Ubuntu firewall
   must both permit the WireGuard UDP port.
3. SSH into the VM and identify the default egress interface:
   `ip -4 route show default`. Install and run the gateway installer from
   this repository after reviewing it. For example:

   ```bash
   sudo env WG_PUBLIC_ENDPOINT=YOUR_PUBLIC_IPV4 WG_UPLINK_INTERFACE=ens3 \
      bash infinity-vpn/gateway/bootstrap-ubuntu.sh
   sudo wg show wg0
   sudo systemctl status wg-quick@wg0 --no-pager
   ```

   Replace ens3 with the actual interface. Never publish server.key,
   wg0.conf or client private keys.
4. Record only the gateway public key, public endpoint and port in the
   private Supabase vpn.gateways table. Keep enabled=false until a real
   client handshake and outbound traffic test succeed.
5. Enroll a device by creating its private key on the device, submitting
   its public key through an authenticated Supabase Edge Function, and
   having the privileged gateway agent add that peer. The Edge Function
   and agent are still to be implemented; do not distribute administrator
   credentials to clients or manually mark pending devices active.
6. Verify handshake with `sudo wg show wg0 latest-handshakes transfer`,
   verify traffic through the gateway, verify DNS, reconnection and
   Android consent. A successful build or interface UP is insufficient.

## Free-tier limitations
No SLA or guaranteed capacity. Public IPv4, outbound bandwidth, instance
limits and regional availability are subject to the provider's current
Always Free terms. Configure account budget alerts and check billing before
and after deployment. Supabase Free tier also has resource quotas.

## Status
Infrastructure selection and reproducible gateway code only. No Oracle VM,
public endpoint, gateway key or live handshake exists until account setup
and provisioning are completed.
