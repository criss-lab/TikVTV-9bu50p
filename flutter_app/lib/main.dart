import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'src/catalogue.dart';
import 'src/playback.dart';
import 'src/library.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TikVTV());
}

final catalogue = ChannelCatalogue();
final playback = SharedPlayback();
final library = ChannelLibrary();

class TikVTV extends StatelessWidget {
  const TikVTV({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'TikVTV',
    theme: ThemeData.dark(useMaterial3: true),
    home: const ChannelHome(),
  );
}

class ChannelHome extends StatefulWidget {
  const ChannelHome({super.key});
  @override
  State<ChannelHome> createState() => _ChannelHomeState();
}

class _ChannelHomeState extends State<ChannelHome> with WidgetsBindingObserver {
  String query = '';
  int tab = 0;
  String category = '🔥';
  String country = 'All';
  String language = 'All';
  static const featured = ['🔥', 'All', 'News', 'Sports', 'Movies', 'Music', 'Entertainment', 'Kids', 'Documentary', 'Lifestyle', 'Education', 'Religious', 'Business', 'Culture', 'Cooking', 'Travel', 'Weather', 'General'];
  bool matchesCategory(Channel c) => category == '🔥' || category == 'All' || c.categories.any((v) => v.toLowerCase() == category.toLowerCase());
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    catalogue.load();
    library.load();
    library.addListener(refresh);
    catalogue.addListener(refresh);
  }
  void refresh() { if (mounted) { setState(() {}); } }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    playback.setBackgrounded(state != AppLifecycleState.resumed);
  }
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    catalogue.removeListener(refresh);
    library.removeListener(refresh);
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final all = catalogue.channels;
    final countries = (all.map((c) => c.country).where((v) => v.isNotEmpty).toSet().toList()..sort());
    final languages = (all.expand((c) => c.languages).where((v) => v.isNotEmpty).toSet().toList()..sort());
    final categories = [...featured, ...all.expand((c) => c.categories).where((v) => v.isNotEmpty && !featured.any((f) => f.toLowerCase() == v.toLowerCase())).toSet().toList()..sort()];
    final q = query.trim().toLowerCase();
    final channels = all.where((c) =>
      (tab == 0 || (tab == 1 ? library.isFavorite(c.id) : library.wasWatched(c.id))) &&
      matchesCategory(c) && (country == 'All' || c.country == country) &&
      (language == 'All' || c.languages.contains(language)) &&
      (q.isEmpty || [c.name, c.country, ...c.categories, ...c.languages].any((v) => v.toLowerCase().contains(q)))).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('TikVTV Live'), actions: [
        IconButton(tooltip: 'Refresh catalogue', onPressed: () => catalogue.load(force: true), icon: const Icon(Icons.refresh)),
      ]),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (value) => setState(() => tab = value), destinations: const [
        NavigationDestination(icon: Icon(Icons.live_tv), label: 'Channels'),
        NavigationDestination(icon: Icon(Icons.favorite), label: 'Favorites'),
        NavigationDestination(icon: Icon(Icons.history), label: 'History'),
      ]),
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: TextField(
          decoration: const InputDecoration(labelText: 'Search channels', prefixIcon: Icon(Icons.search)),
          onChanged: (value) => setState(() => query = value),
        )),
        SizedBox(height: 48, child: ListView(scrollDirection: Axis.horizontal, children: categories.map((v) => Padding(padding: const EdgeInsets.symmetric(horizontal: 3), child: ChoiceChip(label: Text(v), selected: category == v, onSelected: (_) => setState(() => category = v)))).toList())),
        Row(children: [Expanded(child: DropdownButton<String>(isExpanded: true, value: country, items: ['All', ...countries].map((v) => DropdownMenuItem(value: v, child: Text(v, overflow: TextOverflow.ellipsis))).toList(), onChanged: (v) => setState(() => country = v ?? 'All'))), Expanded(child: DropdownButton<String>(isExpanded: true, value: language, items: ['All', ...languages].map((v) => DropdownMenuItem(value: v, child: Text(v, overflow: TextOverflow.ellipsis))).toList(), onChanged: (v) => setState(() => language = v ?? 'All')))]),
        if (catalogue.error != null) Padding(padding: const EdgeInsets.all(12),
          child: Text('Catalogue: ${catalogue.error}', style: const TextStyle(color: Colors.orange))),
        if (catalogue.loading) const LinearProgressIndicator(),
        if (!catalogue.loading && channels.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No matching channels. Try another category or clear your filters.')),
        Expanded(child: ListView.builder(
          itemCount: channels.length,
          itemBuilder: (context, index) {
            final channel = channels[index];
            return ListTile(
              leading: channel.logo.isEmpty ? const Icon(Icons.live_tv) :
                Image.network(channel.logo, width: 48, errorBuilder: (_, __, ___) => const Icon(Icons.live_tv)),
              title: Text(channel.name),
              subtitle: Text(channel.country),
              trailing: IconButton(
                tooltip: library.isFavorite(channel.id) ? 'Remove favorite' : 'Add favorite',
                icon: Icon(library.isFavorite(channel.id) ? Icons.favorite : Icons.favorite_border),
                onPressed: () => library.toggleFavorite(channel.id),
              ),
              onTap: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => ChannelScreen(channel: channel))),
            );
          },
        )),
      ]),
    );
  }
}

