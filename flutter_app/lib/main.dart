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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    catalogue.load();
    library.load();
    library.addListener(refresh);
    catalogue.addListener(refresh);
  }
  void refresh() { if (mounted) setState(() {}); }
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
    final channels = catalogue.channels.where((c) =>
      (tab == 0 || (tab == 1 ? library.isFavorite(c.id) : library.wasWatched(c.id))) &&
      c.name.toLowerCase().contains(query.toLowerCase())).toList();
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
        if (catalogue.error != null) Padding(padding: const EdgeInsets.all(12),
          child: Text('Catalogue: ${catalogue.error}', style: const TextStyle(color: Colors.orange))),
        if (catalogue.loading) const LinearProgressIndicator(),
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
  void refresh() { if (mounted) setState(() {}); }
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
          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Channel link copied for sharing')));
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
