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
    debugShowCheckedModeBanner: false,
    theme: ThemeData.dark(useMaterial3: true).copyWith(scaffoldBackgroundColor: const Color(0xFF101014), colorScheme: const ColorScheme.dark(primary: Color(0xFFFF315F), surface: Color(0xFF12131B))),
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
  bool searchOpen = false;
  int tab = 0;
  String category = '🔥';
  String country = 'All';
  String language = 'All';
  bool matchesCategory(Channel c) => category == '🔥' || category == 'All' || c.categories.any((v) => v.toLowerCase() == category.toLowerCase());
  int libraryTab = 0; // 0 channels, 1 favourites, 2 history
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
    final q = query.trim().toLowerCase();
    final channels = all.where((c) =>
      (libraryTab == 0 || (libraryTab == 1 ? library.isFavorite(c.id) : library.wasWatched(c.id))) &&
      matchesCategory(c) && (country == 'All' || c.country == country) &&
      (language == 'All' || c.languages.contains(language)) &&
      (q.isEmpty || [c.name, c.country, ...c.categories, ...c.languages].any((v) => v.toLowerCase().contains(q)))).toList();
    const rail = <(String, String)>[('🔥','Hot'),('📰','News'),('⚽','Sports'),('🎬','Movies'),('🎵','Music'),('🎥','Entertainment'),('🧸','Kids'),('🌍','Travel'),('👨‍🍳','Cooking'),('✈️','Lifestyle')];
    final screenWidth = MediaQuery.of(context).size.width;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF10121B), elevation: 0,
        titleSpacing: 12,
        title: Row(children: [
          Container(width: 32,height: 32,alignment: Alignment.center,decoration: const BoxDecoration(shape: BoxShape.circle,gradient: LinearGradient(colors:[Color(0xFFFF315F),Color(0xFF32CED0)])),child: const Icon(Icons.live_tv,size: 19,color: Colors.white)),
          const SizedBox(width: 8), const Text('TikVTV',style: TextStyle(fontWeight: FontWeight.w800,fontSize: 21)),
          const Text('z',style: TextStyle(fontSize: 12,fontWeight: FontWeight.bold)),
          const Spacer(), Container(padding: const EdgeInsets.symmetric(horizontal: 10,vertical: 5),decoration: BoxDecoration(color: Colors.white.withValues(alpha: .05),borderRadius: BorderRadius.circular(22),border: Border.all(color: Colors.white12)),child: Text('${all.length} ch',style: const TextStyle(fontSize: 11,color: Colors.white54))),
        ]),
        actions: [
          IconButton(tooltip:'Search channels',onPressed:()=>setState(()=>searchOpen=!searchOpen),icon: const Icon(Icons.search)),
          IconButton(tooltip:'Refresh channels',onPressed:()=>catalogue.load(force:true),icon:const Icon(Icons.refresh)),
          PopupMenuButton<String>(tooltip:'Language',initialValue:language,itemBuilder:(_)=>['All',...languages].map((v)=>PopupMenuItem(value:v,child:Text(v))).toList(),onSelected:(v)=>setState(()=>language=v),child: const Padding(padding:EdgeInsets.symmetric(horizontal:8),child:Center(child:Text('EN⌄',style:TextStyle(fontSize:12))))),
          Padding(padding:const EdgeInsets.only(right:12),child:CircleAvatar(radius:17,backgroundColor:const Color(0xFFDB4773),child:Text(tab==6?'♥':'N',style:const TextStyle(color:Colors.white)))),
        ],
      ),
      bottomNavigationBar: SafeArea(top:false,child:Container(
        decoration:const BoxDecoration(color:Color(0xFF11131D),border:Border(top:BorderSide(color:Colors.white10))),
        child:NavigationBar(height:66,backgroundColor:const Color(0xFF11131D),indicatorColor:const Color(0xFF4B162A),selectedIndex:tab,labelBehavior:NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected:(v)=>setState(() {tab=v; if(v==1) searchOpen=true; if(v==3) category='🔥'; if(v==0) libraryTab=0;}),
          destinations:const [
            NavigationDestination(icon:Icon(Icons.home_outlined),selectedIcon:Icon(Icons.home,color:Color(0xFFFF315F)),label:'Home'),
            NavigationDestination(icon:Icon(Icons.search),label:'Search'),
            NavigationDestination(icon:Icon(Icons.explore_outlined),label:'Explore'),
            NavigationDestination(icon:Icon(Icons.local_fire_department_outlined),label:'Hot'),
            NavigationDestination(icon:Icon(Icons.movie_outlined),label:'Clips'),
            NavigationDestination(icon:Icon(Icons.calendar_month_outlined),label:'Guide'),
            NavigationDestination(icon:Icon(Icons.person_outline),label:'Profile'),
          ]),
      )),
      body: Column(children:[
        if(searchOpen || tab==1) Padding(padding:const EdgeInsets.fromLTRB(12,10,12,6),child:TextField(autofocus:tab==1,decoration:InputDecoration(hintText:'Search channels',prefixIcon:const Icon(Icons.search),filled:true,fillColor:const Color(0xFF1B1C24),border:OutlineInputBorder(borderRadius:BorderRadius.circular(18),borderSide:BorderSide.none)),onChanged:(v)=>setState(()=>query=v))),
        SizedBox(height:64,child:ListView(scrollDirection:Axis.horizontal,padding:const EdgeInsets.symmetric(horizontal:10,vertical:7),children:rail.map((entry){
          final selected=category==entry.$1 || category==entry.$2;
          return Padding(padding:const EdgeInsets.symmetric(horizontal:3),child:Tooltip(message:entry.$2,child:InkWell(borderRadius:BorderRadius.circular(30),onTap:()=>setState(()=>category=entry.$1=='🔥'?'🔥':entry.$2),child:Container(width:49,alignment:Alignment.center,decoration:BoxDecoration(shape:BoxShape.circle,color:selected?Colors.white:const Color(0xFF23242A)),child:Text(entry.$1,style:TextStyle(fontSize:22,color:selected?Colors.black:Colors.white))))));
        }).toList())),
        if(catalogue.loading) const LinearProgressIndicator(minHeight:2),
        if(catalogue.error!=null) Padding(padding:const EdgeInsets.all(10),child:Text('Catalogue: ${catalogue.error}',style:const TextStyle(color:Colors.orange))),
        if(tab==2 || tab==5) SizedBox(height:46,child:Row(children:[
          const Padding(padding:EdgeInsets.only(left:14),child:Text('Discover channels',style:TextStyle(fontWeight:FontWeight.bold))),
          const Spacer(),DropdownButton<String>(value:countries.contains(country)?country:'All',items:['All',...countries].map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),onChanged:(v)=>setState(()=>country=v??'All')),
          const SizedBox(width:12),
        ])),
        Padding(padding:const EdgeInsets.symmetric(horizontal:10,vertical:4),child:Row(children:[for(final item in <(String,int)>[('Channels',0),('Favorites',1),('History',2)]) Padding(padding:const EdgeInsets.only(right:6),child:ChoiceChip(label:Text(item.$1,style:const TextStyle(fontSize:12)),selected:libraryTab==item.$2,onSelected:(_)=>setState(()=>libraryTab=item.$2))),const Spacer(),PopupMenuButton<String>(tooltip:'Country filter',initialValue:country,itemBuilder:(_)=>['All',...countries].map((v)=>PopupMenuItem(value:v,child:Text(v))).toList(),onSelected:(v)=>setState(()=>country=v),child:const Icon(Icons.public,size:20))])),
        Expanded(child:channels.isEmpty?Center(child:Text(catalogue.loading?'Loading channels…':'No matching channels. Try another category or clear filters.',textAlign:TextAlign.center)):ListView.builder(
          padding:EdgeInsets.symmetric(horizontal:screenWidth>600?24:10,vertical:8),
          itemCount:channels.length,itemBuilder:(context,index){
            final c=channels[index];
            return Padding(padding:const EdgeInsets.only(bottom:12),child:Material(color:const Color(0xFF191A20),borderRadius:BorderRadius.circular(18),clipBehavior:Clip.antiAlias,child:InkWell(
              onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>ChannelScreen(channel:c))),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                AspectRatio(aspectRatio:16/9,child:Stack(fit:StackFit.expand,children:[
                  c.logo.isEmpty?const Center(child:Icon(Icons.live_tv,size:52,color:Colors.white24)):Image.network(c.logo,fit:BoxFit.contain,errorBuilder:(_,__,___)=>const Center(child:Icon(Icons.live_tv,size:52,color:Colors.white24))),
                  const Align(alignment:Alignment.center,child:Icon(Icons.play_circle_fill,size:54,color:Colors.white70)),
                  Positioned(top:12,left:12,child:Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:4),decoration:BoxDecoration(color:const Color(0xFFFF315F),borderRadius:BorderRadius.circular(6)),child:const Text('LIVE',style:TextStyle(fontSize:11,fontWeight:FontWeight.bold)))),
                ])),
                Padding(padding:const EdgeInsets.all(12),child:Row(children:[
                  Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(c.name,maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontWeight:FontWeight.bold,fontSize:16)),Text(c.country,style:const TextStyle(color:Colors.white54,fontSize:12))])),
                  IconButton(tooltip:'Favourite',onPressed:()=>library.toggleFavorite(c.id),icon:Icon(library.isFavorite(c.id)?Icons.favorite:Icons.favorite_border,color:library.isFavorite(c.id)?const Color(0xFFFF315F):Colors.white70)),
                  const Icon(Icons.chevron_right,color:Colors.white38),
                ])),
              ]),
            )));
          },
        )),
        SizedBox(height: 44, child: ListView(scrollDirection: Axis.horizontal, children: [const Padding(padding: EdgeInsets.all(8), child: Text('✦ AI picks:')), ...['General', 'Entertainment', 'Kids', 'News'].map((v) => Padding(padding: const EdgeInsets.only(right: 5), child: ActionChip(label: Text(v), onPressed: () => setState(() => category = v))))])),
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