class ChannelScreen extends StatefulWidget {
  final Channel channel;
  const ChannelScreen({super.key, required this.channel});
  @override
  State<ChannelScreen> createState() => _ChannelScreenState();
}

class _ChannelScreenState extends State<ChannelScreen> {
  late int _playbackLease;
  @override
  void initState() {
    super.initState();
    playback.addListener(refresh);
    library.addListener(refresh);
    library.recordWatch(widget.channel.id);
    _openChannel();
  }
  void _openChannel() {
    playback.open(widget.channel);
    _playbackLease = playback.lease;
  }
  void refresh() { if (mounted) { setState(() {}); } }
  @override
  void dispose() {
    playback.removeListener(refresh);
    library.removeListener(refresh);
    playback.stopIfCurrent(widget.channel.id, lease: _playbackLease);
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final controller = playback.controller;
    final selected = playback.channel?.id == widget.channel.id;
    return Scaffold(
      appBar: AppBar(title: Text(widget.channel.name), actions: [
        IconButton(tooltip: 'Share channel link', icon: const Icon(Icons.share), onPressed: () async {
          final link = 'https://www.streamora.co.ke/channel/${Uri.encodeComponent(widget.channel.id)}';
          await Clipboard.setData(ClipboardData(text: link));
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Channel link copied for sharing')));
          }
        }),
        IconButton(tooltip: 'Favorite', onPressed: () => library.toggleFavorite(widget.channel.id),
          icon: Icon(library.isFavorite(widget.channel.id) ? Icons.favorite : Icons.favorite_border)),
      ]),
      body: SafeArea(child: ListView(children: [
        AspectRatio(aspectRatio: 16 / 9, child: ColoredBox(color: Colors.black,
          child: selected && controller != null && controller.value.isInitialized
            ? Stack(fit: StackFit.expand, children: [
                VideoPlayer(controller),
                if (playback.buffering) const Align(alignment: Alignment.center,
                  child: CircularProgressIndicator()),
              ])
            : Center(child: playback.error != null && !playback.loading
              ? Text(playback.error!, textAlign: TextAlign.center)
              : const CircularProgressIndicator()))),
        if (playback.error != null) TextButton.icon(
          onPressed: _openChannel,
          icon: const Icon(Icons.refresh), label: const Text('Retry stream')),
        Padding(padding: const EdgeInsets.all(16), child: Text(widget.channel.name,
          style: Theme.of(context).textTheme.headlineSmall)),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('Source ${widget.channel.urls.isEmpty ? 0 : playback.sourceIndex + 1} of ${widget.channel.urls.length}')),
        if (selected && controller != null && controller.value.isInitialized)
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text('Buffered ahead: ${playback.bufferedAhead.inSeconds}s · Recoveries: ${playback.recoveryCount}')),
      ])),
    );
  }
}
