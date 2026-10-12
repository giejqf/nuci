# NuCI: UI/UX design request

This brief asks for a redesign of the user experience of NuCI, the web
interface for OpenWrt routers. It covers the whole interface: the frame
around every page, all current pages, the four add-on apps, and a new
first-run setup wizard. Visual identity (colour palette, typography, theme)
is out of scope: NuCI uses a stock component library theme and keeps it.

Screenshots of the current state are in [`screenshots/`](screenshots/) and
indexed in the [appendix](#appendix-screenshot-index). They come from a
virtual router in a test lab, so many lists are empty (no connected devices,
no Wi-Fi clients). Design for realistic, populated data; see
[Data volumes](#data-volumes-to-design-for).

---

## 1. What NuCI is

**OpenWrt** is a free operating system for home and small-office routers.
People install it on their router instead of the manufacturer's software to
get security updates, more features and full control. You configure an
OpenWrt router in a web browser by opening the router's address (for example
`http://192.168.1.1/`).

**NuCI** is that browser interface. It is a new, independent replacement for
OpenWrt's traditional interface (called LuCI). It runs entirely in the
browser and talks to the router; there is no cloud service and no internet
connection is needed to use it.

### Who uses it

| Persona | Situation | What they need |
|---|---|---|
| **Home user** | Has just installed OpenWrt by following a guide, or bought a router with OpenWrt preinstalled. Knows what Wi-Fi and a password are, not what a "firewall zone" is. | Get online, set a Wi-Fi name and password, see that everything works, never get locked out. |
| **Enthusiast / prosumer** | Runs a home lab, VPN, guest network, port forwards for a game server or NAS. Comfortable with networking terms. | Fast access to every setting, dense but readable status, confidence that a change won't break the network. |
| **Small-office admin** | Looks after a few routers for an office or family. | Clear overview, backups, safe upgrades, accounts for colleagues with limited rights. |
| **Limited user** (since 0.2) | A colleague or family member given an account with a role: *Operator* (may change network and firewall settings) or *Read-only* (may look, not change). | See only what they may use; understand why something is read-only. |

### Where it is used

Mostly on a laptop or desktop browser, often while connected to the router
by cable or Wi-Fi. Also on phones and tablets, typically to check status or
fix one thing quickly (for example from the sofa when "the internet is
down"). Every page must work on a 360 px wide phone.

### What success looks like

- A first-time user goes from "freshly installed" to "online with secure
  Wi-Fi" in a few minutes without reading documentation.
- Nobody accidentally cuts themselves off from the router; when a change
  might do that, the user understands what will happen and that it is undone
  automatically if something goes wrong.
- Experienced users find any setting in a couple of clicks and can scan
  status at a glance.
- The interface feels consistent across core pages and add-on apps, in
  three languages, light and dark mode, on desktop and phone.

---

## 2. Concepts you need (short glossary)

| Term | Meaning for this design |
|---|---|
| **Interface** (network interface) | A logical network the router takes part in, e.g. **LAN** (the home network), **WAN** (the internet connection), **WAN6** (the IPv6 side of the internet connection), a VPN tunnel, a guest network. Each has a *protocol* (static address, DHCP client, PPPoE, …). |
| **Device** | The physical or virtual port an interface uses: an Ethernet port, a *bridge* (several ports joined into one network), a VLAN. |
| **Radio / wireless network (SSID)** | A Wi-Fi chip (radio, e.g. 2.4 GHz or 5 GHz) and the Wi-Fi networks it broadcasts (SSID = network name). |
| **DHCP / lease** | The router hands out addresses to devices; a *lease* is one device's current address. *Static lease* = a fixed address for a known device. |
| **DNS** | Name resolution; the router answers name lookups for the home network. |
| **Firewall zone** | A group of interfaces with the same trust level (typically `lan` = trusted, `wan` = internet). Policies say what traffic may go in, out, and between zones. |
| **Port forward** | Lets something on the internet reach a device at home (e.g. a game server on port 25565). |
| **Package** | Installable software for the router (`apk` is the package manager). Apps are packages. |
| **App** | Optional NuCI add-on (WireGuard VPN, Dynamic DNS, UPnP, SQM). Installed as a package; adds pages to the menu. |
| **Staged change** | An edit that is not active yet. NuCI collects edits from any page and applies them together. |
| **Apply with rollback** | When changes are applied, the router starts a 90-second safety timer. NuCI checks that the browser can still reach the router; if it can, the change is confirmed. If the router becomes unreachable (e.g. a wrong address was set), the router automatically restores the previous configuration when the timer runs out. |
| **Session** | The login. It expires after inactivity; the user is asked to log in again without losing staged changes. |

---

## 3. Scope

### 3.1 The application shell (everything around a page)

- **Login** (screenshots 01, 02, 80, 95): username (defaults to `root`),
  password, language and light/dark switch, router name and model.
- **Navigation** (sidebar on desktop, drawer on mobile; 10, 82): five
  groups, *Status*, *System*, *Network*, *Firewall*, *Services*, with 28
  entries when all four apps are installed. Entries the user may not see are
  hidden. Apps add entries into existing groups (WireGuard and SQM go under
  Network, DDNS and UPnP under Services).
- **Top bar** (10): router hostname and firmware version, unsaved-changes
  counter, language select, theme switch (light / dark / follow system),
  log out.
- **Unsaved changes and apply** (70, 71): a bar at the bottom appears when
  anything is staged, with *Review*, *Revert*, *Save* and *Save & Apply*.
  The review dialog lists every change and also offers *Apply unchecked*
  (apply without the safety timer, for experts). While applying, the bar
  shows progress and a countdown. See [flow B](#b-change-the-routers-lan-address-apply--countdown--confirm-or-automatic-rollback).
- **Address hand-off**: if an apply changes the address the browser is
  using, a banner says "The router is moving to 192.168.2.1…" and then
  offers *Continue at the new address*, which must be clicked before the
  safety timer ends or the change is rolled back.
- **Toasts** (notifications): success, info, warning, error after actions.
- **Re-login dialog** when the session expires.
- **Read-only state** for limited users: pages they may view but not change
  show an information banner ("You do not have permission to change these
  settings") and disabled or hidden controls; pages they may not view are
  not in the menu.
- **Loading, empty, error and "page not found"** states.

### 3.2 Pages

All current pages are listed in [section 4](#4-pages-current-state-and-known-problems)
with their purpose, tasks, data, actions and the problems we see.

### 3.3 New: first-run setup wizard (design from scratch)

A first, functional version ships with NuCI 0.3 (System → Setup wizard:
password, internet, Wi-Fi, name and time zone, review and apply; it opens
by itself after the first login on a router without a password). It is not
in the screenshots and is not designed; treat it as a working prototype and
design the wizard from scratch. See [flow A](#a-first-login--setup-wizard)
for the content and constraints.

### 3.4 Out of scope

- Visual identity: colours, typography, theme. Use the component library's
  stock light and dark themes as they are.
- Logo or brand work.
- Native mobile apps.
- New features that are not in this document (we are glad to hear ideas;
  put them in your open questions).

---

## 4. Pages: current state and known problems

The problems listed are what we observe ourselves; please challenge them and
add your own. Several are cross-cutting and listed once in 4.0.

### 4.0 Cross-cutting problems

1. **Long, flat navigation.** 28 entries, all groups always expanded. At
   1440×900 the Firewall and Services groups are below the fold (10). No
   search, no indication of where apps live, no grouping of rarely used
   expert pages.
2. **The save/apply model is hard to understand.**
   - Four buttons (*Review*, *Revert*, *Save*, *Save & Apply*) plus *Apply
     unchecked* hidden in the review dialog. "Save" stores changes on the
     router without activating them; few users will understand the
     difference from "Save & Apply".
   - Dialogs have a *Done* button that only stages the edit (62, 65, 36):
     users may think the change is active.
   - The counter "1 unsaved change(s)" appears twice (top bar and bottom
     bar) and does not say which pages are affected.
   - The review dialog shows raw configuration paths such as
     `system.cfg01e48a.hostname = 'office-router'` (71) instead of
     "Hostname: OpenWrt → office-router".
   - During apply, progress is a small spinner, a one-line text and a
     narrow progress bar; there is no explanation of the safety timer or
     of what the user should do (normally: nothing, wait).
3. **Add dialogs create the entry immediately.** Opening *Add port
   forward* already stages an empty rule (the counter jumps to 1 behind the
   open dialog, 53); *Cancel* removes it again. Confusing, and the validation
   state (disabled *Done*) gives no hint about what is missing.
4. **Forms are wide and uniform.** On desktop, every input spans the full
   card width (31, 32, 33) regardless of its expected length; related
   options are not grouped visually; advanced and basic options look the
   same.
5. **List fields** (several addresses, DNS servers, NTP servers, 31, 20)
   use a pattern of filled rows with ✕ and a last empty row with a ＋ button;
   typing in the last row without pressing ＋ is easy to get wrong.
6. **Tables do not adapt to phones.** Columns are cut off and scroll
   sideways; row actions (edit, delete) end up off-screen (85, 86); the
   "No entries" text is off-centre inside a scrolled table.
7. **Long lists without paging or grouping.** Processes (~75 rows on a bare router, 13),
   installed packages (236 rows, 24), init scripts (~27 rows, 26).
8. **Technical vocabulary everywhere**, e.g. ACCEPT/REJECT/DROP, "Masquerading",
   "MSS clamping", "HT20", raw permission group names (`nuci-uci`,
   `nuci-network`, 23), raw nftables rule text (50b). Home users need plain
   language and short explanations; experts still need the precise terms.
9. **Destructive actions sit next to harmless ones** (interface *Stop* and
   delete next to *Edit*, 30; a delete icon on every installed package,
   including essential system packages, 24; *KILL* on every process, 13b).
10. **Status is shown as words in coloured badges** ("up", "running",
    "disabled", "enabled") with inconsistent meaning: on the Wireless page a
    radio shows "up" while its only network shows "disabled" (35).
11. **Empty and loading states** are plain one-liners ("No entries",
    "Loading…") with no guidance on what to do next.
12. **Mobile navigation drawer** has no close button or header and is very
    long (82).

### 4.1 Status

| Page | Purpose and main tasks | Data shown | Actions | Observed problems |
|---|---|---|---|---|
| **Overview** (10, 81, 90, 96) | Landing page after login. "Is everything OK?" | System facts (hostname, model, firmware, kernel, local time, uptime, load); resources (CPU, memory, storage, connections) as bars; wireless networks; interfaces table (status, addresses, traffic, uptime); DHCP leases. Live, updates every ~2 s. | Refresh | No single answer to "am I online?"; a home user cannot tell if the internet works. Facts are dense key/value lists of equal weight. The Wireless card says "No wireless devices" although the router has two radios (their networks are disabled), which is misleading. Interfaces table duplicates the Interfaces page. No entry points to common tasks. |
| **System log** (11) | Troubleshooting. | Live log lines: time, level, source, message. | Filter text, minimum level, follow (auto-scroll), download | Monospace wall of text; long lines wrap awkwardly; level badges dominate. |
| **Kernel log** (12) | Troubleshooting (hardware/driver messages). | Same as system log. | Same | Same. |
| **Processes** (13, 13b, 87) | Find and stop a misbehaving program. | 70–150 processes: PID, user, state, CPU, memory, command. | Filter, sort, send signal (HUP / TERM / KILL) with confirmation | Three cryptic signal buttons per row; kernel threads clutter the list; very long on mobile. |
| **Realtime graphs** (14–17, 93) | Watch load, traffic, Wi-Fi signal, connections over the last 3 minutes. | Four tabs with line charts, a per-interface traffic table, top connections table. | Pick interface, show data table | Charts small inside mostly empty page; tabs hide related information; wireless tab is empty without clients. |

### 4.2 System

| Page | Purpose and main tasks | Data shown | Actions | Observed problems |
|---|---|---|---|---|
| **General** (20, 70) | Name the router, set time zone and time sync, logging. | Hostname, description, clock, time zone, NTP on/off and servers, log buffer size, remote log server/port, console and cron log level. | Edit, sync clock with browser | Basic (hostname, time zone) and expert (log levels) options have equal weight. |
| **Administration** (21) | Change the router password, SSH access, SSH keys, web server options. | Forms. | Set password (immediate), edit SSH settings (staged), save keys (immediate), regenerate HTTPS certificate | Mixed save semantics on one page: some cards act immediately, others go through the apply bar; users cannot tell which. |
| **Users** (22, 23) | Give someone a limited login. | Users with role. Root is shown as "built-in administrator". | Add user (name, password, role or custom permissions), change permissions, change password, delete | The custom role shows two grids of raw permission group ids ("May view", "May change"); roles are only explained in small help text. |
| **Software** (24, 25) | Install, remove and update packages (including NuCI apps). | Installed (236), Available (search), Updates. | Update lists, search, install, remove, upgrade all; long-running job output | Installed tab is an unpaged list of 236 rows with a delete icon on each, including essential packages. Search shows "No packages found" until lists are updated (25), and the hint is easy to miss. Apps are not distinguished from system packages. |
| **Startup** (26) | Enable/disable services at boot, start/stop them; edit a startup script. | ~25–40 services: order, name, at boot, status. | Disable/Enable, Start, Restart, Stop per row; edit `rc.local` script | Four small text buttons per row; very dense; the script editor is at the bottom of a long page. |
| **Backup / Flash firmware** (27) | Download a configuration backup; restore one; upgrade the router's firmware. | Three cards. | Generate and download backup; choose file and restore (router reboots); choose firmware, upload and verify, then flash with "keep settings" and (dangerous) "force" options | Native file inputs; the firmware flow has several states (upload progress, verified/invalid, options, confirmation, waiting for reboot) that are not visible up front; high-risk actions look like ordinary buttons. |
| **Reboot** (28) | Restart the router. | — | Reboot now (with confirmation), then waiting/back states | A full page for a single button; could be an action elsewhere. Waiting state needs to be reassuring. |

### 4.3 Network

| Page | Purpose and main tasks | Data shown | Actions | Observed problems |
|---|---|---|---|---|
| **Interfaces** (30, 83, 91) | See network connections and their state; add or edit one. | One card per interface: name, up/down, firewall zone, protocol, device, addresses, uptime. | Add interface, Edit, Restart, Stop, delete | Delete (icon only) and Stop next to Edit; no traffic or health; names inconsistent (card "LAN" vs zone "lan"). |
| **Interface editor** (31–33b, 84, 97) | Configure one interface. Tabs: General (protocol and its fields), Advanced (IPv6, boot, metric), Firewall (zone), DHCP server. | Protocol-specific fields (static: addresses, gateway, DNS; DHCP client: hostname, options; PPPoE: username, password; plus tunnel protocols when installed). | Change protocol (fields change), edit fields, set zone, set up DHCP server | Very wide fields; changing the protocol silently swaps the form; most users only need two or three fields; whether a change affects the user's own connection (risk of lock-out) is not signalled. |
| **Devices** (34) | Bridges, VLANs, per-port options; bridge VLAN filtering (switch ports). | Device configuration table, bridge VLAN table, live device status (link, MAC, MTU, traffic). | Add/edit/delete devices and bridge VLANs; port membership editor (tagged/untagged/PVID) | Expert page; the VLAN membership editor is a grid that needs a clearer visual model. |
| **Wireless** (35–37, 85, 92, 99) | Set up Wi-Fi: per radio, its networks and security; see connected devices; scan and join another network. | Per radio: band, channel, width, country, on/off, its networks (SSID, mode, network, encryption, status); connected stations (hostname, MAC, SSID, signal, bit rate, connected time). | Radio on/off, Configure radio (dialog), Scan (dialog with results and *Join*), Add/edit/delete network | Radio "up" vs network "disabled" is confusing; "Configure" vs edit pencil are two levels of settings; encryption choices are technical (WPA2-PSK, WPA3-SAE, OWE…); country is a free text field; on phones the table hides the edit buttons. The most common task (change Wi-Fi name and password) takes several steps. |
| **DHCP & DNS** (38–38c) | Local DNS and address handout. Tabs: General, Static leases, Active leases, Advanced. | Local domain, forwarders, toggles; static leases table; active leases. | Edit, add static lease | Many expert toggles; making a static lease from an active lease is not offered. |
| **Hostnames** (39) | Local DNS names for devices. | Name → address table. | Add, edit, delete | Fine, but could live with DHCP & DNS. |
| **Static routes** (40) | Add routes for IPv4 and IPv6. | Two tables. | Add, edit, delete | Expert page. |
| **Diagnostics** (41, 41b) | Ping, traceroute, DNS lookup from the router. | Raw command output and exit code. | Choose tool, host, protocol; Run | Raw output; no interpretation ("reachable, 0 % loss, 0.15 ms"). |
| **WireGuard** (app; 60–62b) | Create a VPN tunnel and add peers (phones, laptops, other sites); export a peer's configuration as text and QR code. | Tunnels: public key, port, addresses, running state, peers (description, allowed addresses, last handshake, traffic). | Add tunnel (dialog), add/edit/delete peer (dialog with key generation), export peer configuration (QR + text, only after the tunnel runs), delete tunnel | The export is the payoff of the whole flow but only becomes available after applying, which the page explains in a muted line; key fields are long base64 strings; a typical "let my phone connect" task needs many decisions. |
| **SQM QoS** (app; 63) | Reduce lag under load by shaping traffic slightly below line speed. | Queues (interface, enabled, download/upload kbit/s, discipline), live shaping state. | Add/edit/delete queue | Users must know their line speed in kbit/s; no guidance or speed-test link; unit is unusual. |

### 4.4 Firewall

| Page | Purpose and main tasks | Data shown | Actions | Observed problems |
|---|---|---|---|---|
| **General** (50, 50b) | Default policies and offloading. | Input/Output/Forward policies, toggles. | Edit; view generated or active ruleset (raw text dialog) | Policies are jargon (accept/reject/drop); ruleset dialog is a raw text dump. |
| **Zones** (51, 98) | Which networks trust each other. | Zone, networks, input/output/forward policy, masquerading, allowed forwarding. | Add/edit/delete zone | Matrix-like concept shown as a dense table with uppercase keywords; hard for novices; easy to break. |
| **Port forwards** (52, 53, 86) | Make a device at home reachable from the internet. | Name, protocol, external port, internal address and port, status. | Add/edit/delete (dialog), enable/disable | Internal address is typed by hand (no picker from known devices); protocol as checkboxes; the dialog does not say which public address/port the result will be reachable at. |
| **Traffic rules** (54) | Allow or block specific traffic. | ~9 default rules (Allow-DHCP-Renew, Allow-Ping, …): from, to, protocol, port, action, status. | Add/edit/delete | Default rules are cryptic and look as editable as user rules; deleting one can break IPv6 or DHCP. |
| **NAT rules** (55) | Expert source-address rewriting. | Table. | Add/edit/delete | Expert page; empty for almost everyone. |

### 4.5 Services (apps)

| Page | Purpose and main tasks | Data shown | Actions | Observed problems |
|---|---|---|---|---|
| **Dynamic DNS** (64, 65) | Keep a name like `myhome.example.net` pointing to the router's changing internet address. | Global option, services (domain, provider, status: registered address, last update). | Check and update now, add/edit/delete service (long dialog: provider from 60+, domain, credentials, lookup host, IPv6, source interface, interval), show log | Service dialog is taller than the screen (65); provider-specific fields are not tailored; status is shown as text. |
| **UPnP** (66) | Let consoles and apps open ports automatically; see which ports they opened. | Enabled, protocols, secure mode, reported speeds, public address; active port mappings; access rules. | Edit settings, add/edit/delete rules | Settings, live mappings and rules on one long page; "running/stopped" status sits in a corner. |

---

## 5. Key flows to design end to end

Please design each flow as a sequence (desktop and phone), including error
and recovery paths.

### A. First login → setup wizard

**Trigger.** A freshly installed OpenWrt router has a `root` account with
no password. On first login (or whenever the router still looks
unconfigured) NuCI should offer a guided setup. It must be skippable, and
re-openable later (e.g. from System).

**Steps (content is fixed, structure and wording are yours):**

1. **Language** (en, de, zh-CN) and a short welcome.
2. **Router password** (required before anything else; strength hint;
   confirmation field).
3. **Internet connection**: automatic (DHCP, the default and right for most
   people behind a modem), PPPoE (username/password from the provider,
   common with DSL/fibre), or static (address, gateway, DNS). Show whether
   the router is online right now.
4. **Wi-Fi** (only if the router has radios): one network name and password
   for all bands, or per band; country (needed for legal channels; suggest
   from the browser's language/region); security level with a sensible
   default.
5. **Time zone** (suggested from the browser).
6. **Summary and apply.** Each step's settings are applied safely with the
   automatic rollback (see B). Changing Wi-Fi may disconnect a user who is
   connected over Wi-Fi: the wizard must say so beforehand and tell them how
   to reconnect (new network name/password) before the change happens.
7. **Done**: what was set up, where to find things, optional next steps
   (install apps, create a backup).

**Constraints.** The router may have no internet yet. Each apply can take
10–30 s. If a step fails or is rolled back, the user must be able to go
back and fix it.

### B. Change the router's LAN address (apply → countdown → confirm or automatic rollback)

The riskiest everyday change: the browser is using the old address.

1. User edits LAN address from `192.168.1.1` to `192.168.2.1` (interface
   editor) — staged, nothing happens yet.
2. User reviews and applies. The design should make clear *before* applying
   that this change moves the router, and what will happen.
3. Router applies the change and starts a 90 s safety timer. NuCI waits a
   few seconds, then checks the old and the new address.
4. When the router answers at the new address, NuCI offers "Continue at
   192.168.2.1"; following it confirms the change. (The device may also need
   to renew its own address; the user may need to reconnect.)
5. If the user does nothing or the router cannot be reached, the router
   restores the old configuration when the timer ends; NuCI tells the user
   it was rolled back and why.
6. Also design the ordinary case (e.g. hostname change): apply → ~10–15 s
   "checking…" → "Applied". And the failure case (router reports an error).

### C. Edit an interface

Open the WAN interface, switch from DHCP to PPPoE, enter username and
password, apply. Show how changing the protocol changes the form, how
validation errors look, and what a limited (read-only) user sees on the
same page.

### D. Add a port forward

"Make my game server at 192.168.1.50 reachable on port 25565." Ideally pick
the device from the list of known devices (DHCP leases) instead of typing an
address; show the result ("reachable from the internet at
`<public address>:25565`"); handle the case where the router itself is
behind another router (private public address).

### E. Add a WireGuard peer and export it as a QR code

"Let my phone connect to my home network." Create a tunnel if none exists,
add a peer (keys generated on the router), apply, then show the QR code to
scan with the WireGuard phone app, and the text configuration to copy. The
QR code and text contain a private key: treat it as sensitive (show on
request, warn before sharing).

### F. Create a read-only user

Add a user with the *Read-only* role, then show what that user sees after
logging in: reduced menu, read-only pages with an explanation, no write
controls, what happens if they try something they may not do.

### G. Backup, restore and firmware upgrade

Download a backup; restore one (router reboots and comes back); upload a
firmware image, see it verified, choose to keep settings, flash, wait for
the reboot (several minutes; the page must survive the router going away and
coming back), log in again. Make the irreversible steps feel serious, and
the waiting reassuring.

### H. Install a package (e.g. an app)

Update package lists, find "WireGuard", install it, see progress and the
result, find the new page in the menu. Removing a package should warn when
it is essential or when others depend on it.

---

## 6. Constraints the design must respect

**Component library.** The UI is built with **DaisyUI 5** components and
**Tailwind CSS** utility classes (see <https://daisyui.com/components/>).
Please design with its components (button, input, select, toggle,
checkbox, radio, fieldset/label, table, tabs, menu, drawer, navbar, modal,
alert, toast, badge, card, collapse, dropdown, steps, progress, loading,
stat, tooltip, join, etc.) and its spacing/sizing scale, so designs can be
implemented without custom components. New components are possible when
needed, but tell us where you deviate.

**Theme.** Use the library's stock themes. Both **light and dark mode**
must work (the user can follow the system or choose). Do not rely on a
specific colour beyond the library's semantic colours (primary, success,
warning, error, info, neutral).

**Icons.** **Lucide** only (<https://lucide.dev/icons/>). Please name the
icon you use.

**Offline.** The interface must work with no internet access: no web fonts,
no external images or CDNs. Text uses the system font stack.

**Size budget.** Routers have little storage (often 8–16 MB for everything)
and the interface loads over slow Wi-Fi: the shell, login and Overview must
stay under 120 KB compressed, and each page under 20 KB. No photos,
illustrations or animation libraries; small inline icons and CSS only.
Empty states can use an icon and text.

**Apps.** Add-on apps are built separately but with the same components;
patterns (lists with add/edit dialogs, status badges, key/value facts, live
tables) must be reusable building blocks, not one-off layouts.

**Languages.** English, German and Simplified Chinese ship today; more may
follow. German strings are often ~30 % longer than English (see 95–98);
Chinese needs comfortable line height. No text in images. Left-to-right
only for now.

**Accessibility.** WCAG 2.1 AA: contrast in both modes, visible focus,
full keyboard operation (tables, dialogs, tabs, menus), labelled controls,
status changes announced to screen readers (apply progress, toasts), charts
with a data-table alternative, touch targets ≥ 44 px on mobile, no
information by colour alone.

**Responsive.** From 360 px phones to wide desktops (1440 px and up). Tables
need a phone pattern (cards, priority columns, or row details).

**Slow and unreliable device.** Router responses can take 1–3 s; package
operations and firmware checks take minutes. Every data view needs loading,
empty and error states. Live data updates every ~2 s without layout jumps.

**The connection can disappear.** Applying network, Wi-Fi or firewall
changes, rebooting, restoring and flashing all interrupt the connection.
The UI must explain this beforehand and handle it gracefully afterwards.

**Permissions.** Any page, section or action can be hidden or read-only for
a limited user. The design needs a consistent read-only presentation.

---

## 7. Data volumes to design for

| Item | Typical | Large |
|---|---|---|
| Interfaces | 3–5 | 15 |
| Wi-Fi radios / networks | 2 / 2–4 | 3 / 12 |
| Connected Wi-Fi stations | 5–20 | 80 |
| DHCP leases | 10–40 | 250 |
| Port forwards / traffic rules | 0–5 / 9 defaults | 50 / 100 |
| Installed packages | ~240 | 600 |
| Processes | ~80 | 300 |
| Log lines (kept) | 500 | 5 000 |
| WireGuard peers | 1–5 | 50 |
| Users | 1 (root) | 10 |

---

## 8. What we would like from you

1. **Information architecture**: navigation structure, page grouping,
   naming (incl. where apps appear), and which pages or sections are
   "advanced".
2. **Shell**: login, desktop sidebar/top bar, mobile navigation, the
   unsaved-changes / apply / countdown / hand-off / rollback experience,
   toasts, session-expired re-login, read-only presentation.
3. **Page designs** for every page in section 4, desktop (1440 px) and phone
   (390 px), with populated data, plus their empty, loading, error and
   read-only states.
4. **Flows A–H** from section 5 as step-by-step frames, including failure
   and recovery paths, with short interaction notes (what happens on click,
   timings, focus movement, what is announced to screen readers).
5. **Component sheet**: the recurring patterns (fact list, status
   indicator, editable list with add/edit dialog, list field, live table,
   chart card, destructive confirmation, long-running job output) with their
   states, mapped to DaisyUI components.
6. **Copy suggestions** where wording matters (apply/rollback, warnings,
   empty states, wizard). We translate them.
7. Files in **Figma** (or equivalent) with frames named after the
   screenshot ids in the appendix where they replace a current screen.

### Priority

| Priority | Scope |
|---|---|
| **P1** | Shell (navigation, top bar, login), apply / rollback flow (B), setup wizard (A), Status → Overview, Network → Interfaces + interface editor (C), Network → Wireless, read-only presentation (F), mobile patterns for tables and forms |
| **P2** | All other pages and flows D, E, G, H; apps |
| **P3** | Expert pages polish (Devices / bridge VLANs, Static routes, NAT, logs, processes, realtime graphs) |

### Working together

- We can give you access to a test router (virtual machine) running the
  current interface, or a short screen-share walkthrough.
- Please send questions early; we prefer a first P1 round (information
  architecture, shell, apply flow, wizard) for review before the rest.
- Implementation follows your designs page by page; we will come back
  with questions where a design conflicts with the constraints in section 6.

### Open questions for you

Please answer or challenge these in your first round:

1. Should the expert pages (Devices, Static routes, NAT, logs, processes)
   be hidden behind an "advanced" switch, a separate group, or stay visible?
2. Should *Save* (stage on the router without applying) remain a separate
   action, or should applying be the only action (with staged edits kept in
   the browser)?
3. Is a single "Wi-Fi" concept (name + password for all bands) the right
   default, with per-radio settings as an advanced view?
4. Where should the wizard live after first use?
5. What should the Overview show for a non-expert to answer "is my internet
   OK, and who is connected?"
6. How should apps be discovered and installed (a catalogue page vs the
   Software page)?

---

## Appendix: screenshot index

Current state, captured on 2026-10-12 from a virtual OpenWrt 25.12 router
(NuCI 0.2.0) with no client devices. Desktop shots are 1440 px wide (full
page height where longer); phone shots 390 px; two very long pages are cut.
The SSH key in 21 is blurred.

### Shell and login

| File | Shows |
|---|---|
| [01-login.png](screenshots/01-login.png) | Login (desktop) |
| [02-login-error.png](screenshots/02-login-error.png) | Login with wrong password |
| [70-shell-unsaved-changes-bar.png](screenshots/70-shell-unsaved-changes-bar.png) | A staged change: counter in the top bar and the bottom apply bar |
| [71-shell-review-changes-dialog.png](screenshots/71-shell-review-changes-dialog.png) | Review dialog with raw change list, *Apply unchecked* and *Save & Apply* |
| [80-mobile-login.png](screenshots/80-mobile-login.png) | Login (phone) |
| [82-mobile-menu-open.png](screenshots/82-mobile-menu-open.png) | Navigation drawer (phone) |
| [95-de-login.png](screenshots/95-de-login.png) | Login in German |

### Status

| File | Shows |
|---|---|
| [10-status-overview.png](screenshots/10-status-overview.png) | Overview |
| [81-mobile-overview.png](screenshots/81-mobile-overview.png) | Overview (phone) |
| [90-dark-overview.png](screenshots/90-dark-overview.png) | Overview, dark mode |
| [96-de-overview.png](screenshots/96-de-overview.png) | Overview in German |
| [11-status-system-log.png](screenshots/11-status-system-log.png) | System log |
| [12-status-kernel-log.png](screenshots/12-status-kernel-log.png) | Kernel log |
| [13-status-processes.png](screenshots/13-status-processes.png) | Processes (cut) |
| [13b-status-processes-signal-dialog.png](screenshots/13b-status-processes-signal-dialog.png) | Send-signal confirmation |
| [87-mobile-processes.png](screenshots/87-mobile-processes.png) | Processes (phone, cut) |
| [14-status-realtime-load.png](screenshots/14-status-realtime-load.png) | Realtime graphs: load |
| [15-status-realtime-traffic.png](screenshots/15-status-realtime-traffic.png) | Realtime graphs: traffic |
| [16-status-realtime-wireless.png](screenshots/16-status-realtime-wireless.png) | Realtime graphs: wireless (empty) |
| [17-status-realtime-connections.png](screenshots/17-status-realtime-connections.png) | Realtime graphs: connections |
| [93-dark-realtime.png](screenshots/93-dark-realtime.png) | Realtime graphs, dark mode |

### System

| File | Shows |
|---|---|
| [20-system-general.png](screenshots/20-system-general.png) | General settings |
| [21-system-administration.png](screenshots/21-system-administration.png) | Administration (password, SSH, keys, web server) |
| [22-system-users.png](screenshots/22-system-users.png) | Users |
| [23-system-users-add-dialog.png](screenshots/23-system-users-add-dialog.png) | Add user, custom role |
| [24-system-software.png](screenshots/24-system-software.png) | Software: installed packages (cut) |
| [25-system-software-search.png](screenshots/25-system-software-search.png) | Software: search before lists were updated |
| [26-system-startup.png](screenshots/26-system-startup.png) | Startup (services and rc.local) |
| [27-system-backup-flash.png](screenshots/27-system-backup-flash.png) | Backup / Flash firmware |
| [28-system-reboot.png](screenshots/28-system-reboot.png) | Reboot |

### Network

| File | Shows |
|---|---|
| [30-network-interfaces.png](screenshots/30-network-interfaces.png) | Interfaces |
| [83-mobile-interfaces.png](screenshots/83-mobile-interfaces.png) | Interfaces (phone) |
| [91-dark-interfaces.png](screenshots/91-dark-interfaces.png) | Interfaces, dark mode |
| [31-network-interface-lan.png](screenshots/31-network-interface-lan.png) | Interface editor: LAN, General |
| [32-network-interface-lan-advanced.png](screenshots/32-network-interface-lan-advanced.png) | Interface editor: Advanced |
| [33-network-interface-lan-dhcp.png](screenshots/33-network-interface-lan-dhcp.png) | Interface editor: DHCP server |
| [33b-network-interface-wan.png](screenshots/33b-network-interface-wan.png) | Interface editor: WAN (DHCP client) |
| [84-mobile-interface-lan.png](screenshots/84-mobile-interface-lan.png) | Interface editor (phone) |
| [97-de-interface-lan.png](screenshots/97-de-interface-lan.png) | Interface editor in German |
| [34-network-devices.png](screenshots/34-network-devices.png) | Devices and bridge VLAN filtering |
| [35-network-wireless.png](screenshots/35-network-wireless.png) | Wireless |
| [36-network-wireless-radio-dialog.png](screenshots/36-network-wireless-radio-dialog.png) | Configure radio |
| [37-network-wireless-scan-dialog.png](screenshots/37-network-wireless-scan-dialog.png) | Scan results (none in the lab) |
| [85-mobile-wireless.png](screenshots/85-mobile-wireless.png) | Wireless (phone; edit buttons off-screen) |
| [92-dark-wireless.png](screenshots/92-dark-wireless.png) | Wireless, dark mode |
| [99-zh-wireless.png](screenshots/99-zh-wireless.png) | Wireless in Simplified Chinese |
| [38-network-dhcp-dns.png](screenshots/38-network-dhcp-dns.png) | DHCP & DNS: General |
| [38b-network-dhcp-static-leases.png](screenshots/38b-network-dhcp-static-leases.png) | DHCP & DNS: Static leases |
| [38c-network-dhcp-advanced.png](screenshots/38c-network-dhcp-advanced.png) | DHCP & DNS: Advanced |
| [39-network-hostnames.png](screenshots/39-network-hostnames.png) | Hostnames |
| [40-network-static-routes.png](screenshots/40-network-static-routes.png) | Static routes |
| [41-network-diagnostics.png](screenshots/41-network-diagnostics.png) | Diagnostics |
| [41b-network-diagnostics-ping.png](screenshots/41b-network-diagnostics-ping.png) | Diagnostics: ping result |
| [60-app-wireguard.png](screenshots/60-app-wireguard.png) | WireGuard (app), no tunnels |
| [61-app-wireguard-add-tunnel-dialog.png](screenshots/61-app-wireguard-add-tunnel-dialog.png) | WireGuard: add tunnel |
| [62-app-wireguard-peer-dialog.png](screenshots/62-app-wireguard-peer-dialog.png) | WireGuard: add peer |
| [62b-app-wireguard-tunnel-staged.png](screenshots/62b-app-wireguard-tunnel-staged.png) | WireGuard: tunnel with one peer, not yet applied |
| [63-app-sqm.png](screenshots/63-app-sqm.png) | SQM QoS (app) |

### Firewall

| File | Shows |
|---|---|
| [50-firewall-general.png](screenshots/50-firewall-general.png) | Firewall general |
| [50b-firewall-ruleset-preview-dialog.png](screenshots/50b-firewall-ruleset-preview-dialog.png) | Generated ruleset dialog |
| [51-firewall-zones.png](screenshots/51-firewall-zones.png) | Zones |
| [98-de-firewall-zones.png](screenshots/98-de-firewall-zones.png) | Zones in German |
| [52-firewall-port-forwards.png](screenshots/52-firewall-port-forwards.png) | Port forwards (empty) |
| [53-firewall-port-forward-dialog.png](screenshots/53-firewall-port-forward-dialog.png) | Add port forward (note the counter behind the dialog) |
| [86-mobile-firewall-forwards.png](screenshots/86-mobile-firewall-forwards.png) | Port forwards (phone) |
| [54-firewall-traffic-rules.png](screenshots/54-firewall-traffic-rules.png) | Traffic rules (defaults) |
| [55-firewall-nat.png](screenshots/55-firewall-nat.png) | NAT rules (empty) |

### Services (apps)

| File | Shows |
|---|---|
| [64-app-ddns.png](screenshots/64-app-ddns.png) | Dynamic DNS |
| [65-app-ddns-service-dialog.png](screenshots/65-app-ddns-service-dialog.png) | DDNS service dialog (taller than the screen) |
| [66-app-upnp.png](screenshots/66-app-upnp.png) | UPnP |
