import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'src/catalogue.dart';
import 'src/playback.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TikVTV());
}

final catalogue = ChannelCatalogue();
final playback = SharedPlayback();

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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    catalogue.load();
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
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final channels = catalogue.channels.where((c) =>
      c.name.toLowerCase().contains(query.toLowerCase())).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('TikVTV Live'), actions: [
        IconButton(tooltip: 'Refresh catalogue', onPressed: () => catalogue.load(force: true), icon: const Icon(Icons.refresh)),
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
  @override
  void initState() {
    super.initState();
    playback.addListener(refresh);
    playback.open(widget.channel);
  }
  void refresh() { if (mounted) setState(() {}); }
  @override
  void dispose() {
    playback.removeListener(refresh);
    playback.stopIfCurrent(widget.channel.id);
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final controller = playback.controller;
    final selected = playback.channel?.id == widget.channel.id;
    return Scaffold(
      appBar: AppBar(title: Text(widget.channel.name)),
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AspectRatio(aspectRatio: 16 / 9, child: ColoredBox(color: Colors.black,
          child: selected && controller != null && controller.value.isInitialized
            ? VideoPlayer(controller)
            : Center(child: playback.error != null && !playback.loading
              ? Text(playback.error!, textAlign: TextAlign.center)
              : const CircularProgressIndicator()))),
        if (playback.error != null) TextButton.icon(
          onPressed: () => playback.open(widget.channel),
          icon: const Icon(Icons.refresh), label: const Text('Retry stream')),
        Padding(padding: const EdgeInsets.all(16), child: Text(widget.channel.name,
          style: Theme.of(context).textTheme.headlineSmall)),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('Source ${playback.sourceIndex + 1} of ${widget.channel.urls.length}')),
      ]),
    );
  }
}
