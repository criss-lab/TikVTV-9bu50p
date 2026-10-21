import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:url_launcher/url_launcher.dart';
import 'src/native_backend.dart';
import 'src/native_screens.dart';
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
final nativeBackend = NativeBackend.instance;

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
  final TextEditingController searchController = TextEditingController();
  bool searchOpen = false;
  int tab = 0;
  String category = '🔥';
  String country = 'All';
  String language = 'All';
  bool matchesCategory(Channel c) => category == '🔥' || category == 'All' || c.categories.any((v) => v.toLowerCase() == category.toLowerCase());
  void clearFilters() { searchController.clear(); setState(() { query=''; category='🔥'; country='All'; language='All'; libraryTab=0; }); }
  int libraryTab = 0; // 0 channels, 1 favourites, 2 history
  String guideCategory = 'all';
  void _openAccount() => Navigator.push(context, MaterialPageRoute(builder: (_) => const NativeAccountScreen()));
  void _openPremium() => Navigator.push(context, MaterialPageRoute(builder: (_) => const NativePremiumScreen()));
  void selectTab(int value) {
    if (value == 4) { setState(() => tab = value); return; }

    setState(() {
    tab = value;
    searchOpen = value == 1;
    if (value == 0 || value == 2 || value == 5) { category = '🔥'; libraryTab = 0; country='All'; }
    if (value == 3) { category = '🔥'; libraryTab = 0; country='All'; }
    if (value == 4) { category = '🔥'; libraryTab = 0; country='All'; }
    if (value == 6) { libraryTab = 0; category = '🔥'; }
    });
  }
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    catalogue.load();
    library.load();
    nativeBackend.addListener(refresh);
    unawaited(nativeBackend.restore());
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
    searchController.dispose();
    catalogue.removeListener(refresh);
    library.removeListener(refresh);
    nativeBackend.removeListener(refresh);
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final all = catalogue.channels;
    final countries = (all.map((c) => c.country).where((v) => v.isNotEmpty).toSet().toList()..sort());
    final languages = (all.expand((c) => c.languages).where((v) => v.isNotEmpty).toSet().toList()..sort());
    final q = query.trim().toLowerCase();
    final filteredChannels = all.where((c) =>
      (libraryTab == 0 || (libraryTab == 1 ? library.isFavorite(c.id) : library.wasWatched(c.id))) &&
      matchesCategory(c) && (country == 'All' || c.country == country) &&
      (language == 'All' || c.languages.contains(language)) &&
      (q.isEmpty || [c.name, c.country, ...c.categories, ...c.languages].any((v) => v.toLowerCase().contains(q)))).toList();
    final channels = tab == 3 ? (List<Channel>.from(filteredChannels)..sort((a,b) {
      final ai = library.history.indexOf(a.id), bi = library.history.indexOf(b.id);
      if (ai < 0 && bi < 0) return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      if (ai < 0) return 1; if (bi < 0) return -1; return ai.compareTo(bi);
    })) : filteredChannels;
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
          IconButton(tooltip:'Search channels',onPressed:(){ if(tab!=1) { selectTab(1); } else { setState(()=>searchOpen=!searchOpen); } },icon: const Icon(Icons.search)),
          IconButton(tooltip:'Refresh channels',onPressed:()=>catalogue.load(force:true),icon:const Icon(Icons.refresh)),
          PopupMenuButton<String>(tooltip:'Language',initialValue:language,itemBuilder:(_)=>['All',...languages].map((v)=>PopupMenuItem(value:v,child:Text(v))).toList(),onSelected:(v)=>setState(()=>language=v),child: Padding(padding:const EdgeInsets.symmetric(horizontal:8),child:Center(child:Text(language=='All'?'All⌄':'${language.toUpperCase()}⌄',style:const TextStyle(fontSize:12))))),
          IconButton(tooltip:'Open profile',onPressed:()=>selectTab(6),icon:const CircleAvatar(radius:17,backgroundColor:Color(0xFFDB4773),child:Icon(Icons.person,color:Colors.white,size:19))),
        ],
      ),
      bottomNavigationBar: SafeArea(top:false,child:Container(
        decoration:const BoxDecoration(color:Color(0xFF11131D),border:Border(top:BorderSide(color:Colors.white10))),
        child:NavigationBar(height:66,backgroundColor:const Color(0xFF11131D),indicatorColor:const Color(0xFF4B162A),selectedIndex:tab,labelBehavior:NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected:selectTab,
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
      body: tab == 6 ? _profileScreen(all.length) : tab == 4 ? _clipsNotice() : tab == 5 ? _guideScreen(all) : tab == 3 ? NativeHotScreen(channels: all) : Column(children:[
        if(searchOpen || tab==1) Padding(padding:const EdgeInsets.fromLTRB(12,10,12,6),child:TextField(controller:searchController,autofocus:tab==1,decoration:InputDecoration(hintText:'Search channels',prefixIcon:const Icon(Icons.search),suffixIcon:IconButton(tooltip:'Clear search',icon:const Icon(Icons.close),onPressed:(){searchController.clear();setState(()=>query='');}),filled:true,fillColor:const Color(0xFF1B1C24),border:OutlineInputBorder(borderRadius:BorderRadius.circular(18),borderSide:BorderSide.none)),onChanged:(v)=>setState(()=>query=v))),
        SizedBox(height:64,child:ListView(scrollDirection:Axis.horizontal,padding:const EdgeInsets.symmetric(horizontal:10,vertical:7),children:rail.map((entry){
          final selected=category==entry.$1 || category==entry.$2;
          return Padding(padding:const EdgeInsets.symmetric(horizontal:3),child:Tooltip(message:entry.$2,child:InkWell(borderRadius:BorderRadius.circular(30),onTap:()=>setState(()=>category=entry.$1=='🔥'?'🔥':entry.$2),child:Container(width:49,alignment:Alignment.center,decoration:BoxDecoration(shape:BoxShape.circle,color:selected?Colors.white:const Color(0xFF23242A)),child:Text(entry.$1,style:TextStyle(fontSize:22,color:selected?Colors.black:Colors.white))))));
        }).toList())),
        if(catalogue.loading) const LinearProgressIndicator(minHeight:2),
        if(catalogue.error!=null) Padding(padding:const EdgeInsets.all(10),child:Text('Catalogue: ${catalogue.error}',style:const TextStyle(color:Colors.orange))),
        if(tab==2) SizedBox(height:46,child:Row(children:[
          Padding(padding:const EdgeInsets.only(left:14),child:Text('Discover channels',style:const TextStyle(fontWeight:FontWeight.bold))),
          const Spacer(),DropdownButton<String>(value:countries.contains(country)?country:'All',items:['All',...countries].map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),onChanged:(v)=>setState(()=>country=v??'All')),
          const SizedBox(width:12),
        ])),
        Padding(padding:const EdgeInsets.symmetric(horizontal:10,vertical:4),child:Row(children:[for(final item in <(String,int)>[('Channels',0),('Favorites',1),('History',2)]) Padding(padding:const EdgeInsets.only(right:6),child:ChoiceChip(label:Text(item.$1,style:const TextStyle(fontSize:12)),selected:libraryTab==item.$2,onSelected:(_)=>setState(()=>libraryTab=item.$2))),const Spacer(),PopupMenuButton<String>(tooltip:'Country filter',initialValue:country,itemBuilder:(_)=>['All',...countries].map((v)=>PopupMenuItem(value:v,child:Text(v))).toList(),onSelected:(v)=>setState(()=>country=v),child:const Icon(Icons.public,size:20))])),
        Expanded(child:channels.isEmpty?Center(child:Column(mainAxisSize:MainAxisSize.min,children:[Text(catalogue.loading?'Loading channels…':'No matching channels. Try another category or clear filters.',textAlign:TextAlign.center),if(!catalogue.loading) TextButton(onPressed:clearFilters,child:const Text('Clear filters'))])):ListView.builder(
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



  Widget _profileScreen(int total) => ListView(padding:const EdgeInsets.fromLTRB(18,24,18,28),children:[
    const Center(child:CircleAvatar(radius:38,backgroundColor:Color(0xFFDB4773),child:Icon(Icons.person,color:Colors.white,size:42))),
    const SizedBox(height:12),const Center(child:Text('My TikVTV',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold))),
    const SizedBox(height:5),const Center(child:Text('Your local viewing profile',style:TextStyle(color:Colors.white54))),
    const SizedBox(height:20),
    Row(children:[
      Expanded(child:Card(color:const Color(0xFF191A20),child:Padding(padding:const EdgeInsets.all(14),child:Column(children:[const Icon(Icons.live_tv,color:Color(0xFFFF315F)),Text(total.toString(),style:const TextStyle(fontSize:21,fontWeight:FontWeight.bold)),const Text('Channels',style:TextStyle(color:Colors.white54,fontSize:12))])))),
      Expanded(child:Card(color:const Color(0xFF191A20),child:Padding(padding:const EdgeInsets.all(14),child:Column(children:[const Icon(Icons.favorite,color:Color(0xFFFF315F)),Text(catalogue.channels.where((c)=>library.isFavorite(c.id)).length.toString(),style:const TextStyle(fontSize:21,fontWeight:FontWeight.bold)),const Text('Favorites',style:TextStyle(color:Colors.white54,fontSize:12))])))),
      Expanded(child:Card(color:const Color(0xFF191A20),child:Padding(padding:const EdgeInsets.all(14),child:Column(children:[const Icon(Icons.history,color:Color(0xFFFF315F)),Text(library.history.length.toString(),style:const TextStyle(fontSize:21,fontWeight:FontWeight.bold)),const Text('History',style:TextStyle(color:Colors.white54,fontSize:12))])))),
    ]),
    const SizedBox(height:10),
    ListTile(leading:const Icon(Icons.favorite),title:const Text('Favorites'),subtitle:const Text('Your saved channels on this device'),trailing:const Icon(Icons.chevron_right),onTap:()=>setState(() {tab=0;libraryTab=1;query='';searchController.clear();searchOpen=false;category='🔥';country='All';})),
    ListTile(leading:const Icon(Icons.history),title:const Text('Watch history'),subtitle:const Text('Channels watched on this device'),trailing:const Icon(Icons.chevron_right),onTap:()=>setState(() {tab=0;libraryTab=2;query='';searchController.clear();searchOpen=false;category='🔥';country='All';})),
    ListTile(leading:const Icon(Icons.public),title:const Text('Explore countries'),trailing:const Icon(Icons.chevron_right),onTap:()=>selectTab(2)),
    ListTile(leading:const Icon(Icons.translate),title:const Text('Stream language'),subtitle:Text(language=='All'?'All languages':language),trailing:const Icon(Icons.chevron_right),onTap:_chooseLanguage),
    ListTile(leading:const Icon(Icons.workspace_premium),title:const Text('Premium / subscription'),subtitle:const Text('Manage subscription inside TikVTV'),trailing:const Icon(Icons.chevron_right),onTap:_openPremium),
    ListTile(leading:const Icon(Icons.account_circle_outlined),title:Text(nativeBackend.signedIn ? (nativeBackend.email ?? 'Account') : 'Account and sign in'),subtitle:Text(nativeBackend.signedIn ? 'Signed in on this device' : 'Sign in or create an account inside TikVTV'),trailing:const Icon(Icons.chevron_right),onTap:_openAccount),
    if(nativeBackend.signedIn) ListTile(leading:const Icon(Icons.logout),title:const Text('Sign out'),onTap:() async { await nativeBackend.signOut(); if(mounted) setState(() {}); }),
    ListTile(leading:const Icon(Icons.delete_outline),title:const Text('Clear watch history'),onTap:() async {
      final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:const Text('Clear watch history?'),content:const Text('This removes local watch history. Favorites remain saved.'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),TextButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Clear'))]));
      if(confirmed==true) await library.clearHistory();
    }),
  ]);

  Widget _guideScreen(List<Channel> all) {
    const categories = ['all','news','sports','entertainment','music','documentary'];
    final guideChannels = all.where((c) => (country == 'All' || c.country == country) &&
      (guideCategory == 'all' || c.categories.any((v) => v.toLowerCase() == guideCategory))).take(40).toList();
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Padding(padding:const EdgeInsets.fromLTRB(16,12,16,4),child:Row(children:[
        const Icon(Icons.calendar_month,color:Color(0xFFFF315F)),
        const SizedBox(width:8),const Expanded(child:Text('TV Schedule',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold))),
        Text(DateTime.now().toLocal().toString().substring(0,10),style:const TextStyle(color:Colors.white54,fontSize:12)),
      ])),
      const Padding(padding:EdgeInsets.symmetric(horizontal:16,vertical:4),child:Text('Channel guide · programme listings are shown only when schedule data is available',style:TextStyle(color:Colors.white54,fontSize:12))),
      SizedBox(height:48,child:ListView(scrollDirection:Axis.horizontal,padding:const EdgeInsets.symmetric(horizontal:12,vertical:5),children:[
        for(final cat in categories) Padding(padding:const EdgeInsets.only(right:6),child:ChoiceChip(label:Text(cat=='all'?'All Channels':cat[0].toUpperCase()+cat.substring(1)),selected:guideCategory==cat,onSelected:(_)=>setState(()=>guideCategory=cat))),
      ])),
      Expanded(child:guideChannels.isEmpty?const Center(child:Text('No channels match this guide filter.')):ListView.separated(
        padding:const EdgeInsets.fromLTRB(12,4,12,16),itemCount:guideChannels.length,separatorBuilder:(_,__)=>const SizedBox(height:8),
        itemBuilder:(context,index){
          final c=guideChannels[index];
          return Material(color:const Color(0xFF191A20),borderRadius:BorderRadius.circular(14),child:InkWell(borderRadius:BorderRadius.circular(14),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>ChannelScreen(channel:c))),child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[
            Container(width:54,height:54,decoration:BoxDecoration(color:Colors.white10,borderRadius:BorderRadius.circular(10)),padding:const EdgeInsets.all(5),child:c.logo.isEmpty?const Icon(Icons.live_tv):Image.network(c.logo,fit:BoxFit.contain,errorBuilder:(_,__,___)=>const Icon(Icons.live_tv))),
            const SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(c.name,maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontWeight:FontWeight.bold)),
              const SizedBox(height:5),Text(c.country.isEmpty ? 'Live stream available' : c.country,style:const TextStyle(fontSize:12,color:Colors.white70)),
              const SizedBox(height:3),const Text('Programme schedule unavailable for this channel',maxLines:2,overflow:TextOverflow.ellipsis,style:TextStyle(fontSize:11,color:Colors.white38)),
            ])),const Icon(Icons.chevron_right,color:Colors.white38),
          ]))));
        },
      )),
    ]);
  }

  Widget _clipsNotice() => Center(child:Padding(padding:const EdgeInsets.all(24),child:Column(mainAxisSize:MainAxisSize.min,children:[
    const Icon(Icons.movie_outlined,size:56,color:Colors.white54),
    const SizedBox(height:16),const Text('Clips',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
    const SizedBox(height:8),const Text('Clip storage is disabled as requested. Live TV playback does not record or upload your streams.',textAlign:TextAlign.center,style:TextStyle(color:Colors.white60)),
    const SizedBox(height:18),FilledButton.icon(onPressed:()=>selectTab(0),icon:const Icon(Icons.live_tv),label:const Text('Watch live TV')),
  ])));

  void _chooseLanguage() {
    final availableLanguages = catalogue.channels.expand((c) => c.languages).where((v) => v.isNotEmpty).toSet().toList()..sort();
    showModalBottomSheet<void>(context:context,showDragHandle:true,builder:(ctx)=>SafeArea(child:ListView(shrinkWrap:true,children:[for(final lang in ['All',...availableLanguages]) ListTile(title:Text(lang=='All'?'All languages':lang),trailing:language==lang?const Icon(Icons.check,color:Color(0xFFFF315F)):null,onTap:(){setState(()=>language=lang);Navigator.pop(ctx);})])));
  }



class ChannelScreen extends StatefulWidget {
  final Channel channel;
  const ChannelScreen({super.key, required this.channel});
  @override
  State<ChannelScreen> createState() => _ChannelScreenState();
}

class _ChannelScreenState extends State<ChannelScreen> {
  bool _landscape = false;
  Future<void> _setLandscape(bool enabled) async {
    await SystemChrome.setPreferredOrientations(enabled
      ? [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]
      : [DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
    await SystemChrome.setEnabledSystemUIMode(enabled ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge);
    if (mounted) setState(() => _landscape = enabled);
  }

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
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final controller = playback.controller;
    final selected = playback.channel?.id == widget.channel.id;
    return Scaffold(
      appBar: _landscape ? null : AppBar(title: Text(widget.channel.name), actions: [
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
      body: SafeArea(child: _landscape ? Center(child: AspectRatio(aspectRatio: 16 / 9, child: _player(controller, selected))) : ListView(children: [
        AspectRatio(aspectRatio: 16 / 9, child: _player(controller, selected)),
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

  Widget _player(VideoPlayerController? controller, bool selected) => ColoredBox(color: Colors.black,
    child: Stack(fit: StackFit.expand, children: [
      if (selected && controller != null && controller.value.isInitialized)
        Center(child: AspectRatio(aspectRatio: controller.value.aspectRatio > 0 ? controller.value.aspectRatio : 16 / 9, child: VideoPlayer(controller)))
      else Center(child: playback.error != null && !playback.loading
        ? Text(playback.error!, textAlign: TextAlign.center) : const CircularProgressIndicator()),
      if (playback.buffering) const Center(child: CircularProgressIndicator()),
      Positioned(right: 8, bottom: 8, child: IconButton.filledTonal(
        tooltip: _landscape ? 'Exit landscape fullscreen' : 'Landscape fullscreen',
        onPressed: () => _setLandscape(!_landscape),
        icon: Icon(_landscape ? Icons.fullscreen_exit : Icons.fullscreen))),
      if (_landscape) Positioned(top: 8, left: 8, child: IconButton.filledTonal(
        tooltip: 'Return to portrait', onPressed: () => _setLandscape(false), icon: const Icon(Icons.arrow_back))),
    ]));
}
